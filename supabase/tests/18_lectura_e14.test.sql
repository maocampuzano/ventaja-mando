-- Lectura del E-14 con IA: solo la pide quien maneja el día E del puesto, solo la guarda el servidor, deja el acta en
-- «leida» y no la da por revisada (regla 7).
begin;
select plan(11);

select pruebas.como('gerente_a', 'aal2');
select ok(public.puede_leer_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3)),
  'La dirección puede pedir la lectura');
reset role;
select pruebas.como('testigo_a');
select ok(not public.puede_leer_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3)),
  'El testigo que la subió no');
select throws_ok($$ select public.guardar_lectura_e14((select id from public.acta_e14 limit 1), '{"votos": []}', 0) $$,
  '42501', null, 'Ni puede guardar una lectura');
reset role;
select pruebas.como('candidata_a');
select ok(not public.puede_leer_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3)),
  'La candidata tampoco');
reset role;
select pruebas.como('gerente_b', 'aal2');
select ok(not public.puede_leer_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3)),
  'Ni otra campaña');
reset role;
select pruebas.como('sin_campana');
select is(public.puede_leer_e14('00000000-0000-4000-8000-000000000000'), false, 'Un acta que no existe da false, no NULL');
reset role;

-- El servidor guarda la lectura (aquí, como superusuario).
select throws_ok($$ select public.guardar_lectura_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  '{"mesa": 3}', 0) $$, '22023', 'La lectura no trae los votos del acta.', 'Sin votos no guarda');
select lives_ok($$ select public.guardar_lectura_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  '{"mesa": 3, "votos": [{"opcion": "Candidata", "votos": 80}], "totalVotos": 90, "revision": {"votos": []}}', 1) $$, 'Guarda la lectura');
select ok((select estado = 'leida' and alertas = 1 and revisada_por is null and not (extraccion_json ? 'revision')
  from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  'El acta queda leída con sus alertas, sin revisión y sin una «revisión» colada en la lectura');
select throws_ok($$ select public.guardar_lectura_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  '{"votos": []}', 0) $$, '22023', 'El acta ya se leyó o ya fue revisada.', 'No se lee dos veces');
select ok(not exists (select 1 from information_schema.routine_privileges where routine_name = 'guardar_lectura_e14'
  and grantee in ('authenticated', 'anon', 'PUBLIC')), 'guardar_lectura_e14 no está abierta a usuarios');

select * from finish();
rollback;
