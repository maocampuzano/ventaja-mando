-- Día E: tablero por mesa según el rol, novedades con responsable y escalamiento, revisión del E-14 por otra persona
-- (regla 7) y simulacros que no se mezclan con los datos reales ni se pueden correr el día de la elección.
begin;
select plan(40);

-- Tablero -------------------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select is((select count(*) from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a'))::int,
  (select sum(mesas)::int from public.puesto where territorio_id = '30000000-0000-4000-8000-000000013836'),
  'La dirección ve todas las mesas de los puestos de su circunscripción');
select is((select jsonb_array_length(novedades) from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a')
  where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3), 1, 'Cada mesa trae sus novedades');
select is((select acta from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a')
  where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3), 'recibida', 'Y su E-14');
select is((select testigo from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a')
  where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 5), null, 'Una mesa sin testigo asignado sale sin testigo');
select ok(not exists (select 1 from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a') t,
  jsonb_array_elements(t.novedades) n where n ->> 'tipo' = 'apertura'), 'La apertura del testigo no cuenta como novedad');
reset role;

select pruebas.como('coord_a');
select ok((select count(*) from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a')) between 1 and
  (select sum(mesas) - 1 from public.puesto), 'La coordinación ve solo una parte');
select ok((select bool_and(privado.puesto_en_territorios('20000000-0000-4000-8000-00000000000a', puesto_id))
  from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a')), 'Solo los puestos de su territorio');
reset role;

select pruebas.como('candidata_a');
select ok((select count(*) from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a')) > 0, 'La candidata ve el tablero');
reset role;

select pruebas.como('lider_a1');
select throws_ok($$ select * from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Un líder no ve el tablero');
reset role;
select pruebas.como('testigo_a');
select throws_ok($$ select * from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni un testigo');
reset role;
select pruebas.como('gerente_a');
select throws_ok($$ select * from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni la dirección sin dos factores');
reset role;
select pruebas.como('gerente_b', 'aal2');
select throws_ok($$ select * from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni otra campaña');
reset role;
select pruebas.como('sin_campana');
select throws_ok($$ select * from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni alguien sin campaña');
reset role;

-- Novedades -----------------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select lives_ok($$ select public.atender_incidencia(
  (select id from public.incidencia where puesto_id = '60000000-0000-4000-8000-000000000003' and mesa = 2),
  null, '40000000-0000-4000-8000-000000000004') $$, 'La dirección asigna a la coordinadora como responsable');
select throws_ok($$ select public.atender_incidencia(
  (select id from public.incidencia where puesto_id = '60000000-0000-4000-8000-000000000003' and mesa = 2),
  null, '40000000-0000-4000-8000-000000000005') $$, '22023', null, 'Un líder no puede ser responsable de una novedad');
select throws_ok($$ select public.atender_incidencia(
  (select id from public.incidencia where puesto_id = '60000000-0000-4000-8000-000000000003' and mesa = 2), 'borrada') $$,
  '22023', null, 'Ni se inventa un estado');
select lives_ok($$ select public.atender_incidencia(
  (select id from public.incidencia where puesto_id = '60000000-0000-4000-8000-000000000003' and mesa = 2), 'atendida') $$,
  'La marca atendida');
reset role;
select is((select atendida_por from public.incidencia where puesto_id = '60000000-0000-4000-8000-000000000003' and mesa = 2),
  pruebas.uid('gerente_a'), 'Queda quién la atendió');
select ok((select count(*) from public.auditoria where accion = 'atender_incidencia') = 2, 'Y cada cambio en la auditoría');

select pruebas.como('testigo_a');
select throws_ok($$ select public.atender_incidencia(
  (select id from public.incidencia where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3), 'cerrada') $$,
  '42501', null, 'El testigo reporta, pero no cierra novedades');
reset role;
select pruebas.como('lider_a1');
select throws_ok($$ select public.atender_incidencia('00000000-0000-4000-8000-000000000000', 'cerrada') $$,
  '42501', null, 'Un líder tampoco');
reset role;

-- Escalamiento: una novedad alta de hace 20 minutos y otra media de hace 20 minutos.
insert into public.incidencia (campana_id, puesto_id, mesa, tipo, prioridad, reportado_por, hora) values
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000002', 1, 'Prueba alta', 'alta', pruebas.uid('gerente_a'), now() - interval '20 minutes'),
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000002', 2, 'Prueba media', 'media', pruebas.uid('gerente_a'), now() - interval '20 minutes'),
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000002', 3, 'apertura', 'baja', pruebas.uid('gerente_a'), now() - interval '5 hours');
select pruebas.como('gerente_a', 'aal2');
select is(public.escalar_incidencias('20000000-0000-4000-8000-00000000000a'), 1, 'Escala solo la alta vencida (ni la media a tiempo ni la apertura)');
select is(public.escalar_incidencias('20000000-0000-4000-8000-00000000000a'), 0, 'Una escalada no se vuelve a escalar');
reset role;
select pruebas.como('lider_a1');
select throws_ok($$ select public.escalar_incidencias('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Un líder no escala');
reset role;

-- Revisión del E-14 (regla 7) -----------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.revisar_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000003' and mesa = 2),
  '{"votos": []}', 0) $$, '42501', 'Quien subió el acta no la revisa: la revisa otra persona del centro de mando.', 'Quien subió el acta no la revisa');
select throws_ok($$ select public.revisar_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  '{}', 0) $$, '22023', 'Faltan los números revisados del acta.', 'Revisar exige los números');
select lives_ok($$ select public.revisar_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  '{"votos": [{"opcion": "Candidata ficticia", "votos": 80}], "blancos": 2, "nulos": 1, "noMarcados": 0, "totalVotos": 83, "sufragantes": 90}', 0) $$,
  'La dirección revisa el acta que subió el testigo');
select throws_ok($$ select public.revisar_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  '{"votos": []}', 0) $$, '22023', 'El acta ya fue revisada.', 'Una revisada no se vuelve a revisar');
reset role;
select is((select revisada_por from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  pruebas.uid('gerente_a'), 'Queda revisada por quien la revisó');
select pruebas.como('testigo_a');
select throws_ok($$ select public.revisar_e14((select id from public.acta_e14 where puesto_id = '60000000-0000-4000-8000-000000000003' and mesa = 2),
  '{"votos": []}', 0) $$, '42501', null, 'El testigo no revisa actas');
reset role;

-- Llegada del testigo
update public.testigo set estado = 'en_mesa' where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3;
select ok((select llegada_en is not null from public.testigo where puesto_id = '60000000-0000-4000-8000-000000000001' and mesa = 3),
  'La llegada del testigo queda con su hora');

-- Simulacro -----------------------------------------------------------------------------------------------------
select pruebas.como('coord_a');
select throws_ok($$ select public.iniciar_simulacro('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'La coordinación no inicia simulacros');
reset role;
select pruebas.como('gerente_a', 'aal2');
select lives_ok($$ select public.iniciar_simulacro('20000000-0000-4000-8000-00000000000a') $$, 'La dirección inicia un simulacro');
select throws_ok($$ select public.iniciar_simulacro('20000000-0000-4000-8000-00000000000a') $$, '22023', 'Ya hay un simulacro en curso.', 'Uno a la vez');
reset role;

insert into public.incidencia (campana_id, puesto_id, mesa, tipo, prioridad, reportado_por) values
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000004', 1, 'Simulada', 'media', pruebas.uid('gerente_a'));
select ok((select simulacro from public.incidencia where tipo = 'Simulada'), 'Lo reportado durante el simulacro queda marcado');

select pruebas.como('gerente_a', 'aal2');
select is((select count(*) from public.tablero_dia_e('20000000-0000-4000-8000-00000000000a', true) t, jsonb_array_elements(t.novedades))::int, 1,
  'El tablero del simulacro solo muestra lo simulado');
select is(public.terminar_simulacro('20000000-0000-4000-8000-00000000000a'), '{"actas": 0, "novedades": 1, "testigos": 1}'::jsonb,
  'Al terminar se borra lo simulado y el testigo que llegó vuelve a confirmado');
reset role;
select is((select count(*) from public.incidencia where campana_id = '20000000-0000-4000-8000-00000000000a' and not simulacro)::int, 5,
  'Las novedades reales siguen intactas');

-- El día de la elección no hay simulacros, y uno que quedó abierto no marca nada.
insert into public.simulacro (campana_id, iniciado_por) values ('20000000-0000-4000-8000-00000000000a', pruebas.uid('gerente_a'));
update public.campana set eleccion_fecha = (now() at time zone 'America/Bogota')::date where id = '20000000-0000-4000-8000-00000000000a';
insert into public.incidencia (campana_id, puesto_id, mesa, tipo, prioridad, reportado_por) values
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000004', 2, 'Real del día E', 'media', pruebas.uid('gerente_a'));
select ok(not (select simulacro from public.incidencia where tipo = 'Real del día E'), 'El día de la elección todo es real');
update public.simulacro set terminado_en = now() where terminado_en is null;
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.iniciar_simulacro('20000000-0000-4000-8000-00000000000a') $$, '22023', null,
  'Y no se puede iniciar un simulacro');
reset role;

select * from finish();
rollback;
