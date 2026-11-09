-- Telemarketing: la dirección arma colas solo con personas autorizadas y sin baja; el operador recibe una persona a la
-- vez, solo de sus colas y en horario; los resultados no registran opinión política; «no volver a llamar» da de baja.
begin;
select plan(30);

-- Dos operadores ficticios de la campaña A y uno de la B. La hora de llamar se fija para que la prueba no dependa del
-- reloj (la regla de horario se prueba aparte, al final).
insert into auth.users (id, email) values
  ('4a000000-0000-4000-8000-000000000001', 'operador_a@ejemplo.co'),
  ('4a000000-0000-4000-8000-000000000002', 'operador_a2@ejemplo.co'),
  ('4a000000-0000-4000-8000-000000000003', 'operador_b@ejemplo.co');
insert into public.usuario (id, nombre) values
  ('4a000000-0000-4000-8000-000000000001', 'Operadora Demo'), ('4a000000-0000-4000-8000-000000000002', 'Operador Demo 2'),
  ('4a000000-0000-4000-8000-000000000003', 'Operador Demo B');
insert into public.membresia (usuario_id, campana_id, rol) values
  ('4a000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'operador'),
  ('4a000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'operador'),
  ('4a000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000b', 'operador');
create or replace function privado.hora_de_llamar() returns boolean language sql stable set search_path = '' as $$ select true $$;

-- Una persona de la líder 1 ya está dada de baja: no debe entrar a la cola.
insert into public.baja_contacto (persona_id, campana_id, origen)
select id, campana_id, 'panel' from public.persona where lider_id = '70000000-0000-4000-8000-000000000001' order by id limit 1;
create temporary table esperado as select (select count(*) from public.persona p
  where p.lider_id = '70000000-0000-4000-8000-000000000001' and privado.contactable(p.id, 'sms'))::int n;
grant select on esperado to authenticated;

-- La dirección arma la cola ----------------------------------------------------------------------------------------
select pruebas.como('coord_a');
select throws_ok($$ select public.crear_cola('20000000-0000-4000-8000-00000000000a', 'x', null, '{}') $$, '42501', null, 'La coordinación no arma colas');
reset role;
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.crear_cola('20000000-0000-4000-8000-00000000000a', 'x', null, '{"preferencia": ["a favor"]}') $$,
  '22023', null, 'Regla 2: no se segmenta por opinión política');
select is((public.crear_cola('20000000-0000-4000-8000-00000000000a', 'Invitación al cierre', 'Buenos días, le hablo de la campaña…',
  '{"lider_ids": ["70000000-0000-4000-8000-000000000001"]}') ->> 'personas')::int, (select n from esperado),
  'La cola incluye solo a quienes tienen autorización vigente y no se dieron de baja');
select throws_ok($$ select public.asignar_operadores((select id from public.cola_llamadas where nombre = 'Invitación al cierre'),
  array['40000000-0000-4000-8000-000000000005']::uuid[]) $$, '22023', null, 'Solo se asignan operadores');
select throws_ok($$ select public.asignar_operadores((select id from public.cola_llamadas where nombre = 'Invitación al cierre'),
  array['4a000000-0000-4000-8000-000000000003']::uuid[]) $$, '22023', null, 'Ni operadores de otra campaña');
select lives_ok($$ select public.asignar_operadores((select id from public.cola_llamadas where nombre = 'Invitación al cierre'),
  array['4a000000-0000-4000-8000-000000000001']::uuid[]) $$, 'Asigna a la operadora');
reset role;

-- El operador -------------------------------------------------------------------------------------------------------
select pruebas.como('operador_a');
select is((select count(*) from public.persona)::int, 0, 'La operadora no ve la base de personas');
select is((select count(*) from public.cola_item)::int, 0, 'Ni los ítems de la cola');
select is((select count(*) from public.mis_colas('20000000-0000-4000-8000-00000000000a'))::int, 1, 'Ve su cola');
select is((select guion from public.cola_llamadas)::text, 'Buenos días, le hablo de la campaña…', 'Con su guion');
create temporary table primera as select * from public.siguiente_llamada((select cola_id from public.mis_colas('20000000-0000-4000-8000-00000000000a')));
select is((select count(*) from primera)::int, 1, 'Recibe una persona, con nombre y celular');
select ok((select telefono is not null and nombre is not null from primera), 'Con lo necesario para llamar');
select is((select item_id from public.siguiente_llamada((select cola_id from public.mis_colas('20000000-0000-4000-8000-00000000000a')))),
  (select item_id from primera), 'Si pide otra sin registrar la anterior, recibe la misma');
select throws_ok($$ select public.registrar_llamada((select item_id from primera), 'apoya') $$, '22023', 'Resultado no válido.',
  'Regla 2: no existe el resultado «apoya»');
select lives_ok($$ select public.registrar_llamada((select item_id from primera), 'no_contesto') $$, 'Registra «no contestó»');
select throws_ok($$ select public.registrar_llamada((select item_id from primera), 'contesto') $$, '42501', null,
  'Una llamada registrada ya no está en sus manos');
reset role;
select is((select estado || '/' || intentos from public.cola_item where id = (select item_id from primera)), 'reintentar/1',
  'No contestó: vuelve a la cola para reintentar');

select pruebas.como('operador_a2');
select throws_ok($$ select * from public.siguiente_llamada((select id from public.cola_llamadas limit 1)) $$, '42501', null,
  'Otro operador no toma llamadas de una cola que no es suya');
select is((select count(*) from public.cola_llamadas)::int, 0, 'Ni la ve');
reset role;
select pruebas.como('lider_a1');
select throws_ok($$ select * from public.siguiente_llamada((select id from public.cola_llamadas where nombre = 'Invitación al cierre')) $$,
  '42501', null, 'Un líder no toma llamadas');
reset role;

-- Resultados ---------------------------------------------------------------------------------------------------------
select pruebas.como('operador_a');
create temporary table segunda as select * from public.siguiente_llamada((select cola_id from public.mis_colas('20000000-0000-4000-8000-00000000000a')));
select ok((select item_id from segunda) <> (select item_id from primera), 'La siguiente es otra persona');
select lives_ok($$ select public.registrar_llamada((select item_id from segunda), 'no_volver_a_llamar') $$, 'Registra «no quiere que la vuelvan a contactar»');
create temporary table tercera as select * from public.siguiente_llamada((select cola_id from public.mis_colas('20000000-0000-4000-8000-00000000000a')));
select lives_ok($$ select public.registrar_llamada((select item_id from tercera), 'contesto') $$, 'Registra «contestó»');
reset role;
select ok(exists (select 1 from public.baja_contacto b join public.cola_item i on i.persona_id = b.persona_id
  where i.id = (select item_id from segunda) and b.origen = 'llamada'), '«No volver a llamar» la da de baja en todos los canales');
select is((select estado from public.cola_item where id = (select item_id from segunda)), 'descartada', 'Y sale de la cola');
select is((select p.estado_contacto from public.persona p join public.cola_item i on i.persona_id = p.id where i.id = (select item_id from tercera)) <> 'sin_contactar',
  true, 'Quien contestó queda al menos «contactada»');

select pruebas.como('gerente_a', 'aal2');
select is((public.resumen_cola((select id from public.cola_llamadas where nombre = 'Invitación al cierre')) -> 'hoy' ->> 'contesto')::int, 1,
  'La dirección ve el avance del día en totales');
select lives_ok($$ select public.cambiar_estado_cola((select id from public.cola_llamadas where nombre = 'Invitación al cierre'), 'pausada') $$, 'Pausa la cola');
reset role;
select pruebas.como('operador_a');
select throws_ok($$ select * from public.siguiente_llamada((select cola_id from public.mis_colas('20000000-0000-4000-8000-00000000000a'))) $$,
  '22023', 'Esta cola está pausada.', 'Con la cola pausada no se entregan llamadas');
reset role;

-- Horario: fuera de hora, no se entregan llamadas.
create or replace function privado.hora_de_llamar() returns boolean language sql stable set search_path = '' as $$ select false $$;
update public.cola_llamadas set estado = 'activa';
select pruebas.como('operador_a');
select throws_like($$ select * from public.siguiente_llamada((select cola_id from public.mis_colas('20000000-0000-4000-8000-00000000000a'))) $$,
  'Fuera del horario de llamadas%', 'Fuera de horario no se llama');
reset role;

select * from finish();
rollback;
