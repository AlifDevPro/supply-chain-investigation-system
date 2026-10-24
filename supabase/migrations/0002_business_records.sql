-- Phase 3: SYNTHETIC business records (the "system of record" the investigation retrieves evidence from).
-- The application only reads these through a tenant-scoped retrieval interface; only the seed script writes.
-- Every row carries tenant_id, a record_version and updated_at for provenance, and data_mode = 'synthetic'.

create table suppliers (
  tenant_id      text not null references tenants (id),
  id             text not null,
  name           text not null,
  record_version integer not null default 1 check (record_version >= 1),
  updated_at     timestamptz not null default now(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id)
);

create table materials (
  tenant_id      text not null references tenants (id),
  id             text not null,
  description    text not null,
  -- Specification that must match before quantities are comparable (e.g. colour, weight, width).
  variant        text not null,
  base_unit      text not null check (base_unit in ('m', 'yd', 'kg', 'pcs')),
  record_version integer not null default 1 check (record_version >= 1),
  updated_at     timestamptz not null default now(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id)
);

create table locations (
  tenant_id      text not null references tenants (id),
  id             text not null,
  name           text not null,
  kind           text not null check (kind in ('factory', 'warehouse')),
  record_version integer not null default 1 check (record_version >= 1),
  updated_at     timestamptz not null default now(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id)
);

create table purchase_orders (
  tenant_id      text not null references tenants (id),
  id             text not null,
  supplier_id    text not null,
  status         text not null check (status in ('open', 'partially_received', 'received', 'cancelled')),
  record_version integer not null default 1 check (record_version >= 1),
  updated_at     timestamptz not null default now(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, supplier_id) references suppliers (tenant_id, id)
);

create table purchase_order_lines (
  tenant_id               text not null references tenants (id),
  purchase_order_id       text not null,
  line_no                 integer not null check (line_no >= 1),
  material_id             text not null,
  quantity                numeric(14, 3) not null check (quantity >= 0),
  unit                    text not null check (unit in ('m', 'yd', 'kg', 'pcs')),
  promised_date           date not null,
  destination_location_id text not null,
  record_version          integer not null default 1 check (record_version >= 1),
  updated_at              timestamptz not null default now(),
  data_mode               text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, purchase_order_id, line_no),
  foreign key (tenant_id, purchase_order_id) references purchase_orders (tenant_id, id),
  foreign key (tenant_id, material_id) references materials (tenant_id, id),
  foreign key (tenant_id, destination_location_id) references locations (tenant_id, id)
);

create table production_orders (
  tenant_id      text not null references tenants (id),
  id             text not null,
  location_id    text not null,
  due_date       date not null,
  status         text not null check (status in ('planned', 'released', 'in_progress', 'completed', 'cancelled')),
  record_version integer not null default 1 check (record_version >= 1),
  updated_at     timestamptz not null default now(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, location_id) references locations (tenant_id, id)
);

create table production_requirements (
  tenant_id           text not null references tenants (id),
  production_order_id text not null,
  material_id         text not null,
  quantity            numeric(14, 3) not null check (quantity >= 0),
  unit                text not null check (unit in ('m', 'yd', 'kg', 'pcs')),
  required_by         date not null,
  record_version      integer not null default 1 check (record_version >= 1),
  updated_at          timestamptz not null default now(),
  data_mode           text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, production_order_id, material_id),
  foreign key (tenant_id, production_order_id) references production_orders (tenant_id, id),
  foreign key (tenant_id, material_id) references materials (tenant_id, id)
);

create table inventory_balances (
  tenant_id      text not null references tenants (id),
  id             text not null,
  material_id    text not null,
  location_id    text not null,
  lot            text,
  on_hand        numeric(14, 3) not null check (on_hand >= 0),
  unit           text not null check (unit in ('m', 'yd', 'kg', 'pcs')),
  quality_status text not null check (quality_status in ('released', 'hold', 'unknown')),
  counted_at     timestamptz not null,
  record_version integer not null default 1 check (record_version >= 1),
  updated_at     timestamptz not null default now(),
  data_mode      text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, material_id) references materials (tenant_id, id),
  foreign key (tenant_id, location_id) references locations (tenant_id, id)
);

create table inventory_reservations (
  tenant_id           text not null references tenants (id),
  id                  text not null,
  material_id         text not null,
  location_id         text not null,
  production_order_id text not null,
  quantity            numeric(14, 3) not null check (quantity >= 0),
  unit                text not null check (unit in ('m', 'yd', 'kg', 'pcs')),
  record_version      integer not null default 1 check (record_version >= 1),
  updated_at          timestamptz not null default now(),
  data_mode           text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, material_id) references materials (tenant_id, id),
  foreign key (tenant_id, location_id) references locations (tenant_id, id),
  foreign key (tenant_id, production_order_id) references production_orders (tenant_id, id)
);

create table shipments (
  tenant_id         text not null references tenants (id),
  id                text not null,
  purchase_order_id text not null,
  status            text not null check (status in ('booked', 'in_transit', 'delayed', 'delivered', 'cancelled')),
  eta               date,
  quantity          numeric(14, 3) check (quantity is null or quantity >= 0),
  unit              text check (unit is null or unit in ('m', 'yd', 'kg', 'pcs')),
  record_version    integer not null default 1 check (record_version >= 1),
  updated_at        timestamptz not null default now(),
  data_mode         text not null check (data_mode = 'synthetic'),
  primary key (tenant_id, id),
  foreign key (tenant_id, purchase_order_id) references purchase_orders (tenant_id, id),
  check ((quantity is null) = (unit is null))
);

create index production_requirements_material_idx on production_requirements (tenant_id, material_id, required_by);
create index inventory_balances_material_idx on inventory_balances (tenant_id, material_id);
create index inventory_balances_lot_idx on inventory_balances (tenant_id, lot) where lot is not null;
create index inventory_reservations_material_idx on inventory_reservations (tenant_id, material_id, location_id);
create index shipments_po_idx on shipments (tenant_id, purchase_order_id);

alter table suppliers               enable row level security;
alter table materials               enable row level security;
alter table locations               enable row level security;
alter table purchase_orders         enable row level security;
alter table purchase_order_lines    enable row level security;
alter table production_orders       enable row level security;
alter table production_requirements enable row level security;
alter table inventory_balances      enable row level security;
alter table inventory_reservations  enable row level security;
alter table shipments               enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table suppliers, materials, locations, purchase_orders, purchase_order_lines,
           production_orders, production_requirements, inventory_balances, inventory_reservations, shipments
         from %I', role_name);
    end if;
  end loop;
end
$$;
