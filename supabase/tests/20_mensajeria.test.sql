-- Mensajes masivos: solo a personas con autorización vigente para contacto y sin baja (regla 3), nunca WhatsApp
-- (regla 1), segmentos sin opinión política (regla 2), baja en un paso con enlace firmado, y nueva verificación al enviar.
begin;
select plan(33);

create temporary table esperado as
select
  (select count(*) from public.persona p where p.campana_id = '20000000-0000-4000-8000-00000000000a' and p.telefono is not null
     and exists (select 1 from public.autorizacion a where a.persona_id = p.id and a.revocada_en is null and 'contacto_campana' = any (a.finalidades)))::int sms,
  (select count(*) from public.persona p where p.lider_id = '70000000-0000-4000-8000-000000000001' and p.telefono is not null
     and exists (select 1 from public.autorizacion a where a.persona_id = p.id and a.revocada_en is null and 'contacto_campana' = any (a.finalidades)))::int lider1;
grant select on esperado to authenticated;
select ok((select lider1 >= 3 from esperado), 'La semilla tiene al menos 3 personas contactables de la líder 1');

-- Contar destinatarios ------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select is(public.contar_destinatarios('20000000-0000-4000-8000-00000000000a', 'sms', '{}'), (select sms from esperado),
  'SMS: todas las personas con celular y autorización vigente para contacto');
select is(public.contar_destinatarios('20000000-0000-4000-8000-00000000000a', 'sms', '{"lider_ids": ["70000000-0000-4000-8000-000000000001"]}'),
  (select lider1 from esperado), 'Segmento por líder');
select is(public.contar_destinatarios('20000000-0000-4000-8000-00000000000a', 'email', '{}'), 0, 'Correo: nadie tiene correo todavía');
select throws_ok($$ select public.contar_destinatarios('20000000-0000-4000-8000-00000000000a', 'sms', '{"preferencia": ["a favor"]}') $$,
  '22023', 'Un envío solo se segmenta por territorio, líder y estado del contacto.', 'Regla 2: no se segmenta por opinión política');
reset role;
update public.persona set correo = 'ficticia' || substr(id::text, 1, 4) || '@ejemplo.co'
where id in (select id from public.persona where lider_id = '70000000-0000-4000-8000-000000000001' order by id limit 2);
select pruebas.como('gerente_a', 'aal2');
select is(public.contar_destinatarios('20000000-0000-4000-8000-00000000000a', 'email', '{}'), 2, 'Correo: solo quienes lo tienen');
reset role;

-- Solo la dirección -------------------------------------------------------------------------------------------
select pruebas.como('coord_a');
select throws_ok($$ select public.contar_destinatarios('20000000-0000-4000-8000-00000000000a', 'sms', '{}') $$, '42501', null, 'La coordinación no arma envíos');
reset role;
select pruebas.como('candidata_a');
select throws_ok($$ select public.crear_envio('20000000-0000-4000-8000-00000000000a', 'sms', 'x', null, 'Hola', '{}') $$, '42501', null, 'Ni la candidata');
reset role;
select pruebas.como('lider_a1');
select throws_ok($$ select public.crear_envio('20000000-0000-4000-8000-00000000000a', 'sms', 'x', null, 'Hola', '{}') $$, '42501', null, 'Ni un líder');
reset role;
select pruebas.como('gerente_a');
select throws_ok($$ select public.crear_envio('20000000-0000-4000-8000-00000000000a', 'sms', 'x', null, 'Hola', '{}') $$, '42501', null, 'Ni la dirección sin dos factores');
reset role;
select pruebas.como('gerente_b', 'aal2');
select throws_ok($$ select public.crear_envio('20000000-0000-4000-8000-00000000000a', 'sms', 'x', null, 'Hola', '{}') $$, '42501', null, 'Ni otra campaña');
reset role;

-- Crear y aprobar ---------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.crear_envio('20000000-0000-4000-8000-00000000000a', 'sms', 'x', null, 'Escríbenos a wa.me/57300', '{}') $$,
  '23514', null, 'Regla 1: un mensaje masivo no lleva WhatsApp');
select throws_ok($$ select public.crear_envio('20000000-0000-4000-8000-00000000000a', 'email', 'x', null, 'Hola', '{}') $$,
  '23514', null, 'Un correo sin asunto no se crea');
select lives_ok($$ select public.crear_envio('20000000-0000-4000-8000-00000000000a', 'sms', 'Invitación', null, 'Hola {nombre}, te esperamos.',
  '{"lider_ids": ["70000000-0000-4000-8000-000000000001"]}') $$, 'La dirección crea un envío por SMS');
select is(public.aprobar_envio((select id from public.envio where nombre = 'Invitación')), (select lider1 from esperado),
  'Al aprobar se fijan los destinatarios');
select throws_ok($$ select public.aprobar_envio((select id from public.envio where nombre = 'Invitación')) $$, '22023', null, 'No se aprueba dos veces');
reset role;
select is((select aprobado_por from public.envio where nombre = 'Invitación'), pruebas.uid('gerente_a'), 'Queda quién aprobó');

select pruebas.como('candidata_a');
select is((public.resumen_envio((select id from public.envio where nombre = 'Invitación')) ->> 'total')::int, (select lider1 from esperado),
  'La candidata ve el resumen del envío');
select is((select count(*) from public.envio_destinatario)::int, 0, 'Pero no a quién va');
reset role;

-- Enviar (como el servidor) -----------------------------------------------------------------------------------
-- Una persona revoca su autorización después de aprobado: al enviar queda omitida.
update public.autorizacion set revocada_en = now() where persona_id = (select persona_id from public.envio_destinatario order by id limit 1);
select is((select count(*) from public.lote_para_enviar((select id from public.envio where nombre = 'Invitación')))::int,
  (select lider1 - 1 from esperado), 'Al enviar se vuelve a verificar: quien revocó no recibe');
select is((select estado from public.envio_destinatario order by id limit 1), 'omitido', 'Y queda omitida');
select is((select estado from public.envio where nombre = 'Invitación'), 'enviando', 'El envío pasa a «enviando»');

-- Baja en un paso con el enlace firmado -----------------------------------------------------------------------
create temporary table token as
select d.n || '.' || privado.firma_baja_n(d.n) t, d.persona_id from public.envio_destinatario d where d.estado = 'pendiente' order by d.n limit 1;
grant select on token to anon;
select pruebas.como_anonimo();
select is(public.darse_de_baja((select t from token)), 'Laura Méndez', 'Sin cuenta, el enlace da de baja y dice de qué campaña');
select lives_ok($$ select public.darse_de_baja((select t from token)) $$, 'Repetir el enlace no falla');
select throws_ok($$ select public.darse_de_baja((select split_part(t, '.', 1) || '.000000000000' from token)) $$,
  '22023', 'El enlace no es válido.', 'Una firma inventada no da de baja a nadie');
select throws_ok($$ select public.darse_de_baja('cualquier cosa') $$, '22023', 'El enlace no es válido.', 'Ni un texto cualquiera');
select throws_ok($$ select * from public.lote_para_enviar((select id from public.envio limit 1)) $$, '42501', null, 'Un anónimo no pide lotes');
reset role;
select is((select estado from public.envio_destinatario where persona_id = (select persona_id from token)), 'omitido',
  'Lo pendiente de quien se dio de baja queda omitido');
select ok(not privado.contactable((select persona_id from token), 'email'), 'La baja vale para todos los canales');
select ok((select length(t) <= 25 from token), 'El token de baja es corto (cabe en el SMS sin duplicar el costo)');

-- Resultados del proveedor y fin del envío
select public.registrar_resultado_envio(id, true, 'prov-' || left(id::text, 4), null) from public.envio_destinatario where estado = 'pendiente';
select is((select estado from public.envio where nombre = 'Invitación'), 'terminado', 'Cuando no queda nada pendiente, el envío termina');

-- Baja desde el panel (cuando la persona la pide por teléfono)
select pruebas.como('lider_a1');
select throws_ok($$ select public.dar_de_baja((select id from public.persona where lider_id = '70000000-0000-4000-8000-000000000001' limit 1)) $$,
  '42501', null, 'Un líder no da de baja desde el panel');
reset role;
select is((select count(*) from public.auditoria where accion in ('crear_envio', 'aprobar_envio', 'baja_contacto'))::int, 3,
  'Crear, aprobar y la baja quedan en la auditoría');

select * from finish();
rollback;
