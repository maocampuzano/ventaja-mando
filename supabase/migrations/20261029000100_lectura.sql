-- Lectura de planillas con revisión humana (fase 4). La función de Supabase «lectura» lee la foto y deja las filas en
-- fila_ocr (estado del lote: «leido»). Una persona revisa TODAS las filas y aprueba: solo entonces se crean las
-- personas (regla 7), cada una con su autorización (regla 3). La evidencia de la autorización es la planilla impresa:
-- por eso la foto debe estar vinculada a su lote impreso (el QR de la hoja) antes de aprobar.

alter table public.lote_ocr
  add column lote_planilla_id uuid references public.lote_planilla (id),
  add column hoja integer check (hoja > 0),
  add column lectura_error text;

-- Une la foto con su hoja impresa, a partir del QR que se lee en la pantalla de revisión.
create or replace function public.vincular_hoja_planilla(p_lote_ocr uuid, p_lote_planilla uuid, p_hoja integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lote public.lote_ocr;
  v_impreso public.lote_planilla;
begin
  select * into v_lote from public.lote_ocr where id = p_lote_ocr;
  if v_lote.id is null or not (privado.es_direccion(v_lote.campana_id) or v_lote.lider_id = privado.lider_actual(v_lote.campana_id)
      or privado.coordina_lider(v_lote.campana_id, v_lote.lider_id)) then
    raise exception 'La planilla no existe o no la puede revisar.' using errcode = '42501';
  end if;
  select * into v_impreso from public.lote_planilla where id = p_lote_planilla;
  if v_impreso.id is null or v_impreso.campana_id <> v_lote.campana_id then
    raise exception 'El código QR no es de una planilla de esta campaña.' using errcode = '22023';
  end if;
  if v_impreso.lider_id is distinct from v_lote.lider_id then
    raise exception 'El código QR es de una planilla impresa para otro líder.' using errcode = '22023';
  end if;
  if p_hoja is null or p_hoja < 1 or p_hoja > v_impreso.hojas then
    raise exception 'El número de hoja no corresponde a ese lote.' using errcode = '22023';
  end if;
  update public.lote_ocr set lote_planilla_id = p_lote_planilla, hoja = p_hoja where id = p_lote_ocr;
end;
$$;

-- Aprueba una hoja revisada. p_filas: [{fila_id, nombre, documento?, telefono?, firma, descartar}], una por cada fila
-- leída del lote (todas: revisar es obligatorio). Las filas sin firma o descartadas quedan revisadas pero no crean
-- personas. Mismas validaciones que importar_personas; la cédula repetida se busca solo en lo que quien revisa ve.
create or replace function public.aprobar_planilla(p_lote uuid, p_filas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_lote public.lote_ocr;
  v_impreso public.lote_planilla;
  v_territorio uuid;
  f jsonb;
  v_fila uuid;
  v_doc text;
  v_hash text;
  v_id uuid;
  v_creadas int := 0;
  v_existian int := 0;
  v_sin_firma int := 0;
  v_descartadas int := 0;
  v_rechazos jsonb := '[]';
begin
  select * into v_lote from public.lote_ocr where id = p_lote for update;
  if v_lote.id is null or not (privado.es_direccion(v_lote.campana_id) or v_lote.lider_id = privado.lider_actual(v_lote.campana_id)
      or privado.coordina_lider(v_lote.campana_id, v_lote.lider_id)) then
    raise exception 'La planilla no existe o no la puede revisar.' using errcode = '42501';
  end if;
  if v_lote.estado not in ('leido', 'en_revision') then
    raise exception 'Esta planilla no está lista para aprobar (estado: %).', v_lote.estado using errcode = '22023';
  end if;
  if v_lote.lote_planilla_id is null then
    raise exception 'Vincule la foto con su planilla impresa (código QR) antes de aprobar.' using errcode = '22023';
  end if;
  select * into v_impreso from public.lote_planilla where id = v_lote.lote_planilla_id;
  if jsonb_typeof(p_filas) is distinct from 'array'
     or (select count(*) from public.fila_ocr where lote_id = p_lote) <> jsonb_array_length(p_filas)
     or exists (select 1 from public.fila_ocr fo where fo.lote_id = p_lote
                and not exists (select 1 from jsonb_array_elements(p_filas) e where (e.value ->> 'fila_id')::uuid = fo.id)) then
    raise exception 'Revise todas las filas leídas de la hoja antes de aprobar.' using errcode = '22023';
  end if;
  select l.territorio_ids[1] into v_territorio from public.lider l where l.id = v_lote.lider_id;

  for f in select value from jsonb_array_elements(p_filas) loop
    v_fila := (f ->> 'fila_id')::uuid;
    update public.fila_ocr
      -- La cédula no se queda en la fila: va cifrada a la persona (y en la revisión solo queda que se revisó).
      set datos = (datos - 'cedula_cifrada') || jsonb_build_object('revision', f - 'fila_id' - 'documento'),
          revisada_por = auth.uid(), revisada_en = now()
      where id = v_fila;

    if coalesce((f ->> 'descartar')::boolean, false) then v_descartadas := v_descartadas + 1; continue; end if;
    if not coalesce((f ->> 'firma')::boolean, false) then v_sin_firma := v_sin_firma + 1; continue; end if;
    begin
      v_doc := privado.normaliza_documento(f ->> 'documento');
      if length(trim(coalesce(f ->> 'nombre', ''))) < 3 then
        v_rechazos := v_rechazos || jsonb_build_object('fila_id', v_fila, 'motivo', 'Falta el nombre.');
        continue;
      end if;
      if v_doc is not null and length(v_doc) not between 5 and 11 then
        v_rechazos := v_rechazos || jsonb_build_object('fila_id', v_fila, 'motivo', 'La cédula no es válida.');
        continue;
      end if;
      v_hash := privado.hash_documento(v_doc);
      if v_hash is not null and exists (
        select 1 from public.persona p
        where p.campana_id = v_lote.campana_id and p.documento_hash = v_hash
          and privado.puede_ver_persona(p.campana_id, p.territorio_trabajo_id, p.lider_id)
      ) then
        v_existian := v_existian + 1;
        v_rechazos := v_rechazos || jsonb_build_object('fila_id', v_fila, 'motivo', 'Ya está en la base (misma cédula).');
        continue;
      end if;

      insert into public.persona (
        campana_id, nombre, origen, fila_ocr_id, documento_cifrado, documento_hash, telefono, territorio_trabajo_id, lider_id, creado_por
      ) values (
        v_lote.campana_id, trim(f ->> 'nombre'), 'ocr', v_fila, privado.cifrar_documento(v_doc), v_hash,
        nullif(trim(f ->> 'telefono'), ''), v_territorio, v_lote.lider_id, auth.uid()
      ) returning id into v_id;

      insert into public.autorizacion (persona_id, campana_id, finalidades, canal, evidencia_url, fecha, registrado_por)
      values (v_id, v_lote.campana_id, v_impreso.finalidades, 'ocr',
              v_lote.archivo_url || ' (planilla impresa, lote ' || v_impreso.numero || ', hoja ' || v_lote.hoja || ')',
              v_lote.creado_en, auth.uid());
      v_creadas := v_creadas + 1;
    exception when others then
      v_rechazos := v_rechazos || jsonb_build_object('fila_id', v_fila, 'motivo', 'No se pudo guardar: ' || sqlerrm);
    end;
  end loop;

  update public.lote_ocr set estado = 'aprobado' where id = p_lote;
  perform privado.auditar(v_lote.campana_id, 'aprobar_planilla', 'lote_ocr', p_lote, jsonb_build_object(
    'filas', jsonb_array_length(p_filas), 'creadas', v_creadas, 'ya_existian', v_existian,
    'sin_firma', v_sin_firma, 'descartadas', v_descartadas));
  return jsonb_build_object('creadas', v_creadas, 'ya_existian', v_existian, 'sin_firma', v_sin_firma,
    'descartadas', v_descartadas, 'rechazos', v_rechazos);
end;
$$;

-- Guarda lo que leyó la IA (lo llama la función «lectura» con la clave de servicio). La cédula se guarda cifrada,
-- nunca en claro (como en persona); el resto, tal como se leyó. El lote pasa a «leido».
create or replace function public.guardar_lectura_planilla(p_lote uuid, p_filas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lote public.lote_ocr;
  f jsonb;
  n integer := 0;
begin
  select * into v_lote from public.lote_ocr where id = p_lote for update;
  if v_lote.id is null then raise exception 'La planilla no existe.' using errcode = 'P0002'; end if;
  if v_lote.estado <> 'pendiente' then raise exception 'La planilla ya se leyó.' using errcode = '22023'; end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) > 50 then
    raise exception 'La lectura no es válida.' using errcode = '22023';
  end if;
  for f in select value from jsonb_array_elements(p_filas) loop
    insert into public.fila_ocr (lote_id, campana_id, datos, confianza)
    values (p_lote, v_lote.campana_id,
      (f - 'cedula') || jsonb_build_object('cedula_cifrada', encode(privado.cifrar_documento(f ->> 'cedula'), 'base64')),
      least(1, greatest(0, coalesce((select min(value::numeric) from jsonb_each_text(f -> 'confianza')), 0))));
    n := n + 1;
  end loop;
  update public.lote_ocr set estado = 'leido', lectura_error = null where id = p_lote;
  return n;
end;
$$;

-- Filas leídas de una hoja para revisarlas, con la cédula descifrada para compararla con la foto. Solo quien puede
-- revisar la hoja; cada consulta queda en la auditoría.
create or replace function public.filas_planilla(p_lote uuid)
returns table (fila_id uuid, renglon integer, nombre text, cedula text, celular text, barrio text, firma boolean, confianza jsonb, revisada boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lote public.lote_ocr;
begin
  select * into v_lote from public.lote_ocr where id = p_lote;
  if v_lote.id is null or not (privado.es_direccion(v_lote.campana_id) or v_lote.lider_id = privado.lider_actual(v_lote.campana_id)
      or privado.coordina_lider(v_lote.campana_id, v_lote.lider_id)) then
    raise exception 'La planilla no existe o no la puede revisar.' using errcode = '42501';
  end if;
  perform privado.auditar(v_lote.campana_id, 'ver_filas_planilla', 'lote_ocr', p_lote);
  return query
    select fo.id, (fo.datos ->> 'renglon')::integer, fo.datos ->> 'nombre',
      case when fo.datos ? 'cedula_cifrada' and fo.datos ->> 'cedula_cifrada' is not null
        then extensions.pgp_sym_decrypt(decode(fo.datos ->> 'cedula_cifrada', 'base64'), privado.secreto('clave_documento')) end,
      fo.datos ->> 'celular', fo.datos ->> 'barrio', coalesce((fo.datos ->> 'firma')::boolean, false), fo.datos -> 'confianza',
      fo.revisada_por is not null
    from public.fila_ocr fo where fo.lote_id = p_lote
    order by (fo.datos ->> 'renglon')::integer nulls last;
end;
$$;

-- Planillas por revisar que ve quien consulta (la RLS de lote_ocr recorta), con el líder y la hoja impresa.
create or replace function public.planillas_por_revisar(p_campana uuid)
returns table (id uuid, lider text, estado text, archivo text, lote_numero integer, hoja integer, filas bigint, creado_en timestamptz, lectura_error text)
language sql
stable
security invoker
set search_path = ''
as $$
  select lo.id, l.nombre, lo.estado, lo.archivo_url, lp.numero, lo.hoja,
    (select count(*) from public.fila_ocr fo where fo.lote_id = lo.id), lo.creado_en, lo.lectura_error
  from public.lote_ocr lo
  left join public.lider l on l.id = lo.lider_id
  left join public.lote_planilla lp on lp.id = lo.lote_planilla_id
  where lo.campana_id = p_campana and lo.estado in ('pendiente', 'leido', 'en_revision')
  order by lo.creado_en
  limit 200;
$$;

revoke all on function public.vincular_hoja_planilla(uuid, uuid, integer), public.aprobar_planilla(uuid, jsonb),
  public.planillas_por_revisar(uuid), public.filas_planilla(uuid) from public, anon;
grant execute on function public.vincular_hoja_planilla(uuid, uuid, integer), public.aprobar_planilla(uuid, jsonb),
  public.planillas_por_revisar(uuid), public.filas_planilla(uuid) to authenticated;
revoke all on function public.guardar_lectura_planilla(uuid, jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.guardar_lectura_planilla(uuid, jsonb) to service_role;
  end if;
end $$;
