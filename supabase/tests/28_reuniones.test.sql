-- Reuniones y actas: quién ve y registra, compromisos sin dinero (regla 4), texto limpio de datos de contacto,
-- aprobar crea tareas, base de conocimiento y agregados sin nombres.
begin;
select plan(27);

create temporary table v (k text primary key, id uuid);
grant select, insert on v to authenticated;

-- Zona 1 (de la coordinadora) y zona 10 (fuera de su alcance).
select pruebas.como('gerente_a', 'aal2');
insert into v values ('r1', public.guardar_reunion('20000000-0000-4000-8000-00000000000a', null, 'Reunión con líderes de Florencia',
  'lideres', '2027-03-10 18:00-05', 'Salón comunal', '50000000-0000-4000-8000-000000000001', 'programada', 0,
  array['70000000-0000-4000-8000-000000000001']::uuid[], array[pruebas.uid('coord_a')]));
insert into v values ('r10', public.guardar_reunion('20000000-0000-4000-8000-00000000000a', null, 'Reunión comunitaria zona 10',
  'comunitaria', '2027-03-11 17:00-05', null, '50000000-0000-4000-8000-000000000010', 'programada', 0));
select is((select count(*)::int from public.reunion_asistente where reunion_id = (select id from v where k = 'r1')), 2,
  'La reunión guarda sus asistentes del equipo y líderes');
select throws_ok($$ select public.guardar_reunion('20000000-0000-4000-8000-00000000000a', null, 'Reunión de prueba', 'otra', now(), null, null, null, 0,
  '{}', array['40000000-0000-4000-8000-000000000008']::uuid[]) $$, '22023', null, 'No se agrega gente de otra campaña');
reset role;

-- Quién ve
select pruebas.como('candidata_a');
select is((select count(*)::int from public.reunion), 2, 'La candidatura ve todas las reuniones');
select lives_ok($$ select public.guardar_reunion('20000000-0000-4000-8000-00000000000a', null, 'Reunión de la candidata', 'sectorial',
  '2027-03-12 09:00-05', null, null, 'programada', 0) $$, 'La candidatura registra reuniones');
reset role;
select pruebas.como('coord_a');
select is((select count(*)::int from public.reunion), 1, 'La coordinación ve solo las de sus zonas');
select throws_ok($$ select public.guardar_reunion('20000000-0000-4000-8000-00000000000a', null, 'Fuera de zona', 'otra', now(), null,
  '50000000-0000-4000-8000-000000000010', null, 0) $$, '42501', null, 'Y no registra fuera de ellas');
reset role;
select pruebas.como('lider_a1');
select is((select count(*)::int from public.reunion), 0, 'Un líder no ve reuniones');
select throws_ok($$ select public.guardar_reunion('20000000-0000-4000-8000-00000000000a', null, 'Reunión de prueba', 'otra', now(), null,
  '50000000-0000-4000-8000-000000000001', null, 0) $$, '42501', null, 'Ni las registra');
reset role;
select pruebas.como('gerente_b', 'aal2');
select is((select count(*)::int from public.reunion), 0, 'Otra campaña no ve nada');
reset role;
select pruebas.como_anonimo();
select throws_ok($$ select * from public.buscar_actas('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Sin sesión no se busca');
reset role;

-- Acta
select pruebas.como('coord_a');
select throws_ok($$ select public.guardar_acta((select id from v where k = 'r1'), 'Resumen', '{}', '',
  '[{"descripcion": "Llevar mercados a las familias que voten"}]') $$, '22023', null, 'Regla 4: un compromiso con mercados se rechaza');
select throws_ok($$ select public.guardar_acta((select id from v where k = 'r1'), 'Resumen', '{}', '',
  '[{"descripcion": "Dar $ 50.000 por asistente"}]') $$, '22023', null, 'Regla 4: ni con dinero');
insert into v values ('a1', public.guardar_acta((select id from v where k = 'r1'),
  'Los líderes pidieron arreglar la vía a la vereda y mejorar el alumbrado. Doña Ana dejó su celular 310 000 1234 y su correo ana@ficticio.co.',
  array['Vías', 'Alumbrado', 'vías'], 'Volver a reunirse en un mes.',
  jsonb_build_array(jsonb_build_object('descripcion', 'Visitar la vereda con el equipo técnico', 'responsable_id', pruebas.uid('coord_a'), 'vence_en', '2027-03-20')),
  'ia'));
select is((select origen from public.acta where id = (select id from v where k = 'a1')), 'ia', 'El acta recuerda que la redactó la IA');
reset role;
select ok((select resumen not like '%310 000 1234%' and resumen not like '%ana@ficticio.co%' from public.acta where id = (select id from v where k = 'a1')),
  'El acta se guarda sin teléfonos ni correos');
select is((select temas from public.acta where id = (select id from v where k = 'a1')), array['alumbrado', 'vías'],
  'Los temas quedan sin repetir y en minúscula');
select is((select estado from public.reunion where id = (select id from v where k = 'r1')), 'realizada', 'Con acta, la reunión queda realizada');
select is((select count(*)::int from public.buscar_actas('20000000-0000-4000-8000-00000000000a')), 0,
  'Un acta en borrador todavía no está en la base de conocimiento');

select pruebas.como('coord_a');
select is(public.aprobar_acta((select id from v where k = 'a1')), 1, 'Aprobar el acta crea una tarea por compromiso');
select throws_ok($$ select public.guardar_acta((select id from v where k = 'r1'), 'Otro resumen', '{}', '', '[]') $$, '22023', null,
  'Un acta aprobada no se modifica');
reset role;
select is((select t.tipo || ' ' || t.asignado_a::text from public.tarea t join public.acta_compromiso c on c.tarea_id = t.id
  where c.acta_id = (select id from v where k = 'a1')), 'compromiso ' || pruebas.uid('coord_a')::text, 'La tarea queda asignada al responsable');

-- Base de conocimiento y agregados
select pruebas.como('candidata_a');
select is((select titulo from public.buscar_actas('20000000-0000-4000-8000-00000000000a', 'alumbrado')), 'Reunión con líderes de Florencia',
  'La búsqueda encuentra el acta por lo que se habló');
select is((select count(*)::int from public.buscar_actas('20000000-0000-4000-8000-00000000000a', 'piscina olímpica')), 0, 'Y no inventa resultados');
select is((select temas from public.resumen_reuniones('20000000-0000-4000-8000-00000000000a') where territorio_id = '50000000-0000-4000-8000-000000000001'),
  array['alumbrado', 'vías'], 'El resumen por zona trae los temas, sin nombres');
reset role;
select pruebas.como('coord_a');
select is((select count(*)::int from public.resumen_reuniones('20000000-0000-4000-8000-00000000000a')), 1,
  'La coordinación solo recibe el resumen de sus zonas');
reset role;

-- Adjuntos: solo un archivo dentro de la carpeta de su reunión (sin «..» ni subcarpetas)
select pruebas.como('coord_a');
select lives_ok(format($$ select public.registrar_adjunto_acta(%L, %L, 'acta_escrita') $$, (select id from v where k = 'r1'),
  '20000000-0000-4000-8000-00000000000a/' || (select id from v where k = 'r1') || '/foto-1.jpg'), 'Se registra la foto del acta de su reunión');
select throws_ok(format($$ select public.registrar_adjunto_acta(%L, %L, 'acta_escrita') $$, (select id from v where k = 'r1'),
  '20000000-0000-4000-8000-00000000000a/' || (select id from v where k = 'r1') || '/../../../evidencias/x.jpg'), '22023', null,
  'Una ruta con «..» no se registra');
select throws_ok(format($$ select public.registrar_adjunto_acta(%L, %L, 'acta_escrita') $$, (select id from v where k = 'r1'),
  '20000000-0000-4000-8000-00000000000a/' || (select id from v where k = 'r1') || '/sub/foto.jpg'), '22023', null,
  'Una subcarpeta no se registra');
reset role;

select * from finish();
rollback;
