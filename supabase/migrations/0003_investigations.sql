-- Phase 3: investigation cases and immutable investigation runs (evidence, claims, unknowns, conflicts,
-- impact calculations). A case row holds the current state; every analysis is a new run, so history is never
-- rewritten. SYNTHETIC DATA ONLY.

create sequence case_number_seq start 3001;

create table cases (
  tenant_id       text not null references tenants (id),
  id              text not null,
  title           text not null,
  summary         text not null,
  state           text not null check (state in (
    'received', 'triaging', 'investigating', 'needs_review', 'awaiting_approval', 'approved', 'executing',
    'awaiting_verification', 'resolved', 'rejected', 'dismissed', 'failed', 'cancelled', 'blocked')),
  severity        text not null check (severity in ('critical', 'high', 'medium', 'low')),
  owner_name      text not null,
  owner_role      text not null,
  next_action     text not null,
  requires_review boolean not null,
  review_reason   text,
  origin          text not null check (origin in ('automatic', 'operator')),
  -- Union of the references of linked signals; used to relate new signals to this open case.
  reference_keys  jsonb not null default '{}'::jsonb check (jsonb_typeof(reference_keys) = 'object'),
  latest_run_id   text,
  opened_at       timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  data_mode       text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id)
);

create index cases_tenant_updated_idx on cases (tenant_id, updated_at desc);

create table case_signals (
  tenant_id   text not null references tenants (id),
  case_id     text not null,
  signal_id   text not null,
  link_reason text not null check (link_reason in ('origin', 'related_reference', 'operator_opened')),
  linked_at   timestamptz not null default clock_timestamp(),
  data_mode   text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, case_id, signal_id),
  foreign key (tenant_id, case_id) references cases (tenant_id, id),
  foreign key (tenant_id, signal_id) references signals (tenant_id, id)
);

-- A signal belongs to at most one case.
create unique index case_signals_signal_uq on case_signals (tenant_id, signal_id);

create table investigation_runs (
  tenant_id         text not null references tenants (id),
  id                text not null,
  case_id           text not null,
  run_number        integer not null check (run_number >= 1),
  trigger           text not null check (trigger in ('signal', 'related_signal', 'operator_open', 'operator_rerun', 'backfill')),
  trigger_signal_id text,
  rule_versions     jsonb not null check (jsonb_typeof(rule_versions) = 'object'),
  -- Retrieval accounting: calls, rows, truncation, budget. Counts only, no record content.
  retrieval         jsonb not null check (jsonb_typeof(retrieval) = 'object'),
  -- Entity graph for this run (ids, kinds, labels, verified/inferred edges).
  entities          jsonb not null check (jsonb_typeof(entities) = 'object'),
  started_at        timestamptz not null,
  finished_at       timestamptz not null,
  data_mode         text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  unique (tenant_id, case_id, run_number),
  foreign key (tenant_id, case_id) references cases (tenant_id, id),
  foreign key (tenant_id, trigger_signal_id) references signals (tenant_id, id)
);

create table evidence_items (
  tenant_id           text not null references tenants (id),
  id                  text not null,
  run_id              text not null,
  case_id             text not null,
  position            integer not null,
  source_system       text not null,
  source_type         text not null,
  source_table        text,
  source_record_id    text not null,
  title               text not null,
  excerpt             text not null check (char_length(excerpt) <= 600),
  field_location      text not null,
  observed_at         timestamptz not null,
  source_reported_at  timestamptz,
  record_version      text not null,
  extraction_method   text not null check (extraction_method in ('system_record', 'deterministic_rule', 'ai_extraction', 'manual_entry')),
  verification_status text not null check (verification_status in ('verified', 'reported', 'inferred', 'assumed', 'unknown', 'conflicted', 'stale')),
  data_mode           text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, run_id) references investigation_runs (tenant_id, id)
);

create table claims (
  tenant_id    text not null references tenants (id),
  id           text not null,
  run_id       text not null,
  case_id      text not null,
  position     integer not null,
  statement    text not null,
  state        text not null check (state in ('verified', 'reported', 'inferred', 'assumed', 'unknown', 'conflicted', 'stale')),
  basis        text not null,
  evidence_ids jsonb not null check (jsonb_typeof(evidence_ids) = 'array'),
  data_mode    text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, run_id) references investigation_runs (tenant_id, id)
);

create table unknowns (
  tenant_id           text not null references tenants (id),
  id                  text not null,
  run_id              text not null,
  case_id             text not null,
  position            integer not null,
  description         text not null,
  why_it_matters      text not null,
  suggested_retrieval text not null,
  data_mode           text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, run_id) references investigation_runs (tenant_id, id)
);

create table conflicts (
  tenant_id   text not null references tenants (id),
  id          text not null,
  run_id      text not null,
  case_id     text not null,
  position    integer not null,
  description text not null,
  sides       jsonb not null check (jsonb_typeof(sides) = 'array' and jsonb_array_length(sides) >= 2),
  data_mode   text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, run_id) references investigation_runs (tenant_id, id)
);

create table impact_calculations (
  tenant_id     text not null references tenants (id),
  id            text not null,
  run_id        text not null,
  case_id       text not null,
  kind          text not null check (kind in ('shortage', 'delivery_risk')),
  rule_version  text not null,
  status        text not null check (status in ('verified', 'provisional', 'incalculable')),
  calculated_at timestamptz not null,
  -- Full deterministic output: inputs with evidence ids, assumptions, missing evidence, conflicts, result.
  result        jsonb not null check (jsonb_typeof(result) = 'object'),
  data_mode     text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  unique (tenant_id, run_id, kind),
  foreign key (tenant_id, run_id) references investigation_runs (tenant_id, id)
);

create index investigation_runs_case_idx on investigation_runs (tenant_id, case_id, run_number desc);
create index evidence_items_run_idx on evidence_items (tenant_id, run_id, position);
create index claims_run_idx on claims (tenant_id, run_id, position);
create index unknowns_run_idx on unknowns (tenant_id, run_id, position);
create index conflicts_run_idx on conflicts (tenant_id, run_id, position);

-- Events may now reference a case of the SAME tenant.
alter table signal_events
  add constraint signal_events_case_fk foreign key (tenant_id, case_id) references cases (tenant_id, id);
create index signal_events_tenant_case_idx on signal_events (tenant_id, case_id) where case_id is not null;

-- Runs and their findings are history: append-only. Cases and links may not be deleted.
create function reject_history_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only (% not allowed)', tg_table_name, tg_op using errcode = '42501';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['investigation_runs', 'evidence_items', 'claims', 'unknowns', 'conflicts', 'impact_calculations'] loop
    execute format('create trigger %I before update or delete on %I for each row execute function reject_history_mutation()',
                   t || '_no_update_delete', t);
    execute format('create trigger %I before truncate on %I for each statement execute function reject_history_mutation()',
                   t || '_no_truncate', t);
  end loop;
  foreach t in array array['cases', 'case_signals'] loop
    execute format('create trigger %I before delete on %I for each row execute function reject_history_mutation()',
                   t || '_no_delete', t);
    execute format('create trigger %I before truncate on %I for each statement execute function reject_history_mutation()',
                   t || '_no_truncate', t);
  end loop;
end
$$;

alter table cases               enable row level security;
alter table case_signals        enable row level security;
alter table investigation_runs  enable row level security;
alter table evidence_items      enable row level security;
alter table claims              enable row level security;
alter table unknowns            enable row level security;
alter table conflicts           enable row level security;
alter table impact_calculations enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table cases, case_signals, investigation_runs, evidence_items, claims, unknowns, conflicts,
           impact_calculations from %I', role_name);
      execute format('revoke all on sequence case_number_seq from %I', role_name);
    end if;
  end loop;
end
$$;
