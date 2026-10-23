-- Tablero del panel web: solo agregados, con el alcance de cada rol (fase 2).
begin;
select plan(14);

-- Gerente con 2FA: toda la campaña A (19 zonas, 22 líderes)
select pruebas.como('gerente_a', 'aal2');
select is((select count(*) from public.tablero_zonas('20000000-0000-4000-8000-00000000000a'))::int, 19, 'El gerente ve las 19 zonas');
select is((select sum(bruto) from public.tablero_zonas('20000000-0000-4000-8000-00000000000a'))::int,
  (select count(*) from public.persona where territorio_trabajo_id is not null)::int, 'Las zonas suman todas las personas con zona');
select is((select count(*) from public.tablero_lideres('20000000-0000-4000-8000-00000000000a'))::int, 22, 'El gerente ve los 22 líderes');
select ok((select bool_and(validados >= comprometidos and bruto >= validados) from public.tablero_zonas('20000000-0000-4000-8000-00000000000a')),
  'Validados incluye comprometidos y no supera a los registrados');
select ok((select duplicados_con_otros from public.tablero_lideres('20000000-0000-4000-8000-00000000000a')
           where lider_id = '70000000-0000-4000-8000-000000000005') >= 1, 'El líder que cargó una cédula ajena aparece con duplicados');
select throws_ok($$ select * from public.tablero_zonas('20000000-0000-4000-8000-00000000000b') $$, '42501', null,
  'El gerente de una campaña no ve el tablero de otra del mismo partido');
reset role;

-- Gerente sin 2FA: nada
select pruebas.como('gerente_a', 'aal1');
select throws_ok($$ select * from public.tablero_zonas('20000000-0000-4000-8000-00000000000a') $$, '42501', null,
  'Sin dos factores el gerente no ve el tablero');
reset role;

-- Candidata: toda la campaña, en agregado
select pruebas.como('candidata_a');
select is((select count(*) from public.tablero_zonas('20000000-0000-4000-8000-00000000000a'))::int, 19, 'La candidata ve el agregado de las 19 zonas');
select is((select count(*) from public.persona)::int, 0, 'La candidata sigue sin ver personas una por una');
reset role;

-- Coordinadora: sus 3 zonas y los líderes que trabajan en ellas
select pruebas.como('coord_a');
select is((select count(*) from public.tablero_zonas('20000000-0000-4000-8000-00000000000a'))::int, 3, 'La coordinadora solo ve sus 3 zonas');
select is((select count(*) from public.tablero_lideres('20000000-0000-4000-8000-00000000000a') where not (territorio_ids && array[
  '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003']::uuid[]))::int, 0,
  'La coordinadora no ve líderes de otras zonas');
reset role;

-- Líder, testigo y anónimo: no
select pruebas.como('lider_a1');
select throws_ok($$ select * from public.tablero_zonas('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Un líder no ve el tablero');
reset role;
select pruebas.como('testigo_a');
select throws_ok($$ select * from public.tablero_lideres('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Un testigo no ve el tablero');
reset role;
select pruebas.como_anonimo();
select throws_ok($$ select * from public.tablero_zonas('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Un anónimo no puede llamar al tablero');
reset role;

select * from finish();
rollback;
