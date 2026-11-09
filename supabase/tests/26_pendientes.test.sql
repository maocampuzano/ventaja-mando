-- Pendientes pequeños: correo en la importación, la baja respetada en la exportación y en el WhatsApp manual del
-- líder, y limpieza de errores viejos.
begin;
select plan(10);

-- Correo en la importación --------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select public.importar_personas('20000000-0000-4000-8000-00000000000a',
  '[{"numero": 2, "nombre": "Con Correo Ficticia", "telefono": "3000009971", "correo": "  Ana.Ficticia@Ejemplo.CO ", "zona_id": "50000000-0000-4000-8000-000000000001"},
    {"numero": 3, "nombre": "Correo Malo Ficticio", "telefono": "3000009972", "correo": "no-es-correo", "zona_id": "50000000-0000-4000-8000-000000000001"}]',
  array['contacto_campana'], 'Planilla de prueba', 'prueba.xlsx');
reset role;
select is((select correo from public.persona where nombre = 'Con Correo Ficticia'), 'ana.ficticia@ejemplo.co', 'Importa el correo, en minúsculas y sin espacios');
select is((select correo from public.persona where nombre = 'Correo Malo Ficticio'), null, 'Un correo inválido no se guarda (la persona sí)');

-- La baja en la exportación y en el WhatsApp manual -------------------------------------------------------------
create temporary table dada as select id, campana_id, lider_id from public.persona
  where lider_id = '70000000-0000-4000-8000-000000000001' and telefono is not null order by id limit 1;
grant select on dada to authenticated;
insert into public.baja_contacto (persona_id, campana_id, origen) select id, campana_id, 'panel' from dada;

select pruebas.como('gerente_a', 'aal2');
select ok(not exists (select 1 from jsonb_array_elements(public.exportar_personas('20000000-0000-4000-8000-00000000000a') -> 'filas') f
  where f ->> 'nombre' = (select nombre from public.persona where id = (select id from dada))), 'Quien se dio de baja no sale en la exportación');
reset role;

select pruebas.como('lider_a1');
select is((select count(*) from public.baja_contacto where persona_id = (select id from dada))::int, 1, 'El líder ve que su persona se dio de baja');
select is((select count(*) from public.baja_contacto where persona_id <> (select id from dada))::int, 0, 'Y no ve otras bajas');
select throws_ok($$ insert into public.mensaje (campana_id, canal, persona_id, creado_por)
  values ('20000000-0000-4000-8000-00000000000a', 'wa_manual', (select id from dada), auth.uid()) $$,
  '42501', null, 'La base no deja registrar un WhatsApp manual a quien se dio de baja');
select lives_ok($$ insert into public.mensaje (campana_id, canal, persona_id, creado_por)
  values ('20000000-0000-4000-8000-00000000000a', 'wa_manual',
    (select id from public.persona where lider_id = '70000000-0000-4000-8000-000000000001' and id <> (select id from dada) order by id limit 1), auth.uid()) $$,
  'A los demás, sí');
reset role;
select pruebas.como('lider_a2');
select is((select count(*) from public.baja_contacto)::int, 0, 'Otro líder no ve esa baja');
reset role;

-- Errores viejos ------------------------------------------------------------------------------------------------
insert into public.error_panel (campana_id, usuario_id, en, mensaje) values
  ('20000000-0000-4000-8000-00000000000a', pruebas.uid('gerente_a'), now() - interval '100 days', 'Error viejo'),
  ('20000000-0000-4000-8000-00000000000a', pruebas.uid('gerente_a'), now() - interval '10 days', 'Error reciente');
select pruebas.como('lider_a1');
select public.registrar_error('20000000-0000-4000-8000-00000000000a', 'Otro error', null, '/', '1', 'x');
reset role;
select is((select count(*) from public.error_panel where mensaje = 'Error viejo')::int, 0, 'Los errores de más de 90 días se borran');
select is((select count(*) from public.error_panel where mensaje = 'Error reciente')::int, 1, 'Los recientes se quedan');

select * from finish();
rollback;
