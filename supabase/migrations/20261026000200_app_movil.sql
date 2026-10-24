-- App del líder y del testigo (fase 3): fotos en Storage y tareas marcadas desde el celular.

-- Las fotos (planillas, E-14, soportes de autorización) van en un bucket privado, en la carpeta
-- <campaña>/<usuario>/<identificador de la operación>.jpg. Cada quien sube y reemplaza solo en su carpeta;
-- la dirección de la campaña las ve todas. La revisión por coordinadores llega con la lectura de planillas (fase 4).

create or replace function privado.campana_de_ruta(p_ruta text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_ruta, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- ¿La ruta está en la carpeta de quien llama, dentro de una campaña de la que es miembro?
create or replace function privado.ruta_propia(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(split_part(p_ruta, '/', 2) = auth.uid()::text
    and privado.es_miembro(privado.campana_de_ruta(p_ruta))
    and p_ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$', false)
$$;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sin Storage en esta base: se omite el bucket.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('evidencias', 'evidencias', false, 10485760, array['image/jpeg', 'image/png'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists evidencias_ver on storage.objects;
  drop policy if exists evidencias_subir on storage.objects;
  drop policy if exists evidencias_reemplazar on storage.objects;
  create policy evidencias_ver on storage.objects for select to authenticated
    using (bucket_id = 'evidencias' and (privado.ruta_propia(name) or privado.es_direccion(privado.campana_de_ruta(name))));
  create policy evidencias_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'evidencias' and privado.ruta_propia(name));
  create policy evidencias_reemplazar on storage.objects for update to authenticated
    using (bucket_id = 'evidencias' and privado.ruta_propia(name))
    with check (bucket_id = 'evidencias' and privado.ruta_propia(name));
end $$;

-- La foto que llega con una planilla o un E-14 debe estar en la carpeta de quien la envía.
create or replace function public.registrar_planilla_movil(p_id uuid, p_campana uuid, p_archivo text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lider uuid := privado.lider_actual(p_campana);
begin
  if p_id is null or length(trim(coalesce(p_archivo, ''))) = 0 then
    raise exception 'Falta el identificador o la foto de la planilla.' using errcode = '22023';
  end if;
  if exists (select 1 from public.lote_ocr where id = p_id) then
    return 'ya_estaba';
  end if;
  if exists (select 1 from privado.identificador_usado(p_id)) then
    raise exception 'El identificador de la operación ya está en uso.' using errcode = '23505';
  end if;
  if v_lider is null then
    raise exception 'Solo un líder sube planillas desde la app.' using errcode = '42501';
  end if;
  if privado.campana_de_ruta(p_archivo) is distinct from p_campana or not privado.ruta_propia(p_archivo) then
    raise exception 'La foto no está en su carpeta de esta campaña.' using errcode = '42501';
  end if;
  insert into public.lote_ocr (id, campana_id, lider_id, archivo_url, creado_por)
  values (p_id, p_campana, v_lider, p_archivo, auth.uid());
  return 'creada';
end;
$$;

create or replace function public.registrar_e14_movil(p_id uuid, p_campana uuid, p_puesto uuid, p_mesa integer, p_foto text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_id is null or p_mesa is null or length(trim(coalesce(p_foto, ''))) = 0 then
    raise exception 'Falta el identificador, la mesa o la foto del E-14.' using errcode = '22023';
  end if;
  if exists (select 1 from public.acta_e14 where id = p_id) then
    return 'ya_estaba';
  end if;
  if exists (select 1 from privado.identificador_usado(p_id)) then
    raise exception 'El identificador de la operación ya está en uso.' using errcode = '23505';
  end if;
  if not coalesce(privado.es_mi_mesa(p_campana, p_puesto, p_mesa), false) then
    raise exception 'Solo el testigo de esa mesa sube su E-14 desde la app.' using errcode = '42501';
  end if;
  if privado.campana_de_ruta(p_foto) is distinct from p_campana or not privado.ruta_propia(p_foto) then
    raise exception 'La foto no está en su carpeta de esta campaña.' using errcode = '42501';
  end if;
  insert into public.acta_e14 (id, campana_id, puesto_id, mesa, foto_url, creado_por)
  values (p_id, p_campana, p_puesto, p_mesa, p_foto, auth.uid());
  return 'creada';
end;
$$;

-- El líder marca sus tareas. Solo cambia el estado, y solo de las tareas asignadas a él.
-- Es idempotente por naturaleza: marcar dos veces «hecha» deja la tarea igual.
create or replace function public.actualizar_tarea_movil(p_tarea uuid, p_estado text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actual text;
begin
  if p_estado is null or p_estado not in ('en_curso', 'hecha') then
    raise exception 'Estado de tarea no válido.' using errcode = '22023';
  end if;
  select estado into v_actual from public.tarea where id = p_tarea and asignado_a = auth.uid() for update;
  if not found then
    raise exception 'Esa tarea no está asignada a usted.' using errcode = '42501';
  end if;
  if v_actual = 'cancelada' then
    raise exception 'La tarea fue cancelada por su coordinador.' using errcode = '22023';
  end if;
  if v_actual = p_estado or v_actual = 'hecha' then
    return 'ya_estaba';
  end if;
  update public.tarea set estado = p_estado where id = p_tarea;
  return 'creada';
end;
$$;

revoke all on function public.actualizar_tarea_movil(uuid, text) from public, anon;
grant execute on function public.actualizar_tarea_movil(uuid, text) to authenticated;
revoke all on function privado.ruta_propia(text) from public, anon;
grant execute on function privado.ruta_propia(text), privado.campana_de_ruta(text) to authenticated;
