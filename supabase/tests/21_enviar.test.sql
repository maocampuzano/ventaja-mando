-- Solo la dirección de la campaña pide enviar; para cualquier otro (o un envío que no existe) es false, nunca NULL.
begin;
select plan(5);
insert into public.envio (id, campana_id, canal, nombre, cuerpo, creado_por) values
  ('e1000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'sms', 'Prueba', 'Hola', pruebas.uid('gerente_a'));
select pruebas.como('gerente_a', 'aal2');
select ok(public.puede_enviar('e1000000-0000-4000-8000-000000000001'), 'La dirección puede enviar');
reset role;
select pruebas.como('candidata_a');
select is(public.puede_enviar('e1000000-0000-4000-8000-000000000001'), false, 'La candidata no');
reset role;
select pruebas.como('gerente_b', 'aal2');
select is(public.puede_enviar('e1000000-0000-4000-8000-000000000001'), false, 'Otra campaña no');
reset role;
select pruebas.como('sin_campana');
select is(public.puede_enviar('e1000000-0000-4000-8000-000000000001'), false, 'Alguien sin campaña no');
select is(public.puede_enviar('00000000-0000-4000-8000-000000000000'), false, 'Un envío que no existe da false');
reset role;
select * from finish();
rollback;
