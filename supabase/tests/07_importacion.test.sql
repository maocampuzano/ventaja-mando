-- Importación de personas: autorización obligatoria, territorio de quien importa y auditoría (fase 2).
begin;
select plan(15);

-- La coordinadora (zonas 1 a 3) importa cinco filas.
select pruebas.como('coord_a');
create temporary table resultado on commit drop as
select public.importar_personas(
  '20000000-0000-4000-8000-00000000000a',
  '[
    {"numero": 2, "nombre": "Importada Uno", "documento": "0009990001", "telefono": "3000009901",
     "zona_id": "50000000-0000-4000-8000-000000000001", "fecha_autorizacion": "2026-03-05"},
    {"numero": 3, "nombre": "Fuera De Zona", "documento": "0009990002", "zona_id": "50000000-0000-4000-8000-000000000009"},
    {"numero": 4, "nombre": "Ya Existe", "documento": "0000001001", "zona_id": "50000000-0000-4000-8000-000000000001"},
    {"numero": 5, "nombre": "Cédula Mala", "documento": "12", "zona_id": "50000000-0000-4000-8000-000000000002"},
    {"numero": 6, "nombre": "Sin Zona", "documento": "0009990003"}
  ]'::jsonb,
  array['contacto_campana'], 'Planillas físicas firmadas, archivadas en la sede', 'base-zona-1.xlsx') as r;

select is((select (r ->> 'creadas')::int from resultado), 1, 'Solo se crea la fila válida de su zona');
select is((select (r ->> 'ya_existian')::int from resultado), 1, 'La cédula que ya está en su zona no se duplica');
select is((select jsonb_agg(x -> 'numero' order by (x ->> 'numero')::int) from resultado, jsonb_array_elements(r -> 'rechazos') x),
  '[3, 4, 5, 6]'::jsonb, 'Las demás filas vuelven con su motivo');
select is((select x ->> 'motivo' from resultado, jsonb_array_elements(r -> 'rechazos') x where x ->> 'numero' = '3'),
  'La zona no está en su territorio.', 'Fuera de su territorio no puede importar');
select is((select x ->> 'motivo' from resultado, jsonb_array_elements(r -> 'rechazos') x where x ->> 'numero' = '6'),
  'La zona no está en su territorio.', 'Sin zona, la coordinadora tampoco puede importar');
select ok((select r::text from resultado) !~ '0009990', 'La respuesta nunca incluye cédulas');

select is((select count(*) from public.persona where nombre = 'Importada Uno' and origen = 'importacion' and documento_cifrado is not null)::int, 1,
  'La persona importada queda con la cédula cifrada');
select is((select a.canal || '|' || to_char(a.fecha at time zone 'America/Bogota', 'YYYY-MM-DD') || '|' || array_to_string(a.finalidades, ',')
  from public.autorizacion a join public.persona p on p.id = a.persona_id where p.nombre = 'Importada Uno'),
  'importacion|2026-03-05|contacto_campana', 'Su autorización trae canal, fecha del archivo y finalidades');
reset role;

select is((select (detalle ->> 'creadas')::int || '/' || (detalle ->> 'filas') || '/' || (detalle ->> 'archivo') from public.auditoria
  where accion = 'importar_personas' order by id desc limit 1), '1/5/base-zona-1.xlsx', 'La importación queda en la auditoría');
select ok((select detalle::text from public.auditoria where accion = 'importar_personas' order by id desc limit 1) !~ '0009990',
  'La auditoría no guarda cédulas');

-- Una cédula de otra zona no se revela a la coordinadora: la fila entra y la dirección lo verá como posible duplicado.
select pruebas.como('coord_a');
select is((public.importar_personas('20000000-0000-4000-8000-00000000000a',
  '[{"numero": 2, "nombre": "Otra Zona Misma Cédula", "documento": "0000005001", "zona_id": "50000000-0000-4000-8000-000000000002"}]'::jsonb,
  array['contacto_campana'], 'Planilla', 'x.csv') ->> 'creadas')::int, 1, 'No revela si una cédula existe fuera de su territorio');
reset role;

-- Quién no puede
select pruebas.como('lider_a1');
select throws_ok($$ select public.importar_personas('20000000-0000-4000-8000-00000000000a', '[{"numero":2,"nombre":"Ana Ruiz"}]', array['contacto_campana'], 'x', 'x') $$,
  '42501', null, 'Un líder no importa desde el panel');
reset role;
select pruebas.como('gerente_a', 'aal1');
select throws_ok($$ select public.importar_personas('20000000-0000-4000-8000-00000000000a', '[{"numero":2,"nombre":"Ana Ruiz"}]', array['contacto_campana'], 'x', 'x') $$,
  '42501', null, 'Sin dos factores, el gerente no importa');
reset role;
select pruebas.como('gerente_a', 'aal2');
select throws_ok($$ select public.importar_personas('20000000-0000-4000-8000-00000000000a', '[{"numero":2,"nombre":"Ana Ruiz"}]', array[]::text[], 'x', 'x') $$,
  '22023', null, 'Sin finalidades no hay autorización y no se importa');
select throws_ok($$ select public.importar_personas('20000000-0000-4000-8000-00000000000a',
  (select jsonb_agg(jsonb_build_object('numero', i, 'nombre', 'Persona ' || i)) from generate_series(1, 1001) i), array['contacto_campana'], 'x', 'x') $$,
  '22023', null, 'Más de 1.000 filas por lote no se aceptan');
reset role;

select * from finish();
rollback;
