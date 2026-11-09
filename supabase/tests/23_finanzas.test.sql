-- Finanzas: reglas de la Ley 1475 de 2011 (10 % por aportante, privados hasta el tope, nada anónimo, fuentes
-- prohibidas, acta de personas jurídicas), terceros con documento cifrado, alcance por rol y exportación auditada.
-- Tope ficticio de la semilla: $ 450.000.000 (10 % = $ 45.000.000). Ya hay un gasto 208 de $ 4.500.000.
begin;
select plan(29);

create temporary table v (k text primary key, id uuid);
grant select, insert on v to authenticated;
create temporary table verif as select '{"extranjero": true, "ilicito": true, "anonimo": true, "procesado": true, "funcionario": true, "contratista": true}'::jsonb j;
grant select on verif to authenticated;

-- Terceros ----------------------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.registrar_tercero('20000000-0000-4000-8000-00000000000a', 'natural', 'Sin documento', '') $$,
  '22023', null, 'No se registran terceros anónimos');
insert into v values ('natural', public.registrar_tercero('20000000-0000-4000-8000-00000000000a', 'natural', 'Aportante Ficticio', '1.047.000.001'));
insert into v values ('juridica', public.registrar_tercero('20000000-0000-4000-8000-00000000000a', 'juridica', 'Empresa Ficticia S.A.S.', '900.000.001-2'));
select is(public.registrar_tercero('20000000-0000-4000-8000-00000000000a', 'natural', 'Otro nombre', '1047000001'), (select id from v where k = 'natural'),
  'El mismo documento no crea otro tercero');
reset role;
select ok((select encode(documento_cifrado, 'escape') not like '%1047000001%' from public.tercero where id = (select id from v where k = 'natural')),
  'El documento del tercero queda cifrado');

-- Ingresos ----------------------------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 101, '2027-08-01', 5000000, 'Aporte',
  'dinero', null, null, null, null, null) $$, '22023', null, 'Recursos propios: hay que decir de quién son');
select lives_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 101, '2027-08-01', 5000000, 'Aporte de la candidata',
  'dinero', null, 'La candidata', null, null, null) $$, 'Registra recursos propios de la candidata');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 102, '2027-08-02', 1000000, 'Donación',
  'dinero', null, null, null, (select j from verif), null) $$, '22023', null, 'Un aporte de particular no puede ser anónimo');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 102, '2027-08-02', 1000000, 'Donación',
  'dinero', (select id from v where k = 'natural'), null, null, '{"extranjero": true}', null) $$, '22023', null,
  'Sin todas las verificaciones de fuentes prohibidas no se registra');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 102, '2027-08-02', 1000000, 'Donación',
  'dinero', (select id from v where k = 'juridica'), null, null, (select j from verif), null) $$, '22023', null,
  'Una persona jurídica necesita el acta');
select lives_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 102, '2027-08-02', 2000000, 'Donación',
  'dinero', (select id from v where k = 'juridica'), null, 'Acta 7 de 2027', (select j from verif), null) $$, 'Con el acta, sí');
select lives_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 102, '2027-08-03', 40000000, 'Donación',
  'dinero', (select id from v where k = 'natural'), null, null, (select j from verif), null) $$, 'Un aporte dentro del 10 % del tope');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 102, '2027-08-04', 6000000, 'Otra donación',
  'dinero', (select id from v where k = 'natural'), null, null, (select j from verif), null) $$, '22023', null,
  'El mismo aportante no pasa del 10 % del tope sumando sus aportes');
select lives_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 101, '2027-08-05', 400000000, 'Préstamo familiar',
  'dinero', null, 'Hermano', null, null, null) $$, 'Privados: 447 millones, dentro del tope');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 101, '2027-08-06', 5000000, 'Otro aporte',
  'dinero', null, 'La candidata', null, null, null) $$, '22023', null, 'Los ingresos privados no pasan el tope de gastos');
select lives_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 105, '2027-08-07', 30000000, 'Anticipo',
  'dinero', null, null, null, null, null) $$, 'El anticipo estatal no cuenta como privado');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 208, '2027-08-08', 1000, 'x',
  'dinero', null, null, null, null, '20000000-0000-4000-8000-00000000000b/factura.pdf') $$, '42501', null, 'El soporte debe ser de la campaña');
select throws_ok($$ insert into public.finanza_movimiento (campana_id, tipo, codigo, valor, fecha) values
  ('20000000-0000-4000-8000-00000000000a', 'gasto', 211, 1000, '2027-08-09') $$, '42501', null,
  'Directo en la tabla no se registra: solo con las funciones');
reset role;

-- Propaganda (208): el medio es obligatorio y viaja al libro del contador.
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 208, '2027-08-10', 800000, 'Cuñas de radio',
  'dinero', null, null, null, null, null, 'FE-77') $$, '22023', null, 'La propaganda sin medio no se registra');
select lives_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 208, '2027-08-10', 800000, 'Cuñas de radio',
  'dinero', null, null, null, null, null, 'FE-77', 'radio') $$, 'Con el medio, sí');
reset role;

-- Alcance por rol -------------------------------------------------------------------------------------------------
select pruebas.como('candidata_a');
select is((select count(*) from public.finanza_movimiento)::int, 7, 'La candidata (responsable legal) ve los movimientos');
select throws_ok($$ select public.registrar_movimiento('20000000-0000-4000-8000-00000000000a', 211, '2027-08-08', 1000, 'x', 'dinero', null, null, null, null, null) $$,
  '42501', null, 'Pero no registra');
select throws_ok($$ select public.exportar_libro_finanzas('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni exporta');
reset role;
select pruebas.como('coord_a');
select is((select count(*) from public.finanza_movimiento)::int + (select count(*) from public.tercero)::int, 0, 'La coordinación no ve finanzas');
reset role;
select pruebas.como('lider_a1');
select is((select count(*) from public.tercero)::int, 0, 'Un líder no ve los aportantes');
reset role;
select pruebas.como('gerente_b', 'aal2');
select is((select count(*) from public.finanza_movimiento)::int, 0, 'Otra campaña no ve nada');
reset role;

-- Exportación y anulación -----------------------------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select is((select f ->> 'documento' from jsonb_array_elements(public.exportar_libro_finanzas('20000000-0000-4000-8000-00000000000a') -> 'filas') f
  where f ->> 'tercero' = 'Aportante Ficticio'), '1047000001', 'El libro para el contador trae el documento descifrado');
reset role;
select is((select count(*) from public.auditoria where accion = 'exportar_libro_finanzas')::int, 1, 'La exportación queda en la auditoría');

select pruebas.como('lider_a1');
select throws_ok($$ select public.anular_movimiento((select id from public.finanza_movimiento limit 1)) $$, '42501', null, 'Un líder no anula');
reset role;
select pruebas.como('gerente_a', 'aal2');
select lives_ok($$ select public.anular_movimiento((select id from public.finanza_movimiento where codigo = 105)) $$, 'La dirección anula un movimiento');
reset role;
select ok(exists (select 1 from public.auditoria where accion = 'delete' and entidad = 'finanza_movimiento'), 'Y la anulación queda en la auditoría');

select * from finish();
rollback;
