-- Sincronización de la app: los reintentos no duplican y cada rol guarda solo lo suyo (fase 3).
begin;
select plan(22);

-- El líder 1 (zona 1) registra a alguien sin señal; el celular reintenta tres veces porque no recibió la respuesta.
select pruebas.como('lider_a1');
select is(public.registrar_persona_movil('a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  'Registrada En La Calle', '0009991001', '3000009911', '50000000-0000-4000-8000-000000000001',
  array['contacto_campana'], 'presencial', 'planillas/firma-a0000001.jpg', '2026-10-20 10:00-05'), 'creada', 'La primera vez se crea');
select is(public.registrar_persona_movil('a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  'Registrada En La Calle', '0009991001', '3000009911', '50000000-0000-4000-8000-000000000001',
  array['contacto_campana'], 'presencial', 'planillas/firma-a0000001.jpg', '2026-10-20 10:00-05'), 'ya_estaba', 'El reintento responde «ya_estaba»');
select is(public.registrar_persona_movil('a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  'Registrada En La Calle', '0009991001', '3000009911', '50000000-0000-4000-8000-000000000001',
  array['contacto_campana'], 'presencial', 'planillas/firma-a0000001.jpg', '2026-10-20 10:00-05'), 'ya_estaba', 'Y otra vez');
select is((select count(*) from public.persona where nombre = 'Registrada En La Calle')::int, 1, 'Queda una sola persona');
select is((select count(*) from public.autorizacion where persona_id = 'a0000000-0000-4000-8000-000000000001')::int, 1,
  'Con una sola autorización');
select is((select lider_id::text || '|' || origen from public.persona where id = 'a0000000-0000-4000-8000-000000000001'),
  '70000000-0000-4000-8000-000000000001|formulario', 'Queda a nombre del líder que la registró');
select is((select a.canal || '|' || to_char(a.fecha at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') from public.autorizacion a
  where a.persona_id = 'a0000000-0000-4000-8000-000000000001'), 'presencial|2026-10-20 10:00',
  'La autorización lleva la hora en que se capturó, no la de la sincronización');

select throws_ok($$ select public.registrar_persona_movil('a0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a',
  'Otra Con Misma Cédula', '0009991001', null, '50000000-0000-4000-8000-000000000001', array['contacto_campana'], 'presencial', 'x', now()) $$,
  '23505', 'Ya está en la base (misma cédula).', 'Una cédula repetida entre sus personas se rechaza con motivo');
select throws_ok($$ select public.registrar_persona_movil('a0000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a',
  'Fuera De Su Zona', null, null, '50000000-0000-4000-8000-000000000010', array['contacto_campana'], 'presencial', 'x', now()) $$,
  '42501', 'La zona no está en su territorio.', 'El líder no registra fuera de su zona');
select throws_ok($$ select public.registrar_persona_movil('a0000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a',
  'Sin Autorización', null, null, null, array[]::text[], 'presencial', 'x', now()) $$,
  '22023', 'Falta la autorización: finalidades y evidencia.', 'Sin finalidades no se guarda (regla 3)');
select throws_ok($$ select public.registrar_persona_movil('a0000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a',
  'Canal Raro', null, null, null, array['contacto_campana'], 'whatsapp_bot', 'x', now()) $$,
  '22023', null, 'Solo se aceptan los canales presencial y enlace');

-- Planillas: dos fotos, cada una reintentada, quedan dos lotes.
select is(public.registrar_planilla_movil('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000005/b1.jpg'),
  'creada', 'La planilla se recibe');
select is(public.registrar_planilla_movil('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000005/b1.jpg'),
  'ya_estaba', 'El reintento de la planilla no la duplica');
select is(public.registrar_planilla_movil('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000005/b2.jpg'),
  'creada', 'La segunda planilla se recibe');
select is((select count(*) from public.lote_ocr where id::text like 'b0000000%' and estado = 'pendiente' and lider_id = '70000000-0000-4000-8000-000000000001')::int,
  2, 'Quedan dos planillas pendientes de lectura y revisión');
reset role;

-- Otro líder no puede «adivinar» un identificador ajeno ni saber de quién es.
select pruebas.como('lider_a2');
select throws_ok($$ select public.registrar_persona_movil('a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  'Intento Con Id Ajeno', null, null, null, array['contacto_campana'], 'presencial', 'x', now()) $$,
  '23505', 'El identificador de la operación ya está en uso.', 'Un identificador ajeno se rechaza sin revelar la persona');
select is((select count(*) from public.estado_registros_movil(array['a0000000-0000-4000-8000-000000000001']::uuid[]))::int, 0,
  'Tampoco puede preguntar por el estado de registros ajenos');
reset role;

-- La dirección valida a la persona; el líder lo ve como «revisado».
update public.persona set estado_contacto = 'validado' where id = 'a0000000-0000-4000-8000-000000000001';
select pruebas.como('lider_a1');
select is(array(select public.estado_registros_movil(array['a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001']::uuid[])), array['a0000000-0000-4000-8000-000000000001']::uuid[],
  'Lo validado vuelve como revisado; la planilla sin aprobar no');
reset role;

-- Testigo: apertura y E-14 de su mesa (DEMO-001, mesa 3), con reintentos.
select pruebas.como('testigo_a');
select is(public.registrar_novedad_movil('c0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  '60000000-0000-4000-8000-000000000001', 3, 'apertura', 'Mesa instalada 7:55', 'baja', null, now()), 'creada', 'El testigo reporta la apertura');
select is(public.registrar_novedad_movil('c0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  '60000000-0000-4000-8000-000000000001', 3, 'apertura', 'Mesa instalada 7:55', 'baja', null, now()), 'ya_estaba', 'Sin duplicar');
select is((select estado from public.testigo where usuario_id = auth.uid()), 'en_mesa', 'La apertura lo deja «en mesa»');
select throws_ok($$ select public.registrar_e14_movil('d0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  '60000000-0000-4000-8000-000000000001', 4, 'e14/otra-mesa.jpg') $$, '42501', null, 'No sube el E-14 de una mesa que no es suya');
reset role;

select * from finish();
rollback;
