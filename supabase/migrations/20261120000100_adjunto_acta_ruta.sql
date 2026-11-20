-- Endurece registrar_adjunto_acta: la ruta debe ser exactamente «<campaña>/<reunión>/<archivo>.<jpg|jpeg|png|webp>»,
-- sin subcarpetas, «..» ni «%». Antes solo se revisaban las dos primeras partes, así que se podía registrar una ruta
-- que, al descargarla, se saliera hacia otro bucket u otra campaña (hallazgo de la revisión de seguridad del 20/11/2026).
create or replace function public.registrar_adjunto_acta(p_reunion uuid, p_ruta text, p_tipo text)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_r public.reunion; v_id uuid;
begin
  select * into v_r from public.reunion where id = p_reunion;
  if v_r.id is null or not privado.ve_reunion(v_r.campana_id, v_r.territorio_id) then
    raise exception 'La reunión no existe o no la puede editar.' using errcode = '42501';
  end if;
  if p_ruta is null
     or p_ruta !~ ('^' || v_r.campana_id::text || '/' || p_reunion::text || '/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.(jpe?g|png|webp)$')
     or p_ruta ~ '\.\.' then
    raise exception 'El archivo no está en la carpeta de esta reunión.' using errcode = '22023';
  end if;
  insert into public.acta_adjunto (reunion_id, campana_id, ruta, tipo, creado_por)
  values (p_reunion, v_r.campana_id, p_ruta, p_tipo, auth.uid())
  on conflict (ruta) do update set tipo = excluded.tipo
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.registrar_adjunto_acta(uuid, text, text) from public, anon;
grant execute on function public.registrar_adjunto_acta(uuid, text, text) to authenticated;
