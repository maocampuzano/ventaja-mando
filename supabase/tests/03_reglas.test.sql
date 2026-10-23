-- Reglas que no se negocian que la base hace cumplir (CLAUDE.md, reglas 1 a 4 y 7) y cédula cifrada.
begin;
select plan(24);

-- Regla 3: ninguna persona sin autorización ------------------------------------------------------
set constraints public.exigir_autorizacion immediate;
select throws_like(
  $$ insert into public.persona (campana_id, nombre, origen) values ('20000000-0000-4000-8000-00000000000a', 'Sin autorización', 'formulario') $$,
  '%sin autorización registrada%', 'Regla 3: no se puede guardar a una persona sin autorización');
set constraints public.exigir_autorizacion deferred;

select pruebas.como('lider_a1');
select lives_ok(
  $$ select public.registrar_persona('20000000-0000-4000-8000-00000000000a', 'Persona Nueva Prueba', 'formulario',
       array['contacto_campana'], 'formulario', 'prueba://evidencia/1', '000-123.4567', '+57 300 000 7777',
       '50000000-0000-4000-8000-000000000001') $$,
  'El líder registra una persona con su autorización en un solo paso');
select is((select lider_id from public.persona where nombre = 'Persona Nueva Prueba'),
  '70000000-0000-4000-8000-000000000001'::uuid, 'La persona queda a cargo del líder que la registró');
select is((select count(*) from public.autorizacion a join public.persona p on p.id = a.persona_id
           where p.nombre = 'Persona Nueva Prueba')::int, 1, 'Su autorización quedó registrada');
select throws_like($$ select public.ver_documento((select id from public.persona where nombre = 'Persona Nueva Prueba')) $$,
  '%No tiene permiso%', 'Un líder no puede ver la cédula completa');
reset role;

-- Cédula cifrada -----------------------------------------------------------------------------------
select ok(position('0001234567' in encode((select documento_cifrado from public.persona where nombre = 'Persona Nueva Prueba'), 'escape')) = 0,
  'La cédula no aparece en claro en la base');
select is((select documento_hash from public.persona where nombre = 'Persona Nueva Prueba'), privado.hash_documento('0001234567'),
  'El hash ignora puntos, guiones y espacios del documento');

select pruebas.como('gerente_a', 'aal2');
select is(public.ver_documento((select id from public.persona where nombre = 'Persona Nueva Prueba')), '0001234567',
  'El gerente con 2FA puede ver la cédula');
select is((select count(*) from public.auditoria where accion = 'ver_documento')::int, 1,
  'Ver una cédula queda en la auditoría');
reset role;

-- Autorizaciones: inmutables y revocables --------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select throws_like(
  $$ update public.autorizacion set finalidades = array['otra'] where persona_id = '80000000-0000-4000-8000-000000000101' $$,
  '%no se modifica%', 'Una autorización no se reescribe');
select ok(public.autorizada_para('80000000-0000-4000-8000-000000000101', 'contacto_campana'), 'Antes de revocar, está autorizada');
select lives_ok($$ select public.revocar_autorizacion((select id from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000101')) $$,
  'La autorización se puede revocar');
select ok(not public.autorizada_para('80000000-0000-4000-8000-000000000101', 'contacto_campana'),
  'Regla 3: revocada, la persona deja de estar autorizada para contacto');
reset role;

-- Regla 2: preferencia política --------------------------------------------------------------------
select pruebas.como('gerente_a', 'aal2');
select throws_like(
  $$ insert into public.preferencia_politica (persona_id, campana_id, nivel, autorizacion_id)
     select persona_id, campana_id, 'a_favor', id from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000102' $$,
  '%no tiene activada%', 'Regla 2: apagada por defecto, no se puede guardar la preferencia política');
update public.campana set permite_preferencia_politica = true where id = '20000000-0000-4000-8000-00000000000a';
select throws_like(
  $$ insert into public.preferencia_politica (persona_id, campana_id, nivel, autorizacion_id)
     select persona_id, campana_id, 'a_favor', id from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000102' $$,
  '%autorización sensible%', 'Regla 2: exige una autorización marcada como sensible');
insert into public.autorizacion (persona_id, campana_id, finalidades, sensible, canal, evidencia_url, registrado_por)
values ('80000000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-00000000000a', array['preferencia_politica'], true,
        'presencial', 'prueba://evidencia/sensible', pruebas.uid('gerente_a'));
select lives_ok(
  $$ insert into public.preferencia_politica (persona_id, campana_id, nivel, autorizacion_id)
     select persona_id, campana_id, 'a_favor', id from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000102' and sensible $$,
  'Con la campaña activada y autorización sensible, sí se guarda');
select public.revocar_autorizacion((select id from public.autorizacion where persona_id = '80000000-0000-4000-8000-000000000102' and sensible));
select is((select count(*) from public.preferencia_politica)::int, 0, 'Al revocar la autorización sensible, la preferencia se borra');
reset role;

select pruebas.como('coord_a');
select is((select count(*) from public.preferencia_politica)::int, 0, 'Solo la dirección accede a la preferencia política');
reset role;

-- Regla 7: OCR y E-14 con revisión humana ---------------------------------------------------------
insert into public.lote_ocr (id, campana_id, lider_id, archivo_url)
values ('a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000001', 'prueba://planilla.jpg');
insert into public.fila_ocr (id, lote_id, campana_id, datos, confianza)
values ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '{"nombre": "Fila OCR"}', 0.61);
select throws_like(
  $$ select public.registrar_persona('20000000-0000-4000-8000-00000000000a', 'Fila OCR', 'ocr', array['contacto_campana'], 'ocr',
       'prueba://planilla.jpg', p_fila_ocr => 'a1000000-0000-4000-8000-000000000001') $$,
  '%revisión humana%', 'Regla 7: una fila de OCR sin revisar no entra a la base');
update public.fila_ocr set revisada_por = pruebas.uid('lider_a1'), revisada_en = now() where id = 'a1000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ select public.registrar_persona('20000000-0000-4000-8000-00000000000a', 'Fila OCR', 'ocr', array['contacto_campana'], 'ocr',
       'prueba://planilla.jpg', p_fila_ocr => 'a1000000-0000-4000-8000-000000000001') $$,
  'Revisada por una persona, sí entra');
select throws_like(
  $$ update public.acta_e14 set estado = 'consolidada' where mesa = 3 $$,
  '%acta_e14_check%', 'Regla 7: un E-14 no se consolida sin revisión humana');

-- Regla 1: WhatsApp solo de persona a persona ---------------------------------------------------------
select pruebas.como('lider_a1');
select lives_ok(
  $$ insert into public.mensaje (campana_id, canal, persona_id, creado_por)
     values ('20000000-0000-4000-8000-00000000000a', 'wa_manual', '80000000-0000-4000-8000-000000000103', pruebas.uid('lider_a1')) $$,
  'El líder registra que abrió el WhatsApp de una de sus personas');
select throws_like(
  $$ insert into public.mensaje (campana_id, canal, persona_id, plantilla, creado_por)
     values ('20000000-0000-4000-8000-00000000000a', 'wa_manual', '80000000-0000-4000-8000-000000000103', 'Hola', pruebas.uid('lider_a1')) $$,
  '%mensaje_check%', 'Regla 1: del WhatsApp manual no se guarda el contenido');
select throws_like(
  $$ insert into public.mensaje (campana_id, canal, segmento, plantilla, creado_por)
     values ('20000000-0000-4000-8000-00000000000a', 'sms', '{}', 'Hola', pruebas.uid('lider_a1')) $$,
  '%row-level security%', 'Un líder no puede hacer envíos masivos');
reset role;

select * from finish();
rollback;
