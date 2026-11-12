-- Crear una campaña después de una venta: solo con la clave de servicio, con sus zonas y la invitación del gerente.
begin;
select plan(14);

-- Nadie del panel puede crear campañas
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select * from public.crear_campana('X', 'Gobernación', '18', '2027-10-31', 1000, 'x@ficticio.co') $$,
  '42501', null, 'La dirección de otra campaña no puede crear campañas');
reset role;
select pruebas.como_anonimo();
select throws_ok($$ select * from public.crear_campana('X', 'Gobernación', '18', '2027-10-31', 1000, 'x@ficticio.co') $$,
  '42501', null, 'Sin sesión, tampoco');
reset role;

-- Validaciones
set local role service_role;
select throws_ok($$ select * from public.crear_campana('X', 'Gobernación', '99', '2027-10-31', 1000, 'x@ficticio.co') $$,
  '22023', null, 'Un código DANE que no existe se rechaza');
select throws_ok($$ select * from public.crear_campana('X', 'Gobernación', '18', '2020-10-31', 1000, 'x@ficticio.co') $$,
  '22023', null, 'Una fecha pasada se rechaza');
select throws_ok($$ select * from public.crear_campana('X', 'Gobernación', '18', '2027-10-31', 0, 'x@ficticio.co') $$,
  '22023', null, 'Una meta en cero se rechaza');
select throws_ok($$ select * from public.crear_campana('X', 'Gobernación', '18', '2027-10-31', 1000, 'no-es-correo') $$,
  '22023', null, 'Un correo inválido se rechaza');

-- Gobernación: una zona por municipio del departamento, con forma ilustrativa
create temporary table nueva on commit drop as
  select * from public.crear_campana('Candidata Ficticia', 'Gobernación del Caquetá', '18', '2027-10-31', 50000,
    ' Gerente.Nueva@Ficticio.co ', 'Movimiento Ficticio', 300000000);
reset role;
select is((select zonas from nueva), (select count(*)::int from public.territorio where campana_id is null
  and padre_id = '30000000-0000-4000-8000-000000000013'), 'Crea una zona por cada municipio del departamento');
select is((select nombre from public.territorio where campana_id = (select campana_id from nueva) order by nombre limit 1),
  'Florencia', 'La zona lleva el nombre del municipio');
select ok((select bool_and(geom is not null) from public.territorio where campana_id = (select campana_id from nueva)),
  'Las zonas con puestos tienen forma para el mapa');
select is((select cargo || ' | ' || circunscripcion_divipole || ' | ' || meta_votos || ' | ' || tope_gastos from public.campana where id = (select campana_id from nueva)),
  'Gobernación del Caquetá | 18 | 50000 | 300000000', 'La campaña queda con sus datos y su tope');
select is((select rol || ' ' || correo from public.invitacion where campana_id = (select campana_id from nueva)),
  'gerente gerente.nueva@ficticio.co', 'Queda la invitación del gerente, con el correo en minúsculas');
select is((select token_hash from public.invitacion where campana_id = (select campana_id from nueva)),
  encode(extensions.digest((select codigo_invitacion from nueva), 'sha256'), 'hex'), 'El código devuelto es el de la invitación');
select is((select count(*)::int from public.auditoria where campana_id = (select campana_id from nueva) and accion = 'crear_campana'), 1,
  'Queda en la auditoría');

-- Alcaldía sin comunas cargadas: una sola zona con todo el municipio
set local role service_role;
create temporary table alcaldia on commit drop as
  select * from public.crear_campana('Otro Ficticio', 'Alcaldía de Florencia', '18001', '2027-10-31', 20000, 'otro@ficticio.co');
reset role;
select is((select array_agg(nombre) from public.territorio where campana_id = (select campana_id from alcaldia)),
  array['Todo Florencia'], 'Sin comunas oficiales, la alcaldía arranca con una zona de todo el municipio');

select * from finish();
rollback;
