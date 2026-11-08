-- Cumplimiento del líder contra el E-14: agregado, solo con actas revisadas y reales, con umbral mínimo para no
-- insinuar votos individuales, y con el alcance de cada rol.
begin;
select plan(20);

-- Preparación: 12 apoyos validados de la líder 1 en las mesas 1 a 3 del puesto 1 (4 por mesa), y 4 del líder 10
-- en las mesas 1 y 2 (no llega al umbral). Actas revisadas de las mesas 1 a 3, una del simulacro en la mesa 4.
update public.persona set estado_contacto = 'validado', puesto_id = '60000000-0000-4000-8000-000000000001',
  mesa = 1 + (x.k % 3), lider_id = '70000000-0000-4000-8000-000000000001'
from (select id, row_number() over (order by id) - 1 k from public.persona
      where campana_id = '20000000-0000-4000-8000-00000000000a' and lider_id <> '70000000-0000-4000-8000-000000000010'
      order by id limit 12) x
where persona.id = x.id;
update public.persona set estado_contacto = 'comprometido', puesto_id = '60000000-0000-4000-8000-000000000001',
  mesa = 1 + (x.k % 2)
from (select id, row_number() over (order by id) - 1 k from public.persona
      where lider_id = '70000000-0000-4000-8000-000000000010' order by id limit 4) x
where persona.id = x.id;
select is((select count(*) from public.persona where lider_id = '70000000-0000-4000-8000-000000000001' and puesto_id is not null)::int, 12,
  'La líder 1 tiene 12 apoyos ubicados en mesas');

delete from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001';
insert into public.acta_e14 (campana_id, puesto_id, mesa, foto_url, estado, revisada_por, revisada_en, extraccion_json, creado_por)
select '20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000001', m, 'semilla://e14/x.jpg', 'revisada',
  pruebas.uid('gerente_a'), now(),
  jsonb_build_object('revision', jsonb_build_object('votos', jsonb_build_array(
    jsonb_build_object('opcion', 'LAURA  MÉNDEZ', 'votos', 3), jsonb_build_object('opcion', 'Otro', 'votos', 40)))),
  pruebas.uid('testigo_a')
from generate_series(1, 3) m;
-- Un acta leída pero sin revisar (regla 7) en la mesa 4: no cuenta.
insert into public.acta_e14 (campana_id, puesto_id, mesa, foto_url, estado, extraccion_json, creado_por) values
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000001', 4, 'semilla://e14/y.jpg', 'leida',
   '{"revision": {"votos": [{"opcion": "Laura Méndez", "votos": 99}]}}', pruebas.uid('testigo_a'));

-- Configuración -------------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select * from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a') $$,
  '22023', 'Falta configurar cómo aparece el candidato en el E-14.', 'Sin configurar la opción del E-14 no calcula');
select lives_ok($$ select public.configurar_opciones_e14('20000000-0000-4000-8000-00000000000a', 'Laura Méndez', 'Partido Demo') $$,
  'La dirección configura cómo aparece la candidata');
reset role;
select pruebas.como('coord_a');
select throws_ok($$ select public.configurar_opciones_e14('20000000-0000-4000-8000-00000000000a', 'Otra', null) $$,
  '42501', null, 'La coordinación no la cambia');
reset role;

-- Cálculo -------------------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select is((select row(mesas, apoyos, suficiente, votos)::text from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a')
  where lider_id = '70000000-0000-4000-8000-000000000001'), '(3,12,t,9)',
  'Líder 1: 3 mesas, 12 apoyos y 9 votos (encuentra la opción sin tildes ni mayúsculas; el acta sin revisar no cuenta)');
select ok((select votos_historicos is not null and mesas_sin_historico = 0 from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a')
  where lider_id = '70000000-0000-4000-8000-000000000001'), 'Con el histórico del puesto repartido entre sus mesas');
select is((select row(mesas, apoyos, suficiente, votos, votos_historicos)::text from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a')
  where lider_id = '70000000-0000-4000-8000-000000000010'), '(2,4,f,,)',
  'Líder 10: por debajo del umbral, no muestra votos ni histórico');
select is((select count(*) from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a'))::int, 22, 'Una fila por líder');
select ok(not exists (select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'cumplimiento_lideres_e14'), 'No es una tabla ni vista consultable aparte');
reset role;

-- Un acta del simulacro no cuenta, aunque esté revisada.
insert into public.simulacro (campana_id, iniciado_por) values ('20000000-0000-4000-8000-00000000000a', pruebas.uid('gerente_a'));
insert into public.acta_e14 (campana_id, puesto_id, mesa, foto_url, estado, revisada_por, revisada_en, extraccion_json, creado_por) values
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000001', 5, 'semilla://e14/z.jpg', 'revisada',
   pruebas.uid('gerente_a'), now(), '{"revision": {"votos": [{"opcion": "Laura Méndez", "votos": 99}]}}', pruebas.uid('testigo_a'));
update public.persona set mesa = 5 where id = (select id from public.persona where lider_id = '70000000-0000-4000-8000-000000000001'
  and mesa = 1 order by id limit 1);
select pruebas.como('gerente_a', 'aal2');
select is((select row(mesas, apoyos, votos)::text from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a')
  where lider_id = '70000000-0000-4000-8000-000000000001'), '(3,11,9)', 'El acta del simulacro no se suma');
reset role;

-- Una autorización revocada saca a la persona del conteo.
update public.autorizacion set revocada_en = now() where persona_id = (select id from public.persona
  where lider_id = '70000000-0000-4000-8000-000000000001' and mesa = 2 order by id limit 1);
select pruebas.como('gerente_a', 'aal2');
select is((select apoyos from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a')
  where lider_id = '70000000-0000-4000-8000-000000000001'), 10, 'Quien revocó su autorización no cuenta ni en agregado');
reset role;

-- Alcance por rol -----------------------------------------------------------------------------------------------
select pruebas.como('candidata_a');
select is((select count(*) from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a'))::int, 22, 'La candidata ve a todos los líderes');
reset role;
select pruebas.como('coord_a');
select ok((select count(*) from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a')) between 1 and 21,
  'La coordinación ve solo a sus líderes');
select ok((select bool_and(privado.coordina_lider('20000000-0000-4000-8000-00000000000a', lider_id))
  from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a')), 'Los de su territorio');
reset role;
select pruebas.como('lider_a1');
select throws_ok($$ select * from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Un líder no lo ve');
reset role;
select pruebas.como('testigo_a');
select throws_ok($$ select * from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni un testigo');
reset role;
select pruebas.como('gerente_a');
select throws_ok($$ select * from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni la dirección sin dos factores');
reset role;
select pruebas.como('gerente_b', 'aal2');
select throws_ok($$ select * from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni otra campaña');
reset role;
select pruebas.como('sin_campana');
select throws_ok($$ select * from public.cumplimiento_lideres_e14('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni alguien sin campaña');
reset role;
select is((select count(*) from public.auditoria where accion = 'configurar_opciones_e14')::int, 1, 'La configuración queda en la auditoría');

select * from finish();
rollback;
