-- Datos y cumplimiento: plazos, solicitudes de titulares, resumen y exportaciones (fase 2).
begin;
select plan(20);

-- Días hábiles: mismas fechas que packages/nucleo/src/plazos.test.ts
select is((select count(*) from privado.festivos(2026))::int, 18, 'Colombia tiene 18 festivos en 2026');
select ok('2026-11-02'::date in (select privado.festivos(2026)), 'Todos los Santos 2026 se traslada al lunes 2 de noviembre');
select ok('2026-05-18'::date in (select privado.festivos(2026)), 'La Ascensión 2026 cae el lunes 18 de mayo');
select is(privado.sumar_dias_habiles('2026-10-23', 10), '2026-11-09'::date, 'Consulta recibida el 23/10/2026 vence el 09/11/2026');
select is(privado.sumar_dias_habiles('2026-10-23', 15), '2026-11-17'::date, 'Reclamo recibido el 23/10/2026 vence el 17/11/2026');

-- Solicitudes
select pruebas.como('gerente_a', 'aal2');
create temporary table s on commit drop as
select public.registrar_solicitud_titular('20000000-0000-4000-8000-00000000000a', 'conocer',
  '80000000-0000-4000-8000-000000000101', 'Pide saber qué datos tenemos', '2026-10-23') as id;
grant select on s to authenticated;
select is((select to_char(vence_en at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') from public.solicitud_titular where id = (select id from s)),
  '2026-11-09 23:59', 'La consulta vence al final del décimo día hábil');
select is((select to_char(public.prorrogar_solicitud_titular((select id from s)) at time zone 'America/Bogota', 'YYYY-MM-DD')),
  '2026-11-17', 'La prórroga de una consulta suma 5 días hábiles');
select throws_ok($$ select public.prorrogar_solicitud_titular((select id from s)) $$, '22023', null, 'Solo se prorroga una vez');
select throws_ok($$ select public.registrar_solicitud_titular('20000000-0000-4000-8000-00000000000a', 'otra cosa') $$,
  '22023', null, 'Un tipo desconocido no se acepta');
select throws_ok($$ select public.registrar_solicitud_titular('20000000-0000-4000-8000-00000000000a', 'conocer', null, null, current_date + 30) $$,
  '22023', null, 'La fecha de recibo no puede ser futura');

-- Búsqueda por cédula exacta (sin guardarla en claro) y revocatoria
select is((select count(*) from public.buscar_personas('20000000-0000-4000-8000-00000000000a', '0000001001'))::int, 2,
  'La dirección encuentra por cédula a la persona y a su duplicado sembrado (misma cédula, otro líder)');
select is(public.revocar_autorizaciones_de('80000000-0000-4000-8000-000000000101'), 1, 'Se revocan sus autorizaciones vigentes');
select ok(not public.autorizada_para('80000000-0000-4000-8000-000000000101', 'contacto_campana'), 'Y ya no está autorizada para contacto');

-- Exportación
create temporary table e on commit drop as
select public.exportar_personas('20000000-0000-4000-8000-00000000000a') as r;
grant select on e to authenticated;
select ok((select jsonb_array_length(r -> 'filas') from e) > 0, 'La dirección exporta personas con autorización vigente');
select ok((select not (r -> 'filas') @> '[{"nombre": "x"}]' and (r ->> 'filas') !~ '000000\d{4}' from e),
  'La exportación no incluye cédulas');
select is((select count(*) from e, jsonb_array_elements(r -> 'filas') f
  where f ->> 'nombre' = (select nombre from public.persona where id = '80000000-0000-4000-8000-000000000101'))::int, 0,
  'Quien revocó su autorización no sale en la exportación');
select is((select (detalle ->> 'cantidad')::int from public.auditoria where accion = 'exportar_personas'
           and detalle ->> 'referencia' = (select r ->> 'referencia' from e)),
  (select jsonb_array_length(r -> 'filas') from e), 'La exportación queda en la auditoría con su referencia y cantidad');
select ok((public.resumen_cumplimiento('20000000-0000-4000-8000-00000000000a') ->> 'exportaciones_30_dias')::int >= 1,
  'El resumen cuenta las exportaciones');
reset role;

-- Quién no puede
select pruebas.como('coord_a');
select throws_ok($$ select public.exportar_personas('20000000-0000-4000-8000-00000000000a') $$, '42501', null,
  'La coordinación no exporta la base');
reset role;
select pruebas.como('candidata_a');
select throws_ok($$ select public.exportar_personas('20000000-0000-4000-8000-00000000000a') $$, '42501', null,
  'El candidato ve el resumen, pero no exporta personas');
reset role;

select * from finish();
rollback;
