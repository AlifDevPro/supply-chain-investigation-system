-- Phase 6: MCP tool-call audit and HTTPS connector runs. Append-only. SYNTHETIC DATA ONLY.

create table tool_calls (
  tenant_id      text not null references tenants (id),
  id             text not null,
  tool_name      text not null check (char_length(tool_name) between 1 and 80),
  status         text not null check (status in ('completed', 'failed', 'unauthorized')),
  duration_ms    integer check (duration_ms is null or duration_ms >= 0),
  actor_kind     text not null check (actor_kind in ('mcp_key', 'session', 'stdio')),
  actor_id       text not null check (char_length(actor_id) between 1 and 80),
  error_class    text check (error_class is null or error_class in (
    'validation_error', 'source_unavailable', 'timeout', 'authorization_denied', 'internal_error')),
  metadata       jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048),
  at             timestamptz not null default clock_timestamp(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id)
);

create table connector_runs (
  tenant_id           text not null references tenants (id),
  id                  text not null,
  connector_id        text not null check (connector_id in ('mailbox', 'erp_po', 'carrier')),
  status              text not null check (status in ('completed', 'failed', 'skipped')),
  http_status_class   text check (http_status_class is null or http_status_class in ('2xx', '4xx', '5xx', 'network')),
  signals_ingested    integer not null default 0 check (signals_ingested >= 0),
  error_class         text check (error_class is null or error_class in (
    'validation_error', 'source_unavailable', 'timeout', 'authorization_denied', 'internal_error')),
  duration_ms         integer check (duration_ms is null or duration_ms >= 0),
  actor_user_id       text,
  metadata            jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048),
  at                  timestamptz not null default clock_timestamp(),
  data_mode           text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references users (tenant_id, id)
);

create index tool_calls_at_idx on tool_calls (tenant_id, at desc);
create index connector_runs_at_idx on connector_runs (tenant_id, at desc);
create index connector_runs_connector_idx on connector_runs (tenant_id, connector_id, at desc);

create trigger tool_calls_no_update_delete before update or delete on tool_calls
  for each row execute function reject_history_mutation();
create trigger tool_calls_no_truncate before truncate on tool_calls
  for each statement execute function reject_history_mutation();
create trigger connector_runs_no_update_delete before update or delete on connector_runs
  for each row execute function reject_history_mutation();
create trigger connector_runs_no_truncate before truncate on connector_runs
  for each statement execute function reject_history_mutation();

alter table tool_calls enable row level security;
alter table connector_runs enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table tool_calls, connector_runs from %I', role_name);
    end if;
  end loop;
end
$$;
