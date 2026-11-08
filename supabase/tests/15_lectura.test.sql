-- Lectura de planillas: vínculo con la hoja impresa, revisión humana de todas las filas y creación de personas con
-- su autorización (reglas 3 y 7).
begin;
select plan(25);

-- Preparación (como el servidor): un lote impreso para la líder 1, otro para el líder 3, una foto leída con tres filas.
insert into public.lote_planilla (id, campana_id, lider_id, numero, hojas, finalidades, texto_autorizacion, generado_por) values
  ('c0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000001',
   1, 2, array['contacto_campana', 'actividades_territorio'], 'Autorizo… (prueba)', pruebas.uid('gerente_a')),
  ('c0000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000003',
   2, 1, array['contacto_campana'], 'Autorizo… (prueba)', pruebas.uid('gerente_a'));
insert into public.lote_ocr (id, campana_id, lider_id, archivo_url, estado, creado_por) values
  ('d0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000005/hoja.jpg', 'leido', pruebas.uid('lider_a1'));
insert into public.fila_ocr (id, lote_id, campana_id, datos, confianza) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '{"renglon": 1}', 0.95),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '{"renglon": 2}', 0.9),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '{"renglon": 3}', 0.97);

select pruebas.como('lider_a1');
select is((select count(*) from public.planillas_por_revisar('20000000-0000-4000-8000-00000000000a'))::int, 1, 'La líder ve su planilla por revisar');
select throws_ok($$ select public.aprobar_planilla('d0000000-0000-4000-8000-000000000001', '[]') $$,
  '22023', 'Vincule la foto con su planilla impresa (código QR) antes de aprobar.', 'Sin el QR vinculado no se aprueba');
select throws_ok($$ select public.vincular_hoja_planilla('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 1) $$,
  '22023', 'El código QR es de una planilla impresa para otro líder.', 'No se vincula con la planilla de otro líder');
select throws_ok($$ select public.vincular_hoja_planilla('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 3) $$,
  '22023', 'El número de hoja no corresponde a ese lote.', 'Ni con una hoja que no existe');
select lives_ok($$ select public.vincular_hoja_planilla('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 2) $$,
  'Se vincula con su hoja impresa');
select throws_ok($$ select public.aprobar_planilla('d0000000-0000-4000-8000-000000000001',
  '[{"fila_id": "e0000000-0000-4000-8000-000000000001", "nombre": "Ana Ficticia", "firma": true}]') $$,
  '22023', 'Revise todas las filas leídas de la hoja antes de aprobar.', 'Regla 7: hay que revisar todas las filas');
reset role;

select pruebas.como('lider_a2');
select throws_ok($$ select public.aprobar_planilla('d0000000-0000-4000-8000-000000000001', '[]') $$,
  '42501', null, 'Otro líder no aprueba una planilla ajena');
select is((select count(*) from public.planillas_por_revisar('20000000-0000-4000-8000-00000000000a'))::int, 0, 'Ni la ve');
reset role;

-- Antes de aprobar, ninguna fila leída es persona.
select is((select count(*) from public.persona where origen = 'ocr')::int, 0, 'Nada leído entra a la base sin revisión');

select pruebas.como('lider_a1');
select is(public.aprobar_planilla('d0000000-0000-4000-8000-000000000001', $$[
  {"fila_id": "e0000000-0000-4000-8000-000000000001", "nombre": "Ana Ficticia Ruiz", "documento": "1.099.000.001", "telefono": "+57 300 000 9001", "firma": true, "descartar": false},
  {"fila_id": "e0000000-0000-4000-8000-000000000002", "nombre": "Sin Firma Ficticio", "documento": "", "telefono": "", "firma": false, "descartar": false},
  {"fila_id": "e0000000-0000-4000-8000-000000000003", "nombre": "Repetida Ficticia", "documento": "0000001001", "telefono": "", "firma": true, "descartar": false}
]$$::jsonb) - 'rechazos', '{"creadas": 1, "ya_existian": 1, "sin_firma": 1, "descartadas": 0}'::jsonb,
  'Aprueba: una nueva, una sin firma (no se registra) y una que ya estaba');
reset role;

select is((select count(*) from public.persona where origen = 'ocr')::int, 1, 'Solo la fila con firma y nueva entra');
select is((select lider_id from public.persona where origen = 'ocr'), '70000000-0000-4000-8000-000000000001'::uuid, 'Queda a cargo de la líder de la planilla');
select is((select a.finalidades from public.autorizacion a join public.persona p on p.id = a.persona_id where p.origen = 'ocr'),
  array['contacto_campana', 'actividades_territorio'], 'Regla 3: la autorización lleva las finalidades impresas en la planilla');
select is((select a.canal from public.autorizacion a join public.persona p on p.id = a.persona_id where p.origen = 'ocr'), 'ocr', 'Con canal OCR');
select ok((select a.evidencia_url like '%hoja.jpg (planilla impresa, lote 1, hoja 2)' from public.autorizacion a join public.persona p on p.id = a.persona_id where p.origen = 'ocr'),
  'La evidencia es la foto de la hoja impresa');
select is((select count(*) from public.fila_ocr where lote_id = 'd0000000-0000-4000-8000-000000000001' and revisada_por = pruebas.uid('lider_a1'))::int, 3,
  'Las tres filas quedan revisadas por quien aprobó');
select is((select estado from public.lote_ocr where id = 'd0000000-0000-4000-8000-000000000001'), 'aprobado', 'La planilla queda aprobada');

select pruebas.como('lider_a1');
select throws_ok($$ select public.aprobar_planilla('d0000000-0000-4000-8000-000000000001', '[]') $$,
  '22023', null, 'Una planilla aprobada no se vuelve a aprobar');
reset role;

select ok(not exists (select 1 from public.fila_ocr where lote_id = 'd0000000-0000-4000-8000-000000000001'
  and (datos -> 'revision' ? 'documento' or datos ? 'cedula_cifrada')), 'Después de aprobar, la cédula no queda en las filas');

-- Lo que guarda la lectura: la cédula va cifrada.
insert into public.lote_ocr (id, campana_id, lider_id, archivo_url, estado, creado_por) values
  ('d0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000005/hoja2.jpg', 'pendiente', pruebas.uid('lider_a1'));
select is(public.guardar_lectura_planilla('d0000000-0000-4000-8000-000000000002', $$[
  {"renglon": 1, "nombre": "Leída Ficticia", "cedula": "1099000002", "celular": "3000009002", "barrio": "Centro", "firma": true,
   "confianza": {"nombre": 0.9, "cedula": 0.6, "celular": 0.95, "barrio": 0.9, "firma": 0.99}}
]$$::jsonb), 1, 'El servidor guarda la lectura');
select ok(not exists (select 1 from public.fila_ocr where lote_id = 'd0000000-0000-4000-8000-000000000002' and (datos ? 'cedula' or datos::text like '%1099000002%')),
  'La cédula leída no queda en claro en la base');
select is((select confianza from public.fila_ocr where lote_id = 'd0000000-0000-4000-8000-000000000002'), 0.6::numeric, 'La confianza de la fila es la del campo más dudoso');

select pruebas.como('lider_a1');
select is((select cedula from public.filas_planilla('d0000000-0000-4000-8000-000000000002')), '1099000002', 'Quien revisa ve la cédula para compararla con la foto');
select throws_ok($$ select public.guardar_lectura_planilla('d0000000-0000-4000-8000-000000000002', '[]') $$, '42501', null,
  'Solo el servidor guarda lecturas');
reset role;
select pruebas.como('lider_a2');
select throws_ok($$ select * from public.filas_planilla('d0000000-0000-4000-8000-000000000002') $$, '42501', null, 'Otro líder no ve las filas');
reset role;

select * from finish();
rollback;
