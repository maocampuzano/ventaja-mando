-- Invitaciones por rol.
begin;
select plan(8);

create temporary table codigos (nombre text primary key, codigo text);
grant all on codigos to authenticated;

select pruebas.como('gerente_a', 'aal2');
insert into codigos values ('coord', public.crear_invitacion('20000000-0000-4000-8000-00000000000a', 'Nueva.Coord@Ejemplo.co', 'coordinador',
  array['50000000-0000-4000-8000-000000000004']::uuid[]));
select ok(length((select codigo from codigos where nombre = 'coord')) >= 32, 'El gerente crea una invitación con un código largo');
select is((select count(*) from public.invitacion where token_hash = (select codigo from codigos where nombre = 'coord'))::int, 0,
  'En la base solo queda el hash del código, no el código');
select throws_like(
  $$ select public.crear_invitacion('20000000-0000-4000-8000-00000000000a', 'otro@ejemplo.co', 'administrador') $$,
  '%row-level security%', 'Un gerente no puede invitar administradores');
reset role;

insert into auth.users (id, email) values ('40000000-0000-4000-8000-0000000000c1', 'nueva.coord@ejemplo.co');
insert into auth.users (id, email) values ('40000000-0000-4000-8000-0000000000c2', 'intrusa@ejemplo.co');

select pruebas.como('intrusa');
select throws_like($$ select public.aceptar_invitacion((select codigo from codigos where nombre = 'coord'), 'Intrusa') $$,
  '%otro correo%', 'Otra persona no puede usar la invitación');
reset role;

select pruebas.como('nueva.coord');
select is(public.aceptar_invitacion((select codigo from codigos where nombre = 'coord'), 'Nueva Coordinadora'),
  '20000000-0000-4000-8000-00000000000a'::uuid, 'La persona invitada acepta con su correo');
select is((select rol || ':' || territorio_ids[1] from public.membresia where usuario_id = auth.uid()),
  'coordinador:50000000-0000-4000-8000-000000000004', 'Queda con el rol y el territorio de la invitación');
select ok((select count(*) from public.persona) > 0, 'Y ya ve las personas de su territorio');
select throws_like($$ select public.aceptar_invitacion((select codigo from codigos where nombre = 'coord'), 'Otra vez') $$,
  '%ya se usó%', 'Una invitación no se puede usar dos veces');
reset role;

select * from finish();
rollback;
