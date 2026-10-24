-- Formularios: la base bloquea preguntas sensibles y lleva la versión (fase 2).
begin;
select plan(7);

select pruebas.como('gerente_a', 'aal2');
insert into public.formulario (id, campana_id, nombre, esquema_json) values ('90000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-00000000000a', 'Visita casa a casa',
  '{"campos": [{"id": "c1", "tipo": "texto", "etiqueta": "Barrio donde vive", "obligatorio": true}]}');
select is((select version from public.formulario where id = '90000000-0000-4000-8000-000000000001'), 1, 'Un formulario nuevo empieza en la versión 1');
update public.formulario set esquema_json = '{"campos": [{"id": "c1", "tipo": "texto", "etiqueta": "Barrio", "obligatorio": true}]}'
  where id = '90000000-0000-4000-8000-000000000001';
select is((select version from public.formulario where id = '90000000-0000-4000-8000-000000000001'), 2, 'Cambiar los campos sube la versión');
select throws_like($$ insert into public.formulario (campana_id, nombre, esquema_json) values ('20000000-0000-4000-8000-00000000000a', 'X',
  '{"campos": [{"id": "c1", "tipo": "opcion", "etiqueta": "¿Por quién VOTARÁ?", "opciones": ["A", "B"]}]}') $$,
  '%regla 2%', 'La base rechaza preguntar por el voto, aunque el panel no lo hubiera atajado');
select throws_like($$ insert into public.formulario (campana_id, nombre, esquema_json) values ('20000000-0000-4000-8000-00000000000a', 'X',
  '{"campos": [{"id": "c1", "tipo": "texto", "etiqueta": "Tema", "opciones": [], "ayuda": "Escriba su cédula"}]}') $$,
  '%cédula%', 'La base rechaza pedir la cédula, también en la ayuda');
select throws_like($$ insert into public.formulario (campana_id, nombre, esquema_json) values ('20000000-0000-4000-8000-00000000000a', 'X', '{"campos": []}') $$,
  '%entre 1 y 40%', 'Un formulario sin campos no se guarda');
select lives_ok($$ insert into public.formulario (campana_id, nombre, esquema_json) values ('20000000-0000-4000-8000-00000000000a', 'Fe',
  '{"campos": [{"id": "c1", "tipo": "si_no", "etiqueta": "¿Es devoto del santo patrono?"}]}') $$, '«Devoto» no se confunde con «voto»');
reset role;

select pruebas.como('coord_a');
select throws_like($$ insert into public.formulario (campana_id, nombre, esquema_json) values ('20000000-0000-4000-8000-00000000000a', 'Mío',
  '{"campos": [{"id": "c1", "tipo": "texto", "etiqueta": "Barrio"}]}') $$, '%row-level security%', 'Solo la dirección crea formularios');
reset role;

select * from finish();
rollback;
