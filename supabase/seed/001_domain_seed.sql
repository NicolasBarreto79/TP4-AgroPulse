-- All coordinates, moisture values, organizations, devices, and readings are fictitious academic data.
insert into public.organizations(id, name) values
  ('10000000-0000-4000-8000-000000000001', 'Estancia Didáctica Concordia'),
  ('10000000-0000-4000-8000-000000000002', 'Establecimiento de Aislamiento');

insert into public.plots(id, organization_id, name, geom) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Costa 1', extensions.st_geomfromtext('POLYGON((-58.05 -31.40,-58.04 -31.40,-58.04 -31.39,-58.05 -31.39,-58.05 -31.40))', 4326)),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Costa 2', extensions.st_geomfromtext('POLYGON((-58.03 -31.40,-58.02 -31.40,-58.02 -31.39,-58.03 -31.39,-58.03 -31.40))', 4326)),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Monte A', extensions.st_geomfromtext('POLYGON((-58.01 -31.40,-58.00 -31.40,-58.00 -31.39,-58.01 -31.39,-58.01 -31.40))', 4326)),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Lote Aislado', extensions.st_geomfromtext('POLYGON((-58.10 -31.45,-58.09 -31.45,-58.09 -31.44,-58.10 -31.44,-58.10 -31.45))', 4326));

insert into public.stations(id, organization_id, plot_id, name) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Station Costa 1'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Station Costa 2'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'Station Monte A'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', 'Station Isolated');

insert into public.valves(id, organization_id, plot_id, name) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Valve Costa 1'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Valve Costa 2'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'Valve Monte A'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', 'Valve Isolated');

insert into public.readings(organization_id, station_id, moisture_pct, temperature_c, recorded_at)
select '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 35, 22, now() - (g * interval '25 minutes') - interval '1 minute'
from generate_series(0, 11) g;
insert into public.readings(organization_id, station_id, moisture_pct, temperature_c, recorded_at)
select '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 18, 23, now() - (g * interval '25 minutes') - interval '1 minute'
from generate_series(0, 11) g;
insert into public.readings(organization_id, station_id, moisture_pct, temperature_c, recorded_at)
select '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 32, 21, now() - (g * interval '25 minutes') - interval '20 minutes'
from generate_series(0, 11) g;

insert into public.alerts (id, organization_id, plot_id, station_id, kind, status, message, created_at) values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'low_moisture', 'open', 'Estrés hídrico en Costa 2: Humedad crítica por debajo del 25%.', now() - interval '10 minutes'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'station_stale', 'open', 'Estación Monte A desconectada: Sin recepción de telemetría en >15 min.', now() - interval '25 minutes');

