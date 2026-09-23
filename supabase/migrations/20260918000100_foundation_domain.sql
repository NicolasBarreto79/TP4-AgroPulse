create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create type public.membership_role as enum ('producer', 'operator', 'advisor');
create type public.plot_status as enum ('stale', 'dry', 'optimal', 'wet');
create type public.valve_status as enum ('closed', 'open');
create type public.irrigation_command_status as enum ('pending', 'applied', 'failed', 'cancelled');
create type public.alert_kind as enum ('low_moisture', 'station_stale');
create type public.alert_status as enum ('open', 'resolved');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.plots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  geom extensions.geometry(Polygon, 4326) not null,
  threshold_min numeric(5,2) not null default 25,
  threshold_max numeric(5,2) not null default 45,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id),
  check (threshold_min >= 0 and threshold_max <= 100 and threshold_min < threshold_max)
);
create index plots_organization_idx on public.plots(organization_id);
create index plots_geom_gix on public.plots using gist(geom);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plot_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plot_id, name),
  unique (id, organization_id),
  foreign key (plot_id, organization_id) references public.plots(id, organization_id) on delete cascade
);
create index stations_organization_idx on public.stations(organization_id);

create table public.readings (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null,
  moisture_pct numeric(5,2) not null check (moisture_pct between 0 and 100),
  temperature_c numeric(5,2),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (station_id, recorded_at),
  foreign key (station_id, organization_id) references public.stations(id, organization_id) on delete cascade
);
create index readings_station_recorded_idx on public.readings(station_id, recorded_at desc);
create index readings_retention_idx on public.readings(recorded_at);
create index readings_organization_idx on public.readings(organization_id);

create table public.valves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plot_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  status public.valve_status not null default 'closed',
  updated_at timestamptz not null default now(),
  unique (plot_id, name),
  unique (id, organization_id),
  foreign key (plot_id, organization_id) references public.plots(id, organization_id) on delete cascade
);
create index valves_organization_idx on public.valves(organization_id);

create table public.irrigation_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  valve_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid not null unique,
  action public.valve_status not null,
  duration_minutes integer,
  status public.irrigation_command_status not null default 'pending',
  failure_reason text,
  accepted_at timestamptz not null default now(),
  dispatch_deadline_at timestamptz not null default (now() + interval '1 second'),
  applied_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (valve_id, organization_id) references public.valves(id, organization_id) on delete restrict,
  check (
    (action = 'open' and duration_minutes between 1 and 120)
    or (action = 'closed' and duration_minutes is null)
  ),
  check ((status = 'failed' and failure_reason is not null) or status <> 'failed')
);
create unique index irrigation_commands_one_pending_per_valve_idx
  on public.irrigation_commands(valve_id) where status = 'pending';
create index irrigation_commands_organization_created_idx
  on public.irrigation_commands(organization_id, accepted_at desc);

create table public.command_outbox (
  id bigint generated always as identity primary key,
  command_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic text not null default 'irrigation.commands' check (topic = 'irrigation.commands'),
  payload jsonb not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  published_at timestamptz,
  expired_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  foreign key (command_id, organization_id) references public.irrigation_commands(id, organization_id) on delete cascade
);
create index command_outbox_dispatch_idx
  on public.command_outbox(available_at, id)
  where published_at is null and expired_at is null;

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plot_id uuid,
  station_id uuid,
  kind public.alert_kind not null,
  status public.alert_status not null default 'open',
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (plot_id is not null or station_id is not null),
  foreign key (plot_id, organization_id) references public.plots(id, organization_id) on delete cascade,
  foreign key (station_id, organization_id) references public.stations(id, organization_id) on delete cascade
);
create index alerts_organization_status_idx on public.alerts(organization_id, status, created_at desc);

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_organization_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, public.membership_role[]) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.membership_role[]) to authenticated;

create or replace view public.plot_statuses
with (security_invoker = true)
as
select
  p.id as plot_id,
  p.organization_id,
  p.name,
  p.threshold_min,
  p.threshold_max,
  latest.moisture_pct,
  latest.recorded_at,
  case
    when latest.recorded_at is null or latest.recorded_at < now() - interval '15 minutes' then 'stale'::public.plot_status
    when latest.moisture_pct < p.threshold_min then 'dry'::public.plot_status
    when latest.moisture_pct <= p.threshold_max then 'optimal'::public.plot_status
    else 'wet'::public.plot_status
  end as status
from public.plots p
left join lateral (
  select r.moisture_pct, r.recorded_at
  from public.stations s
  join public.readings r on r.station_id = s.id
  where s.plot_id = p.id
  order by r.recorded_at desc
  limit 1
) latest on true;

create or replace function public.is_point_inside_plot(target_plot_id uuid, longitude double precision, latitude double precision)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  target_geom extensions.geometry;
begin
  select geom into target_geom
  from public.plots
  where id = target_plot_id and public.is_org_member(organization_id);
  if target_geom is null then return false; end if;
  return extensions.st_covers(target_geom, extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326));
end;
$$;

create or replace function public.create_irrigation_command(
  target_valve_id uuid,
  request_id uuid,
  requested_action public.valve_status,
  requested_duration_minutes integer default null
)
returns public.irrigation_commands
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
  created_command public.irrigation_commands;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select organization_id into target_org from public.valves where id = target_valve_id;
  if target_org is null or not public.has_org_role(target_org, array['producer','operator']::public.membership_role[]) then
    raise exception 'command not permitted' using errcode = '42501';
  end if;

  insert into public.irrigation_commands (
    organization_id, valve_id, requested_by, client_request_id, action, duration_minutes
  ) values (
    target_org, target_valve_id, auth.uid(), request_id, requested_action, requested_duration_minutes
  ) returning * into created_command;

  insert into public.command_outbox(command_id, organization_id, payload)
  values (
    created_command.id,
    target_org,
    jsonb_build_object(
      'command_id', created_command.id,
      'client_request_id', created_command.client_request_id,
      'valve_id', created_command.valve_id,
      'action', created_command.action,
      'duration_minutes', created_command.duration_minutes
    )
  );
  return created_command;
end;
$$;

create or replace function public.cancel_irrigation_command(target_command_id uuid)
returns public.irrigation_commands
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
  cancelled_command public.irrigation_commands;
begin
  select organization_id into target_org from public.irrigation_commands where id = target_command_id;
  if target_org is null or not public.has_org_role(target_org, array['producer','operator']::public.membership_role[]) then
    raise exception 'cancellation not permitted' using errcode = '42501';
  end if;
  update public.irrigation_commands
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = target_command_id and status = 'pending'
  returning * into cancelled_command;
  if cancelled_command.id is null then raise exception 'command is not pending' using errcode = 'P0001'; end if;
  update public.command_outbox set expired_at = now() where command_id = target_command_id and published_at is null;
  return cancelled_command;
end;
$$;

create or replace function public.update_plot_thresholds(target_plot_id uuid, new_min numeric, new_max numeric)
returns public.plots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
  updated_plot public.plots;
begin
  select organization_id into target_org from public.plots where id = target_plot_id;
  if target_org is null or not public.has_org_role(target_org, array['producer']::public.membership_role[]) then
    raise exception 'threshold update not permitted' using errcode = '42501';
  end if;
  update public.plots set threshold_min = new_min, threshold_max = new_max
  where id = target_plot_id returning * into updated_plot;
  return updated_plot;
end;
$$;

revoke all on function public.is_point_inside_plot(uuid, double precision, double precision) from public;
revoke all on function public.create_irrigation_command(uuid, uuid, public.valve_status, integer) from public;
revoke all on function public.cancel_irrigation_command(uuid) from public;
revoke all on function public.update_plot_thresholds(uuid, numeric, numeric) from public;
grant execute on function public.is_point_inside_plot(uuid, double precision, double precision) to authenticated;
grant execute on function public.create_irrigation_command(uuid, uuid, public.valve_status, integer) to authenticated;
grant execute on function public.cancel_irrigation_command(uuid) to authenticated;
grant execute on function public.update_plot_thresholds(uuid, numeric, numeric) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.plots enable row level security;
alter table public.stations enable row level security;
alter table public.readings enable row level security;
alter table public.valves enable row level security;
alter table public.irrigation_commands enable row level security;
alter table public.command_outbox enable row level security;
alter table public.alerts enable row level security;

create policy organizations_member_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy memberships_self_org_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));
create policy plots_member_select on public.plots for select to authenticated
  using (public.is_org_member(organization_id));
create policy stations_member_select on public.stations for select to authenticated
  using (public.is_org_member(organization_id));
create policy readings_member_select on public.readings for select to authenticated
  using (public.is_org_member(organization_id));
create policy valves_member_select on public.valves for select to authenticated
  using (public.is_org_member(organization_id));
create policy commands_member_select on public.irrigation_commands for select to authenticated
  using (public.is_org_member(organization_id));
create policy alerts_member_select on public.alerts for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.memberships, public.plots, public.stations,
  public.readings, public.valves, public.irrigation_commands, public.alerts, public.plot_statuses
  to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'readings'
  ) then alter publication supabase_realtime add table public.readings; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'irrigation_commands'
  ) then alter publication supabase_realtime add table public.irrigation_commands; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'valves'
  ) then alter publication supabase_realtime add table public.valves; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alerts'
  ) then alter publication supabase_realtime add table public.alerts; end if;
end $$;
