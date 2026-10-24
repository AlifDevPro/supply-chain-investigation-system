-- Phase 4: AI-extracted candidate facts from signal text (signal-extraction.v1). Each row is one extraction
-- attempt series for one signal. Only validated, grounded fields and safe failure codes are stored; raw model
-- output is never stored. Rows are history: append-only. SYNTHETIC DATA ONLY.

create table ai_extractions (
  tenant_id      text not null references tenants (id),
  id             text not null,
  signal_id      text not null,
  provider       text not null check (provider in ('mock', 'ollama')),
  model          text not null check (char_length(model) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 60),
  status         text not null check (status in ('completed', 'invalid_output', 'unavailable', 'timeout')),
  failure        text check (failure is null or char_length(failure) <= 60),
  fields         jsonb not null check (jsonb_typeof(fields) = 'array' and octet_length(fields::text) <= 8192),
  rejected       jsonb not null check (jsonb_typeof(rejected) = 'array' and octet_length(rejected::text) <= 2048),
  comparison     jsonb not null check (jsonb_typeof(comparison) = 'array' and octet_length(comparison::text) <= 4096),
  input_chars    integer not null check (input_chars >= 0),
  output_chars   integer not null check (output_chars >= 0),
  input_tokens   integer check (input_tokens is null or input_tokens >= 0),
  output_tokens  integer check (output_tokens is null or output_tokens >= 0),
  latency_ms     integer not null check (latency_ms >= 0),
  attempts       integer not null check (attempts between 1 and 3),
  created_at     timestamptz not null default clock_timestamp(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, signal_id) references signals (tenant_id, id),
  constraint ai_extractions_status_shape check (
    (status = 'completed' and failure is null) or
    (status <> 'completed' and failure is not null and jsonb_array_length(fields) = 0)
  )
);

create index ai_extractions_signal_idx on ai_extractions (tenant_id, signal_id, created_at desc);

-- reject_history_mutation() is defined in 0003.
create trigger ai_extractions_no_update_delete before update or delete on ai_extractions
  for each row execute function reject_history_mutation();
create trigger ai_extractions_no_truncate before truncate on ai_extractions
  for each statement execute function reject_history_mutation();

alter table ai_extractions enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table ai_extractions from %I', role_name);
    end if;
  end loop;
end
$$;
