-- Duplicados explicables (diseño §7.1) y fusión con auditoría.
begin;
select plan(13);

select pruebas.como('gerente_a', 'aal2');

select results_eq(
  $$ select a, b, puntaje, razones from public.posibles_duplicados('20000000-0000-4000-8000-00000000000a')
     where '80000000-0000-4000-8000-000000009001' in (a, b) $$,
  $$ values ('80000000-0000-4000-8000-000000000101'::uuid, '80000000-0000-4000-8000-000000009001'::uuid, 0.7::numeric, array['mismo documento']) $$,
  'La misma cédula cargada por dos líderes aparece como posible duplicado, con su razón');

-- Pesos del 24/10/2026: mismo celular (0,3) + mismo nombre (0,2) + misma zona (0,05) = 0,55.
select results_eq(
  $$ select puntaje, razones from public.posibles_duplicados('20000000-0000-4000-8000-00000000000a')
     where '80000000-0000-4000-8000-000000009002' in (a, b) $$,
  $$ values (0.55::numeric, array['mismo teléfono', 'nombre similar (100 %)', 'mismo territorio']) $$,
  'Mismo celular y nombre sin cédula sí aparecen como posible duplicado (igual que en packages/nucleo)');

select is((select count(*) from public.posibles_duplicados('20000000-0000-4000-8000-00000000000a') d
           join public.persona p on p.id in (d.a, d.b) where p.campana_id <> '20000000-0000-4000-8000-00000000000a')::int, 0,
  'Nunca se cruzan personas de otra campaña, aunque tengan la misma cédula');

select ok((select bool_and(a < b) from public.posibles_duplicados('20000000-0000-4000-8000-00000000000a')),
  'Cada par aparece una sola vez');
reset role;

-- El líder solo compara lo que ve
select pruebas.como('lider_a1');
select is((select count(*) from public.posibles_duplicados('20000000-0000-4000-8000-00000000000a')
           where '80000000-0000-4000-8000-000000009001' in (a, b))::int, 0,
  'Un líder no descubre por duplicados a personas que no puede ver');
select throws_like(
  $$ select public.fusionar_personas('80000000-0000-4000-8000-000000000101', '80000000-0000-4000-8000-000000000102', 'prueba') $$,
  '%No puede fusionar%', 'Un líder no puede fusionar personas');
reset role;

-- Fusión
select pruebas.como('gerente_a', 'aal2');
select throws_like(
  $$ select public.fusionar_personas('80000000-0000-4000-8000-000000000101', '80000000-0000-4000-8000-000000009001', '  ') $$,
  '%motivo%', 'La fusión exige un motivo');
select throws_like(
  $$ select public.fusionar_personas('80000000-0000-4000-8000-000000000101', '80000000-0000-4000-8000-0000000b0001', 'otra campaña') $$,
  '%No puede fusionar%', 'No se fusiona con una persona de otra campaña');
select lives_ok(
  $$ select public.fusionar_personas('80000000-0000-4000-8000-000000000101', '80000000-0000-4000-8000-000000009001', 'Misma cédula, cargada por dos líderes') $$,
  'El gerente fusiona el duplicado');
select is((select count(*) from public.persona where id = '80000000-0000-4000-8000-000000009001')::int, 0, 'La persona duplicada ya no existe');
select is((select count(*) from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000101')::int, 2,
  'Las autorizaciones de la duplicada se conservan en la persona que queda');
select is((select detalle ->> 'motivo' from public.auditoria where accion = 'fusionar'), 'Misma cédula, cargada por dos líderes',
  'La fusión queda en la auditoría con su motivo');
select is((select count(*) from public.auditoria where accion = 'delete' and entidad = 'persona'
           and entidad_id = '80000000-0000-4000-8000-000000009001')::int, 1,
  'El borrado de la duplicada también queda en la auditoría');
reset role;

select * from finish();
rollback;
