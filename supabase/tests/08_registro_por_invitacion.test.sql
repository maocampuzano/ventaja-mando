-- Registro solo por invitación y validaciones de crear_invitacion (fase 2).
begin;
select plan(10);

select pruebas.como('gerente_a', 'aal2');
select ok(length(public.crear_invitacion('20000000-0000-4000-8000-00000000000a', ' Lider.Nueva@Ejemplo.co ', 'lider',
  array['50000000-0000-4000-8000-000000000007']::uuid[])) >= 32, 'El gerente invita a una líder a su zona');
select throws_ok($$ select public.crear_invitacion('20000000-0000-4000-8000-00000000000a', 'sin-arroba', 'testigo') $$,
  '22023', null, 'Un correo inválido no se acepta');
select throws_ok($$ select public.crear_invitacion('20000000-0000-4000-8000-00000000000a', 'c@ejemplo.co', 'coordinador') $$,
  '22023', null, 'Coordinación sin zonas no se acepta');
select throws_ok($$ select public.crear_invitacion('20000000-0000-4000-8000-00000000000a', 'c@ejemplo.co', 'lider',
  array['50000000-0000-4000-8000-0000000000b1']::uuid[]) $$, '22023', null, 'No se puede invitar a una zona de otra campaña');
select throws_ok($$ select public.crear_invitacion('20000000-0000-4000-8000-00000000000a', 'c@ejemplo.co', 'testigo', '{}', 90) $$,
  '22023', null, 'La vigencia no pasa de 30 días');
select lives_ok($$ select public.crear_invitacion('20000000-0000-4000-8000-00000000000a', 'lider.nueva@ejemplo.co', 'lider',
  array['50000000-0000-4000-8000-000000000008']::uuid[]) $$, 'Reinvitar el mismo correo reemplaza la invitación anterior');
reset role;
select is((select count(*) from public.invitacion where correo = 'lider.nueva@ejemplo.co' and aceptada_en is null)::int, 1,
  'Queda una sola invitación vigente por correo');

-- El hook de registro
select is(privado.antes_de_crear_usuario('{"user": {"email": "LIDER.NUEVA@ejemplo.co"}}'), '{}'::jsonb,
  'Un correo con invitación vigente puede crear su cuenta');
select is(privado.antes_de_crear_usuario('{"user": {"email": "cualquiera@ejemplo.co"}}') -> 'error' ->> 'http_code', '403',
  'Un correo sin invitación no puede crear cuenta');
update public.invitacion set expira_en = now() - interval '1 day' where correo = 'lider.nueva@ejemplo.co';
select is(privado.antes_de_crear_usuario('{"user": {"email": "lider.nueva@ejemplo.co"}}') -> 'error' ->> 'http_code', '403',
  'Con la invitación vencida tampoco');

select * from finish();
rollback;
