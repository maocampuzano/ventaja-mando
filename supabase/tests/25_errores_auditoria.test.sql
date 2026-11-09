-- Errores del panel (limpios de datos personales, con tope por persona) y consulta de la auditoría para la dirección.
begin;
select plan(16);

-- Errores ---------------------------------------------------------------------------------------------------------
select pruebas.como('lider_a1');
select lives_ok($$ select public.registrar_error('20000000-0000-4000-8000-00000000000a',
  'TypeError: el celular +57 300 000 9001 de ana.ruiz@ejemplo.co falló', 'en la línea 42', 'https://panel.co/#b/17.0123456789ab', '1.0', 'Mozilla') $$,
  'Cualquiera con sesión registra un error');
select lives_ok($$ select public.registrar_error('20000000-0000-4000-8000-00000000000b', 'Error en campaña ajena', null, '/', '1.0', 'x') $$,
  'Con una campaña ajena no falla');
select is((select count(*) from public.error_panel)::int, 0, 'Pero un líder no ve los errores');
reset role;
select is((select mensaje from public.error_panel where usuario_id = pruebas.uid('lider_a1') order by id limit 1),
  'TypeError: el celular ‹número› de ‹correo› falló', 'Se guarda sin celular ni correo');
select is((select ruta from public.error_panel where usuario_id = pruebas.uid('lider_a1') order by id limit 1), 'https://panel.co/',
  'La ruta se guarda sin el token del enlace de baja');
select is((select campana_id from public.error_panel where mensaje = 'Error en campaña ajena'), null, 'No se asocia a una campaña de la que no es miembro');
select pruebas.como_anonimo();
select throws_ok($$ select public.registrar_error(null, 'x', null, null, null, null) $$, '42501', null, 'Sin sesión no se registran errores');
reset role;

-- Tope de 30 por hora
select pruebas.como('lider_a2');
select public.registrar_error('20000000-0000-4000-8000-00000000000a', 'Bucle ' || g, null, '/', '1.0', 'x') from generate_series(1, 40) g;
reset role;
select is((select count(*) from public.error_panel where usuario_id = pruebas.uid('lider_a2'))::int, 30, 'Un error en bucle no pasa de 30 por hora');

select pruebas.como('gerente_a', 'aal2');
select ok((select count(*) from public.errores_recientes('20000000-0000-4000-8000-00000000000a')) >= 2, 'La dirección ve los errores agrupados');
reset role;
select pruebas.como('candidata_a');
select throws_ok($$ select * from public.errores_recientes('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'La candidata no');
reset role;

-- Auditoría -------------------------------------------------------------------------------------------------------
-- Una fila auditada con datos de contacto (como la que deja el borrado de una persona).
insert into public.auditoria (campana_id, usuario_id, accion, entidad, entidad_id, detalle) values
  ('20000000-0000-4000-8000-00000000000a', pruebas.uid('gerente_a'), 'delete', 'persona', gen_random_uuid(),
   '{"anterior": {"nombre": "Persona Ficticia", "telefono": "+57 300 000 1234", "correo": "x@ejemplo.co", "documento_hash": "abc"}}');
update public.membresia set activa = activa where usuario_id = pruebas.uid('lider_a1');

select pruebas.como('gerente_a', 'aal2');
select ok((select count(*) from public.auditoria_campana('20000000-0000-4000-8000-00000000000a')) > 0, 'La dirección revisa la auditoría');
select ok(not exists (select 1 from public.auditoria_campana('20000000-0000-4000-8000-00000000000a', p_limite => 200) a
  where a.detalle::text ~ '"(telefono|correo|documento_hash|documento_cifrado)"'), 'Sin teléfonos, correos ni cédulas');
select is((select detalle -> 'anterior' ->> 'nombre' from public.auditoria_campana('20000000-0000-4000-8000-00000000000a', 'delete') limit 1),
  'Persona Ficticia', 'Pero sí con el nombre, para saber qué se borró');
select ok((select bool_and(accion = 'update') from public.auditoria_campana('20000000-0000-4000-8000-00000000000a', 'update')), 'Filtra por acción');
select is((select count(*) from public.auditoria_campana('20000000-0000-4000-8000-00000000000a', p_limite => 1))::int, 1, 'Pagina');
reset role;
select pruebas.como('coord_a');
select throws_ok($$ select * from public.auditoria_campana('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'La coordinación no ve la auditoría');
reset role;

select * from finish();
rollback;
