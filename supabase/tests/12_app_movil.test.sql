-- App del celular: fotos en la carpeta de cada quien y tareas marcadas por el líder (fase 3).
begin;
select plan(14);

-- Fotos
select pruebas.como('lider_a1');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('evidencias', '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000005/p1.jpg') $$,
  'El líder sube una foto en su carpeta');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('evidencias', '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000006/p1.jpg') $$,
  '42501', null, 'No sube en la carpeta de otro usuario');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('evidencias', '20000000-0000-4000-8000-00000000000b/40000000-0000-4000-8000-000000000005/p1.jpg') $$,
  '42501', null, 'No sube en una campaña de la que no es miembro');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('evidencias', 'cualquier/cosa.jpg') $$,
  '42501', null, 'Una ruta mal formada se rechaza');
select throws_ok($$ select public.registrar_planilla_movil('b0000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-00000000000a',
  '20000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000006/ajena.jpg') $$,
  '42501', 'La foto no está en su carpeta de esta campaña.', 'La planilla no puede apuntar a la foto de otro');
reset role;

select pruebas.como('lider_a2');
select is((select count(*) from storage.objects where bucket_id = 'evidencias')::int, 0, 'Otro líder no ve las fotos ajenas');
reset role;
select pruebas.como('gerente_a', 'aal2');
select is((select count(*) from storage.objects where bucket_id = 'evidencias')::int, 1, 'La dirección ve las fotos de su campaña');
reset role;
select pruebas.como('gerente_b', 'aal2');
select is((select count(*) from storage.objects where bucket_id = 'evidencias')::int, 0, 'Otra campaña no las ve');
reset role;
select is((select public from storage.buckets where id = 'evidencias'), false, 'El bucket es privado');

-- Tareas
select pruebas.como('lider_a1');
select is((select count(*) from public.tarea where asignado_a = auth.uid())::int, 3, 'La líder ve sus tres tareas de hoy');
select is(public.actualizar_tarea_movil('91000000-0000-4000-8000-000000000001', 'hecha'), 'creada', 'Marca una tarea como hecha');
select is(public.actualizar_tarea_movil('91000000-0000-4000-8000-000000000001', 'hecha'), 'ya_estaba', 'El reintento no cambia nada');
select is(public.actualizar_tarea_movil('91000000-0000-4000-8000-000000000001', 'en_curso'), 'ya_estaba', 'Una tarea hecha no se reabre desde el celular');
reset role;
select pruebas.como('lider_a2');
select throws_ok($$ select public.actualizar_tarea_movil('91000000-0000-4000-8000-000000000002', 'hecha') $$,
  '42501', 'Esa tarea no está asignada a usted.', 'Nadie marca tareas ajenas');
reset role;

select * from finish();
rollback;
