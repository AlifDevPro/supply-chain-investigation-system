-- Phase 5: signed-in users, review decisions, versioned proposed actions, approvals, synthetic
-- executions and independent outcome observations. SYNTHETIC DATA ONLY.

create table users (
  tenant_id      text not null references tenants (id),
  id             text not null,
  email          text not null check (char_length(email) between 3 and 120),
  display_name   text not null check (char_length(display_name) between 1 and 80),
  role           text not null check (role in ('reviewer', 'procurement', 'manager')),
  password_hash  text not null check (char_length(password_hash) between 20 and 400),
  disabled_at    timestamptz,
  created_at     timestamptz not null default clock_timestamp(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  unique (tenant_id, email)
);

create table review_decisions (
  tenant_id      text not null references tenants (id),
  id             text not null,
  case_id        text,
  signal_id      text,
  decision       text not null check (decision in ('acknowledge', 'request_evidence', 'dismiss', 'reject')),
  rationale      text not null check (char_length(rationale) between 1 and 600),
  actor_user_id  text not null,
  at             timestamptz not null default clock_timestamp(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references users (tenant_id, id),
  foreign key (tenant_id, case_id) references cases (tenant_id, id),
  constraint review_decisions_target check (case_id is not null or signal_id is not null)
);

create table proposed_actions (
  tenant_id          text not null references tenants (id),
  id                 text not null,
  case_id            text not null,
  title              text not null check (char_length(title) between 1 and 200),
  parameters         jsonb not null check (jsonb_typeof(parameters) = 'array' and octet_length(parameters::text) <= 4096),
  parameter_digest   text not null check (char_length(parameter_digest) = 64),
  rationale          text not null check (char_length(rationale) between 1 and 600),
  origin             text not null check (origin = 'rule_suggested'),
  status             text not null check (status in (
    'proposed', 'awaiting_approval', 'approved', 'rejected', 'executing', 'executed', 'failed', 'outcome_verified')),
  version            integer not null check (version >= 1),
  required_role      text not null check (required_role in ('reviewer', 'procurement', 'manager')),
  updated_at         timestamptz not null default clock_timestamp(),
  data_mode          text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, case_id) references cases (tenant_id, id)
);

create table action_approvals (
  tenant_id          text not null references tenants (id),
  id                 text not null,
  action_id          text not null,
  approved_version   integer not null check (approved_version >= 1),
  parameter_digest   text not null check (char_length(parameter_digest) = 64),
  actor_user_id      text not null,
  at                 timestamptz not null default clock_timestamp(),
  data_mode          text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, action_id) references proposed_actions (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references users (tenant_id, id)
);

create table action_executions (
  tenant_id          text not null references tenants (id),
  id                 text not null,
  action_id          text not null,
  action_version     integer not null check (action_version >= 1),
  adapter            text not null check (adapter = 'synthetic.v1'),
  status             text not null check (status in ('started', 'completed', 'failed')),
  sent               boolean not null,
  reason             text not null check (char_length(reason) between 1 and 200),
  idempotency_key    text not null,
  actor_user_id      text not null,
  at                 timestamptz not null default clock_timestamp(),
  data_mode          text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, action_id) references proposed_actions (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references users (tenant_id, id)
);

create table outcome_observations (
  tenant_id          text not null references tenants (id),
  id                 text not null,
  case_id            text not null,
  action_id          text,
  summary            text not null check (char_length(summary) between 1 and 600),
  matched            boolean not null,
  actor_user_id      text not null,
  at                 timestamptz not null default clock_timestamp(),
  data_mode          text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, case_id) references cases (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references users (tenant_id, id)
);

create index review_decisions_case_idx on review_decisions (tenant_id, case_id, at desc);
create index proposed_actions_case_idx on proposed_actions (tenant_id, case_id);
create index action_approvals_action_idx on action_approvals (tenant_id, action_id, at desc);
create index action_executions_action_idx on action_executions (tenant_id, action_id, at desc);
create index outcome_observations_case_idx on outcome_observations (tenant_id, case_id, at desc);

create trigger users_no_delete before delete on users
  for each row execute function reject_history_mutation();
create trigger users_no_truncate before truncate on users
  for each statement execute function reject_history_mutation();

do $$
declare
  t text;
begin
  foreach t in array array['review_decisions', 'action_approvals', 'action_executions', 'outcome_observations'] loop
    execute format('create trigger %I before update or delete on %I for each row execute function reject_history_mutation()',
                   t || '_no_update_delete', t);
    execute format('create trigger %I before truncate on %I for each statement execute function reject_history_mutation()',
                   t || '_no_truncate', t);
  end loop;
  execute format('create trigger proposed_actions_no_delete before delete on proposed_actions for each row execute function reject_history_mutation()');
  execute format('create trigger proposed_actions_no_truncate before truncate on proposed_actions for each statement execute function reject_history_mutation()');
end
$$;

alter table users enable row level security;
alter table review_decisions enable row level security;
alter table proposed_actions enable row level security;
alter table action_approvals enable row level security;
alter table action_executions enable row level security;
alter table outcome_observations enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table users, review_decisions, proposed_actions, action_approvals, action_executions, outcome_observations from %I',
        role_name);
    end if;
  end loop;
end
$$;
