begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

select ok(exists(select 1 from pg_extension where extname = 'postgis'), 'PostGIS is enabled');
select has_table('public', 'organizations', 'organizations exists');
select has_table('public', 'memberships', 'memberships exists');
select has_table('public', 'plots', 'plots exists');
select has_table('public', 'stations', 'stations exists');
select has_table('public', 'readings', 'readings exists');
select has_table('public', 'valves', 'valves exists');
select has_table('public', 'irrigation_commands', 'irrigation_commands exists');
select has_table('public', 'command_outbox', 'command_outbox exists');
select has_table('public', 'alerts', 'alerts exists');

select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.memberships'::regclass), 'memberships RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.plots'::regclass), 'plots RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.stations'::regclass), 'stations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.readings'::regclass), 'readings RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.valves'::regclass), 'valves RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.irrigation_commands'::regclass), 'commands RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.command_outbox'::regclass), 'outbox RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.alerts'::regclass), 'alerts RLS enabled');

select is((select status::text from public.plot_statuses where name = 'Costa 1'), 'optimal', 'Costa 1 seed is optimal');
select is((select status::text from public.plot_statuses where name = 'Costa 2'), 'dry', 'Costa 2 seed is dry');
select is((select status::text from public.plot_statuses where name = 'Monte A'), 'stale', 'Monte A seed is stale');

update public.readings set moisture_pct = 25, recorded_at = now()
where id = (select id from public.readings where station_id = '30000000-0000-4000-8000-000000000001' order by recorded_at desc limit 1);
select is((select status::text from public.plot_statuses where name = 'Costa 1'), 'optimal', 'minimum boundary is optimal');
update public.readings set moisture_pct = 45 where id = (select id from public.readings where station_id = '30000000-0000-4000-8000-000000000001' order by recorded_at desc limit 1);
select is((select status::text from public.plot_statuses where name = 'Costa 1'), 'optimal', 'maximum boundary is optimal');
update public.readings set moisture_pct = 46 where id = (select id from public.readings where station_id = '30000000-0000-4000-8000-000000000001' order by recorded_at desc limit 1);
select is((select status::text from public.plot_statuses where name = 'Costa 1'), 'wet', 'above maximum is wet');
update public.readings set moisture_pct = 10, recorded_at = now() - interval '16 minutes'
where id = (select id from public.readings where station_id = '30000000-0000-4000-8000-000000000001' order by recorded_at desc limit 1);
select is((select status::text from public.plot_statuses where name = 'Costa 1'), 'stale', 'stale takes precedence over moisture');

insert into auth.users(id, email) values
  ('90000000-0000-4000-8000-000000000001', 'test-producer@agropulse.test'),
  ('90000000-0000-4000-8000-000000000002', 'test-operator@agropulse.test'),
  ('90000000-0000-4000-8000-000000000003', 'test-advisor@agropulse.test'),
  ('90000000-0000-4000-8000-000000000004', 'test-productor2@agropulse.test');
insert into public.memberships(organization_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'producer'),
  ('10000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'producer'),
  ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'operator'),
  ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000003', 'advisor'),
  ('10000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000004', 'producer');

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select ok(public.is_point_inside_plot('20000000-0000-4000-8000-000000000001', -58.045, -31.395), 'inside point accepted');
select isnt(public.is_point_inside_plot('20000000-0000-4000-8000-000000000001', -59, -32), true, 'outside point rejected');
reset role;

select is((select count(*) from public.memberships where user_id = '90000000-0000-4000-8000-000000000001'), 2::bigint, 'primary producer has two memberships');
select is((select count(*) from public.memberships where user_id = '90000000-0000-4000-8000-000000000004'), 1::bigint, 'productor2 has one membership');

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select is((select count(*) from public.organizations), 1::bigint, 'RF-02 productor2 sees only its organization');
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select count(*) from public.organizations), 2::bigint, 'RF-03 primary producer sees both organizations');
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is((select count(*) from public.plots), 3::bigint, 'advisor can read its organization plots');
select throws_ok(
  $$select public.create_irrigation_command('40000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'open', 30)$$,
  '42501', 'command not permitted', 'advisor command is rejected by backend'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select lives_ok(
  $$select public.create_irrigation_command('40000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'open', 30)$$,
  'operator can create a command'
);
reset role;
select is((select requested_by from public.irrigation_commands where client_request_id = '91000000-0000-4000-8000-000000000002'), '90000000-0000-4000-8000-000000000002'::uuid, 'RPC derives requested_by from auth.uid');
select is((select count(*) from public.command_outbox where command_id = (select id from public.irrigation_commands where client_request_id = '91000000-0000-4000-8000-000000000002')), 1::bigint, 'command and outbox are created atomically');

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$select public.create_irrigation_command('40000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'open', 30)$$,
  '23505', null, 'duplicate client_request_id is rejected'
);
select throws_ok(
  $$select public.create_irrigation_command('40000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'open', 30)$$,
  '23505', null, 'RF-16 rejects a second pending command for one valve'
);
select throws_ok(
  $$insert into public.irrigation_commands(organization_id,valve_id,requested_by,client_request_id,action,duration_minutes) values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',auth.uid(),'91000000-0000-4000-8000-000000000004','open',30)$$,
  '42501', null, 'direct command insert is denied'
);
select throws_ok(
  $$update public.valves set status = 'open' where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'direct valve status update is denied'
);
select throws_ok(
  $$select public.update_plot_thresholds('20000000-0000-4000-8000-000000000001', 20, 40)$$,
  '42501', 'threshold update not permitted', 'operator cannot update thresholds'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$select public.update_plot_thresholds('20000000-0000-4000-8000-000000000001', 25, 45)$$,
  'producer can update thresholds'
);
select lives_ok(
  $$select public.create_irrigation_command('40000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000005', 'open', 30)$$,
  'producer can create a command'
);
select lives_ok(
  $$select public.cancel_irrigation_command((select id from public.irrigation_commands where client_request_id = '91000000-0000-4000-8000-000000000005'))$$,
  'pending command can be cancelled with CAS'
);
reset role;
select is((select status::text from public.irrigation_commands where client_request_id = '91000000-0000-4000-8000-000000000005'), 'cancelled', 'cancelled command reaches terminal state');
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$select public.cancel_irrigation_command((select id from public.irrigation_commands where client_request_id = '91000000-0000-4000-8000-000000000005'))$$,
  'P0001', 'command is not pending', 'CAS rejects repeated cancellation'
);
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select isnt(public.is_point_inside_plot('20000000-0000-4000-8000-000000000004', -58.095, -31.445), true, 'member cannot query another organization plot');
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$select public.create_irrigation_command('40000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000006', 'open', 0)$$,
  '23514', null, 'duration outside 1..120 is rejected'
);
select throws_ok(
  $$insert into public.command_outbox(command_id, organization_id, payload) values ('91000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','{}')$$,
  '42501', null, 'direct outbox mutation is denied'
);
reset role;

select * from finish();
rollback;
