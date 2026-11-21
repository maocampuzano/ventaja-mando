-- Arreglos de la revisión completa de seguridad (20/11/2026): E-14 e incidencias solo por sus funciones, un gerente
-- no toca a los administradores, el líder no edita su planilla directamente, la auditoría no guarda la opinión
-- política, y un envío no reparte dos veces a los mismos destinatarios.
begin;
select plan(13);

create temporary table v (k text primary key, id uuid);
grant select, insert on v to authenticated;

-- Datos: un E-14 subido por el testigo y una planilla del líder.
insert into public.acta_e14 (id, campana_id, puesto_id, mesa, foto_url, creado_por) values
  ('ac000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000001', 3,
   '20000000-0000-4000-8000-00000000000a/' || pruebas.uid('testigo_a') || '/ac1.jpg', pruebas.uid('testigo_a'));
insert into public.lote_ocr (id, campana_id, lider_id, archivo_url, creado_por) values
  ('10000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-00000000000a/' || pruebas.uid('lider_a1') || '/p1.jpg', pruebas.uid('lider_a1'));

-- 1. E-14: nadie lo cambia con una petición directa (ni la dirección ni la coordinación) ---------------------------
select pruebas.como('gerente_a', 'aal2');
update public.acta_e14 set estado = 'revisada', revisada_por = auth.uid(), simulacro = true
  where id = 'ac000000-0000-4000-8000-000000000001';
reset role;
select is((select estado || '/' || simulacro::text from public.acta_e14 where id = 'ac000000-0000-4000-8000-000000000001'),
  'recibida/false', 'La dirección no cambia un E-14 directamente: solo por revisar_e14');
select pruebas.como('coord_a');
update public.acta_e14 set extraccion_json = '{"revision": {"votos": []}}', campana_id = '20000000-0000-4000-8000-00000000000b'
  where id = 'ac000000-0000-4000-8000-000000000001';
reset role;
select is((select campana_id from public.acta_e14 where id = 'ac000000-0000-4000-8000-000000000001'),
  '20000000-0000-4000-8000-00000000000a'::uuid, 'La coordinación tampoco (ni lo pasa a otra campaña)');
select pruebas.como('testigo_a');
select throws_like($$ insert into public.acta_e14 (campana_id, puesto_id, mesa, foto_url, creado_por) values
  ('20000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-000000000001', 3,
   '20000000-0000-4000-8000-00000000000b/x/otra.jpg', auth.uid()) $$, '%row-level security%',
  'Un E-14 no se crea con la foto de otra campaña');
reset role;
select pruebas.como('gerente_a', 'aal2');
select public.revisar_e14('ac000000-0000-4000-8000-000000000001',
  '{"votos": [{"opcion": "Candidata ficticia", "votos": 10}], "blancos": 0, "nulos": 0, "noMarcados": 0, "totalVotos": 10, "sufragantes": 10}', 0);
reset role;
select ok(exists (select 1 from public.auditoria where entidad = 'acta_e14' and entidad_id = 'ac000000-0000-4000-8000-000000000001'),
  'La revisión del E-14 queda en la auditoría');

-- 2. Un gerente no baja de rol ni borra a un administrador ----------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
update public.membresia set rol = 'lider' where usuario_id = pruebas.uid('admin_a') and campana_id = '20000000-0000-4000-8000-00000000000a';
delete from public.membresia where usuario_id = pruebas.uid('admin_a') and campana_id = '20000000-0000-4000-8000-00000000000a';
reset role;
select is((select rol from public.membresia where usuario_id = pruebas.uid('admin_a') and campana_id = '20000000-0000-4000-8000-00000000000a'),
  'administrador', 'Un gerente no le quita el rol ni borra a un administrador');
select pruebas.como('admin_a', 'aal2');
update public.membresia set activa = false where usuario_id = pruebas.uid('gerente_a') and campana_id = '20000000-0000-4000-8000-00000000000a';
reset role;
select is((select activa from public.membresia where usuario_id = pruebas.uid('gerente_a') and campana_id = '20000000-0000-4000-8000-00000000000a'),
  false, 'Un administrador sí puede desactivar a un gerente');
update public.membresia set activa = true where usuario_id = pruebas.uid('gerente_a') and campana_id = '20000000-0000-4000-8000-00000000000a';

-- 3. El líder no edita su planilla ni sus filas directamente --------------------------------------------------
select pruebas.como('lider_a1');
update public.lote_ocr set estado = 'leido', archivo_url = '20000000-0000-4000-8000-00000000000b/x/ajena.jpg'
  where id = '10000000-0000-4000-8000-0000000000c1';
reset role;
select is((select estado from public.lote_ocr where id = '10000000-0000-4000-8000-0000000000c1'), 'pendiente',
  'El líder no cambia el estado ni la foto de su planilla directamente');
select pruebas.como('lider_a1');
select throws_like($$ insert into public.fila_ocr (lote_id, campana_id, datos, confianza, revisada_por)
  values ('10000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-00000000000a', '{}', 1, auth.uid()) $$,
  '%row-level security%', 'El líder no crea filas de planilla ya «revisadas»');
select throws_like($$ insert into public.lote_ocr (campana_id, lider_id, archivo_url, creado_por) values
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000b/x/ajena.jpg', auth.uid()) $$,
  '%row-level security%', 'Una planilla no se crea con la foto de otra campaña');
reset role;

-- 4. La auditoría no guarda la opinión política ---------------------------------------------------------------
update public.campana set permite_preferencia_politica = true where id = '20000000-0000-4000-8000-00000000000a';
insert into public.autorizacion (persona_id, campana_id, finalidades, sensible, canal, evidencia_url, registrado_por)
values ('80000000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-00000000000a', array['preferencia_politica'], true,
        'presencial', 'prueba://evidencia/sensible', pruebas.uid('gerente_a'));
insert into public.preferencia_politica (persona_id, campana_id, nivel, autorizacion_id)
  select persona_id, campana_id, 'a_favor', id from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000102' and sensible;
select public.revocar_autorizacion((select id from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000102' and sensible));
select is((select count(*)::int from public.auditoria where entidad = 'preferencia_politica' and detalle::text like '%a_favor%'), 0,
  'Ni al guardar ni al revocar queda la opinión política en la auditoría');
select ok(exists (select 1 from public.auditoria where entidad = 'preferencia_politica'), 'Pero sí queda que hubo un cambio');

-- 5. Dos lotes de un mismo envío no toman a los mismos destinatarios ----------------------------------------
select pruebas.como('gerente_a', 'aal2');
insert into v values ('envio', public.crear_envio('20000000-0000-4000-8000-00000000000a', 'sms', 'Doble', null, 'Hola {nombre}.',
  '{"lider_ids": ["70000000-0000-4000-8000-000000000001"]}'));
select public.aprobar_envio((select id from v where k = 'envio'));
reset role;
create temporary table lote1 as select destinatario_id from public.lote_para_enviar((select id from v where k = 'envio'), 500);
create temporary table lote2 as select destinatario_id from public.lote_para_enviar((select id from v where k = 'envio'), 500);
select ok((select count(*) from lote1) > 0, 'El primer lote sale con destinatarios');
select is((select count(*)::int from lote2 where destinatario_id in (select destinatario_id from lote1)), 0,
  'Un segundo lote al mismo tiempo no repite a nadie del primero');

select * from finish();
rollback;
