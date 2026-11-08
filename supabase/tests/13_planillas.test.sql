-- Planillas imprimibles: quién crea lotes, numeración por campaña y quién los ve (fase 3).
begin;
select plan(20);

-- Campaña A: 20000000-…-00000000000a. Líderes: 1 (zona 1) y 3 (zona 3) están en el territorio de la coordinadora;
-- el 10 (zona 10) no. El líder b1 es de la campaña B.

select pruebas.como('gerente_a', 'aal2');
select is((select numero from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 3, array['contacto_campana'], 'Autorizo… (texto de prueba)')), 1,
  'La gerencia crea el primer lote de la campaña');
select is((select numero from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000010', 1, array['contacto_campana'], 'Autorizo… (texto de prueba)')), 2,
  'El siguiente lote toma el número siguiente');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 0, array['contacto_campana'], 'Texto') $$,
  '22023', 'Cada lote lleva entre 1 y 50 hojas.', 'No se crea un lote sin hojas');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 51, array['contacto_campana'], 'Texto') $$,
  '22023', 'Cada lote lleva entre 1 y 50 hojas.', 'Ni con más de 50 hojas');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 2, '{}', 'Texto') $$,
  '22023', 'Marque al menos una finalidad de la autorización.', 'Regla 3: la planilla sale con al menos una finalidad');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 2, array['contacto_campana'], '   ') $$,
  '22023', 'Falta el texto de autorización de la planilla.', 'Regla 3: la planilla sale con el texto de autorización');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-0000000000b1', 1, array['contacto_campana'], 'Texto') $$,
  '22023', 'Ese líder no es de esta campaña.', 'No se imprime para un líder de otra campaña');
select throws_ok($$ insert into public.lote_planilla (campana_id, lider_id, numero, hojas, finalidades, texto_autorizacion, generado_por)
  values ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000001', 99, 1, array['x'], 'x', auth.uid()) $$,
  '42501', null, 'Los lotes solo se crean con la función (no hay inserción directa)');
reset role;

select pruebas.como('coord_a');
select is((select numero from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000003', 2, array['contacto_campana'], 'Texto')), 3,
  'La coordinadora imprime para un líder de su territorio, con la numeración de toda la campaña');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000010', 1, array['contacto_campana'], 'Texto') $$,
  '42501', null, 'No imprime para un líder fuera de su territorio');
select is((select count(*) from public.lotes_planilla('20000000-0000-4000-8000-00000000000a'))::int, 2,
  'Ve solo los lotes de los líderes de su territorio');
reset role;

select pruebas.como('lider_a1');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 1, array['contacto_campana'], 'Texto') $$,
  '42501', null, 'Un líder no crea lotes');
select is((select count(*) from public.lote_planilla)::int, 1, 'La líder ve el lote que le imprimieron');
reset role;

select pruebas.como('lider_a2');
select is((select count(*) from public.lote_planilla where lider_id = '70000000-0000-4000-8000-000000000001')::int, 0,
  'Otro líder no ve los lotes ajenos');
reset role;

select pruebas.como('gerente_b', 'aal2');
select is((select count(*) from public.lote_planilla)::int, 0, 'Otra campaña no ve los lotes');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 1, array['contacto_campana'], 'Texto') $$,
  '42501', null, 'Ni imprime planillas de otra campaña');
reset role;

-- Roles sin permiso dentro de la campaña y usuarios sin campaña (el permiso no puede quedar en NULL).
select pruebas.como('candidata_a');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 1, array['contacto_campana'], 'Texto') $$, '42501', null, 'La candidatura no imprime planillas');
reset role;
select pruebas.como('testigo_a');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 1, array['contacto_campana'], 'Texto') $$, '42501', null, 'Un testigo tampoco');
reset role;
select pruebas.como('sin_campana');
select throws_ok($$ select * from public.crear_lote_planilla('20000000-0000-4000-8000-00000000000a',
  '70000000-0000-4000-8000-000000000001', 1, array['contacto_campana'], 'Texto') $$, '42501', null, 'Ni alguien sin campaña');
reset role;

select pruebas.como_anonimo();
select is((select count(*) from public.lote_planilla)::int, 0, 'Un anónimo no ve nada');
reset role;

select * from finish();
rollback;
