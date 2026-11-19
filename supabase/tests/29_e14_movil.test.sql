-- APK del E-14: la misma imagen (misma huella) no crea dos actas; ping_movil solo con sesión.
begin;
select plan(6);

select pruebas.como('testigo_a');
select is(public.registrar_e14_movil('d1000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
  '60000000-0000-4000-8000-000000000001', 3, '20000000-0000-4000-8000-00000000000a/' || auth.uid() || '/d1.jpg',
  'ABCDEF0123456789abcdef0123456789'), 'creada', 'El testigo envía la foto con su huella');
select is(public.registrar_e14_movil('d1000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a',
  '60000000-0000-4000-8000-000000000001', 3, '20000000-0000-4000-8000-00000000000a/' || auth.uid() || '/d2.jpg',
  'abcdef0123456789abcdef0123456789'), 'ya_estaba', 'La misma imagen con otro envío no crea otra acta');
select is(public.registrar_e14_movil('d1000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a',
  '60000000-0000-4000-8000-000000000001', 3, '20000000-0000-4000-8000-00000000000a/' || auth.uid() || '/d3.jpg',
  null), 'creada', 'Sin huella (versiones anteriores de la app) sigue funcionando');
select is(public.ping_movil(), true, 'Con sesión, el servidor responde');
reset role;
select is((select count(*)::int from public.acta_e14 where id::text like 'd1000000%'), 2, 'Quedaron dos actas, no tres');
select pruebas.como_anonimo();
select throws_ok($$ select public.ping_movil() $$, '42501', null, 'Sin sesión no se puede usar');
reset role;

select * from finish();
rollback;
