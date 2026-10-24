-- Phase 2: signal ingestion, deduplication, triage outcomes and the append-only event log.
-- SYNTHETIC DATA ONLY in this phase (data_mode is constrained to 'synthetic').
-- Applied by `npm run db:migrate`, which records this file in app_migrations.

create table tenants (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

create sequence signal_number_seq start 9001;

create table signals (
  id                   text primary key,
  tenant_id            text not null references tenants (id),
  correlation_id       text not null,
  received_at          timestamptz not null default clock_timestamp(),
  processing_status    text not null
    check (processing_status in ('rejected', 'duplicate', 'triaged', 'held_for_review')),

  -- Identity and normalized view. Null for rejected submissions (nothing trustworthy to store).
  source_type          text,
  source_system        text,
  source_record_id     text,
  label                text,
  normalized           jsonb,
  -- The submitted JSON exactly as parsed. Never rewritten by normalization.
  raw                  jsonb check (raw is null or octet_length(raw::text) <= 16384),

  content_hash         text,
  fingerprint          text,

  dedupe_status        text check (dedupe_status in ('unique', 'duplicate', 'revision')),
  dedupe_rule          text,
  duplicate_of         text references signals (id),
  revision_of          text references signals (id),
  possibly_related     jsonb not null default '[]'::jsonb,

  triage_outcome       text
    check (triage_outcome in ('irrelevant', 'relevant', 'uncertain', 'related_existing', 'high_impact')),
  triage_rule_id       text,
  triage_rule_version  text,
  triage_reason_codes  jsonb not null default '[]'::jsonb,
  related_case_ids     jsonb not null default '[]'::jsonb,
  requires_review      boolean not null default false,

  -- Present only for rejected submissions: field paths and error codes, never values.
  rejection            jsonb,

  data_mode            text not null check (data_mode = 'synthetic'),

  constraint signals_tenant_id_uq unique (tenant_id, id),
  constraint signals_rejected_shape check (
    (processing_status = 'rejected'
       and rejection is not null and normalized is null and raw is null
       and content_hash is null and dedupe_status is null)
    or
    (processing_status <> 'rejected'
       and rejection is null and normalized is not null and raw is not null
       and content_hash is not null and fingerprint is not null and dedupe_status is not null)
  ),
  constraint signals_duplicate_shape check (
    (processing_status = 'duplicate') = (dedupe_status = 'duplicate')
    and ((dedupe_status = 'duplicate') = (duplicate_of is not null))
  ),
  constraint signals_triage_shape check (
    processing_status in ('rejected', 'duplicate') or triage_outcome is not null
  )
);

create index signals_tenant_received_idx on signals (tenant_id, received_at desc);
create index signals_tenant_correlation_idx on signals (tenant_id, correlation_id);
create index signals_tenant_fingerprint_idx on signals (tenant_id, fingerprint) where fingerprint is not null;
create index signals_tenant_record_idx on signals (tenant_id, source_system, source_record_id)
  where source_record_id is not null;

-- Backstop for dedupe.v1 rule 1: at most one canonical row per (record id, content).
-- The advisory lock taken by the application serializes concurrent identical submissions first.
create unique index signals_canonical_record_content_uq
  on signals (tenant_id, source_system, source_record_id, content_hash)
  where source_record_id is not null and dedupe_status in ('unique', 'revision');

create table signal_events (
  id             text primary key,
  sequence       bigint generated always as identity,
  tenant_id      text not null references tenants (id),
  case_id        text,
  signal_id      text,
  correlation_id text not null,
  type           text not null,
  stage          text not null,
  status         text not null check (status in ('completed', 'failed', 'retrying', 'waiting', 'skipped')),
  -- Server-generated. The application passes its own clock; this default is only a safety net.
  occurred_at    timestamptz not null default clock_timestamp(),
  duration_ms    integer check (duration_ms is null or duration_ms >= 0),
  method_kind    text check (method_kind in ('rule', 'model', 'system')),
  method_name    text,
  retry_count    integer not null default 0 check (retry_count >= 0),
  error_class    text check (error_class in
    ('validation_error', 'source_unavailable', 'timeout', 'authorization_denied', 'internal_error')),
  metadata       jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048),
  data_mode      text not null check (data_mode = 'synthetic'),
  constraint signal_events_method_pair check ((method_kind is null) = (method_name is null)),
  -- An event can only reference a signal of the SAME tenant (MATCH SIMPLE: skipped when signal_id is null).
  constraint signal_events_signal_fk foreign key (tenant_id, signal_id) references signals (tenant_id, id)
);

create unique index signal_events_sequence_uq on signal_events (sequence);
create index signal_events_tenant_occurred_idx on signal_events (tenant_id, occurred_at desc, sequence desc);
create index signal_events_tenant_correlation_idx on signal_events (tenant_id, correlation_id);
create index signal_events_tenant_signal_idx on signal_events (tenant_id, signal_id);

-- Events are an audit trail: append-only.
create function reject_event_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'signal_events is append-only (% not allowed)', tg_op using errcode = '42501';
end;
$$;

create trigger signal_events_no_update_delete
  before update or delete on signal_events
  for each row execute function reject_event_mutation();

create trigger signal_events_no_truncate
  before truncate on signal_events
  for each statement execute function reject_event_mutation();

-- Supabase exposes `public` tables through its REST API. The application connects directly with the
-- database owner role (which bypasses RLS) and enforces tenant scope in its repository layer.
-- RLS is enabled with NO policies so the REST roles can read and write nothing.
alter table tenants       enable row level security;
alter table signals       enable row level security;
alter table signal_events enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table tenants, signals, signal_events from %I', role_name);
      execute format('revoke all on sequence signal_number_seq from %I', role_name);
    end if;
  end loop;
end
$$;
