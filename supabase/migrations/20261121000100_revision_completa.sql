-- Arreglos de la revisión completa de seguridad del 20/11/2026 (base de datos).
--
-- 1. E-14 e incidencias: ya no se modifican directamente en la tabla. Antes, la dirección o un coordinador podían
--    cambiar con una petición directa las cifras de un E-14 ya revisado, revisar su propia acta, marcarla como
--    simulacro (y así borrarla) o pasarla a otra campaña, sin dejar registro. Ahora solo se cambian por las funciones
--    que hacen las comprobaciones: revisar_e14, guardar_lectura_e14, atender_incidencia y escalar_incidencias
--    (regla 7: el E-14 siempre pasa por revisión humana). Además, todo cambio de un E-14 queda en la auditoría.
-- 2. Un gerente ya no puede bajar de rol ni borrar a un administrador u otro gerente: solo un administrador.
-- 3. Planillas leídas con IA: el líder ya no edita directamente su planilla ni sus filas (antes podía volverla a
--    «leída» y aprobarla otra vez, o vincularla a otra hoja); todo va por las funciones. Las fotos de planillas y E-14
--    deben estar en la carpeta de su campaña.
-- 4. La auditoría ya no guarda la opinión política (nivel) ni el nombre y contacto de una persona suprimida: solo los
--    identificadores (regla 2 y Ley 1581). Se limpian también los registros que ya existían.
-- 5. Envíos de SMS y correo: cada lote reserva sus destinatarios por 10 minutos, para que dos envíos a la vez (dos
--    clics, dos gerentes) no le manden el mismo mensaje dos veces a una persona.
-- 6. Huella de los E-14: busca en el modo correcto (real o simulacro) y solo dentro de una campaña de la que se es
--    miembro.
-- 7. El tablero cuenta la pauta de los últimos 14 días en fecha de Bogotá, no en la del servidor (UTC).

-- 1. E-14 e incidencias ------------------------------------------------------------------------------------------
drop policy if exists revisar on public.acta_e14;
drop policy if exists atender on public.incidencia;

create trigger auditar after update or delete on public.acta_e14
  for each row execute function privado.auditar_cambio();

-- Las fotos de E-14 que se crean directamente (dirección o testigo) deben estar en la carpeta de su campaña.
drop policy if exists crear on public.acta_e14;
create policy crear on public.acta_e14 for insert to authenticated
  with check (creado_por = auth.uid() and estado = 'recibida' and revisada_por is null
    and privado.campana_de_ruta(foto_url) is not distinct from campana_id
    and (privado.es_direccion(campana_id) or privado.es_mi_mesa(campana_id, puesto_id, mesa)));

-- 2. Membresías -----------------------------------------------------------------------------------------------
-- USING se aplica a la fila de antes (al cambiar o borrar): las de administrador o gerente solo las toca un
-- administrador. WITH CHECK, a la fila nueva, igual que antes.
drop policy if exists gestionar on public.membresia;
create policy gestionar on public.membresia for all to authenticated
  using (privado.es_direccion(campana_id)
    and (rol not in ('administrador', 'gerente') or privado.rol(campana_id) = 'administrador'))
  with check (privado.es_direccion(campana_id)
    and (rol not in ('administrador', 'gerente') or privado.rol(campana_id) = 'administrador'));

-- 3. Planillas ------------------------------------------------------------------------------------------------
drop policy if exists editar on public.lote_ocr;
drop policy if exists crear on public.fila_ocr;
drop policy if exists revisar on public.fila_ocr;

drop policy if exists crear on public.lote_ocr;
create policy crear on public.lote_ocr for insert to authenticated
  with check ((privado.es_direccion(campana_id) or lider_id = privado.lider_actual(campana_id)
    or privado.coordina_lider(campana_id, lider_id)) and creado_por = auth.uid()
    and estado = 'pendiente' and privado.campana_de_ruta(archivo_url) is not distinct from campana_id);

-- 4. Auditoría sin opinión política ni datos de personas suprimidas ---------------------------------------------
create or replace function privado.auditar_cambio()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old)) - 'documento_cifrado' - 'documento_hash';
  antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'documento_cifrado' - 'documento_hash' end;
begin
  if tg_table_name = 'preferencia_politica' then
    -- La opinión política es dato sensible: la auditoría guarda que hubo un cambio, no cuál era la opinión.
    fila := fila - 'nivel';
    antes := antes - 'nivel';
  elsif tg_table_name = 'persona' then
    -- Una persona se borra cuando pide que la supriman: de ella solo queda el identificador.
    fila := jsonb_build_object('id', fila -> 'id', 'campana_id', fila -> 'campana_id');
    antes := case when antes is null then null else jsonb_build_object('id', antes -> 'id') end;
  end if;
  perform privado.auditar(
    (fila ->> 'campana_id')::uuid,
    lower(tg_op),
    tg_table_name,
    coalesce((fila ->> 'id')::uuid, (fila ->> 'persona_id')::uuid),
    jsonb_strip_nulls(jsonb_build_object('nuevo', case when tg_op <> 'DELETE' then fila end, 'anterior', antes))
  );
  return coalesce(new, old);
end;
$$;

update public.auditoria set detalle = detalle #- '{nuevo,nivel}' #- '{anterior,nivel}'
where entidad = 'preferencia_politica' and (detalle #> '{nuevo,nivel}' is not null or detalle #> '{anterior,nivel}' is not null);
update public.auditoria set detalle = jsonb_build_object('anterior', jsonb_build_object('id', entidad_id))
where entidad = 'persona' and accion = 'delete';

-- 5. Envíos sin repetir --------------------------------------------------------------------------------------
alter table public.envio_destinatario add column if not exists reservado_hasta timestamptz;

create or replace function public.lote_para_enviar(p_envio uuid, p_limite integer default 100)
returns table (destinatario_id uuid, nombre text, destino text, token_baja text)
language plpgsql volatile security definer set search_path = ''
as $$
declare v public.envio;
begin
  select * into v from public.envio where id = p_envio for update;
  if v.id is null or v.estado not in ('aprobado', 'enviando') then
    raise exception 'El envío no está aprobado.' using errcode = '22023';
  end if;
  update public.envio_destinatario d set estado = 'omitido', error = 'Ya no tiene autorización vigente o se dio de baja', procesado_en = now()
  where d.envio_id = p_envio and d.estado = 'pendiente' and not privado.contactable(d.persona_id, v.canal);
  update public.envio set estado = case when exists (select 1 from public.envio_destinatario
    where envio_id = p_envio and estado = 'pendiente') then 'enviando' else 'terminado' end where id = p_envio;
  -- Reserva el lote: otro lote que corra al mismo tiempo no toma a los mismos destinatarios. Si el envío se cae a
  -- mitad, la reserva vence a los 10 minutos y lo que no quedó registrado se vuelve a intentar.
  return query
  with lote as (
    select d.id from public.envio_destinatario d
    where d.envio_id = p_envio and d.estado = 'pendiente' and (d.reservado_hasta is null or d.reservado_hasta < now())
    order by d.n limit greatest(1, least(coalesce(p_limite, 100), 500))
    for update skip locked
  ), reservados as (
    update public.envio_destinatario d set reservado_hasta = now() + interval '10 minutes'
    from lote where d.id = lote.id
    returning d.id, d.persona_id, d.n
  )
  select r.id, p.nombre, case v.canal when 'sms' then p.telefono else p.correo end, r.n::text || '.' || privado.firma_baja_n(r.n)
  from reservados r join public.persona p on p.id = r.persona_id
  order by r.n;
end;
$$;
revoke all on function public.lote_para_enviar(uuid, integer) from public, anon, authenticated;

-- 6. Huella de los E-14 ---------------------------------------------------------------------------------------
create or replace function privado.e14_con_huella(p_campana uuid, p_hash text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select a.id from public.acta_e14 a
  where privado.es_miembro(p_campana) and a.campana_id = p_campana and a.foto_hash = p_hash
    and a.simulacro = (privado.simulacro_activo(p_campana) is not null)
  limit 1
$$;
revoke all on function privado.e14_con_huella(uuid, text) from public, anon;
grant execute on function privado.e14_con_huella(uuid, text) to authenticated;

-- 7. Tablero: pauta de los últimos 14 días en fecha de Bogotá ----------------------------------------------------
create or replace function public.tablero_zonas(p_campana uuid)
returns table (
  territorio_id uuid, nombre text, padre_id uuid, geojson jsonb, centro jsonb, meta integer, potencial bigint,
  bruto bigint, validados bigint, comprometidos bigint, lideres bigint, alcance bigint, clics bigint, gasto numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with zonas as (select z from privado.zonas_del_tablero(p_campana) z),
  ultima as (
    select h.eleccion from public.historico_resultado h
    where h.territorio_id in (select z from zonas) order by h.eleccion desc limit 1
  )
  select t.id, t.nombre, t.padre_id,
    extensions.st_asgeojson(t.geom)::jsonb,
    extensions.st_asgeojson(extensions.st_pointonsurface(t.geom))::jsonb,
    t.meta_votos,
    coalesce((select sum(h.votos) from public.historico_resultado h
              where h.territorio_id = t.id and h.eleccion = (select eleccion from ultima)), 0),
    (select count(*) from public.persona p where p.campana_id = p_campana and p.territorio_trabajo_id = t.id),
    (select count(*) from public.persona p where p.campana_id = p_campana and p.territorio_trabajo_id = t.id
       and p.estado_contacto in ('validado', 'comprometido')),
    (select count(*) from public.persona p where p.campana_id = p_campana and p.territorio_trabajo_id = t.id
       and p.estado_contacto = 'comprometido'),
    (select count(*) from public.lider l where l.campana_id = p_campana and t.id = any (l.territorio_ids)),
    coalesce((select sum(m.alcance) from public.pauta_metrica m where m.campana_id = p_campana and m.territorio_id = t.id
              and m.fecha > (now() at time zone 'America/Bogota')::date - 14), 0),
    coalesce((select sum(m.clics) from public.pauta_metrica m where m.campana_id = p_campana and m.territorio_id = t.id
              and m.fecha > (now() at time zone 'America/Bogota')::date - 14), 0),
    coalesce((select sum(m.gasto) from public.pauta_metrica m where m.campana_id = p_campana and m.territorio_id = t.id
              and m.fecha > (now() at time zone 'America/Bogota')::date - 14), 0)
  from public.territorio t
  where t.id in (select z from zonas)
  order by t.nombre
$$;
