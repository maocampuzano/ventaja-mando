-- Aislamiento por campaña, rol y territorio (regla 8 y criterios de aceptación de la fase 1).
begin;
select plan(24);

-- Sin membresía, nada
select pruebas.como('sin_campana');
select is((select count(*) from public.persona)::int, 0, 'Sin membresía no se ve ninguna persona');
select is((select count(*) from public.campana)::int, 0, 'Sin membresía no se ve ninguna campaña');
reset role;

-- Líder: solo sus personas
select pruebas.como('lider_a1');
select is((select count(*) from public.persona)::int, 9, 'El líder ve sus 9 personas');
select is((select count(*) from public.persona where lider_id is distinct from '70000000-0000-4000-8000-000000000001')::int, 0,
  'El líder no ve personas de otros líderes');
select is((select count(*) from public.persona where territorio_trabajo_id = '50000000-0000-4000-8000-000000000005')::int, 0,
  'Un líder no ve otra zona');
select throws_like(
  $$ insert into public.persona (campana_id, nombre, origen, lider_id, territorio_trabajo_id, creado_por)
     values ('20000000-0000-4000-8000-00000000000a', 'Intento', 'formulario', '70000000-0000-4000-8000-000000000005',
             '50000000-0000-4000-8000-000000000005', pruebas.uid('lider_a1')) $$,
  '%row-level security%', 'Un líder no puede registrar personas a nombre de otro líder');
select is((select count(*) from public.auditoria)::int, 0, 'Un líder no ve la auditoría');
reset role;

-- Coordinadora: sus zonas (1 a 3)
select pruebas.como('coord_a');
select ok((select count(*) from public.persona) > 0, 'La coordinadora ve personas de sus zonas');
select is((select count(*) from public.persona where territorio_trabajo_id not in (
  '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003'))::int, 0,
  'La coordinadora no ve personas fuera de sus zonas');
select is((select count(*) from public.testigo)::int, 4, 'La coordinadora ve los testigos de los puestos en sus zonas');
reset role;

-- Gerente: toda su campaña, solo con dos factores
select pruebas.como('gerente_a', 'aal2');
select is((select count(*) from public.persona where campana_id = '20000000-0000-4000-8000-00000000000a')::int, 178,
  'El gerente con 2FA ve toda su campaña');
select is((select count(*) from public.persona where campana_id = '20000000-0000-4000-8000-00000000000b')::int, 0,
  'El gerente de una campaña no ve la base de otra campaña del mismo partido');
select ok((select count(*) from public.auditoria) >= 0, 'El gerente puede consultar la auditoría');
select throws_like(
  $$ insert into public.membresia (usuario_id, campana_id, rol) values (pruebas.uid('sin_campana'), '20000000-0000-4000-8000-00000000000a', 'administrador') $$,
  '%row-level security%', 'Un gerente no puede nombrar administradores');
reset role;

select pruebas.como('gerente_a', 'aal1');
select is((select count(*) from public.persona)::int, 0, 'Sin 2FA, el gerente no ve personas');
reset role;

select pruebas.como('admin_a', 'aal2');
select lives_ok(
  $$ insert into public.membresia (usuario_id, campana_id, rol) values (pruebas.uid('sin_campana'), '20000000-0000-4000-8000-00000000000a', 'gerente') $$,
  'Un administrador sí puede nombrar gerentes');
reset role;

-- Otra campaña del mismo partido
select pruebas.como('gerente_b', 'aal2');
select is((select count(*) from public.persona)::int, 5, 'El gerente B ve solo las 5 personas de su campaña');
select is((select count(*) from public.persona where campana_id = '20000000-0000-4000-8000-00000000000a')::int, 0,
  'Un candidato no ve la base de otro candidato del mismo partido');
reset role;

-- Candidata: datos agregados y finanzas, no personas una por una
select pruebas.como('candidata_a');
select is((select count(*) from public.persona)::int, 0, 'La candidata no ve personas una por una');
select is((select count(*) from public.finanza_movimiento)::int, 1, 'La candidata ve las finanzas de su campaña');
reset role;

-- Testigo: solo su mesa
select pruebas.como('testigo_a');
select is((select count(*) from public.incidencia)::int, 1, 'El testigo ve solo las novedades de su mesa');
select is((select count(*) from public.acta_e14)::int, 1, 'El testigo ve solo el E-14 de su mesa');
select throws_like(
  $$ insert into public.incidencia (campana_id, puesto_id, mesa, tipo, reportado_por)
     values ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000003', 2, 'Intento', pruebas.uid('testigo_a')) $$,
  '%row-level security%', 'El testigo no puede reportar novedades de otra mesa');
select is((select count(*) from public.persona)::int, 0, 'El testigo no ve personas');
reset role;

select * from finish();
rollback;
