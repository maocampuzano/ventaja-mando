-- APK del E-14 (plan de mejora, etapa 4c; pedido de Giovanni del 18/11/2026). La app guarda las fotos del E-14 sin
-- señal y las envía sola. Para que una misma imagen no entre dos veces (por ejemplo, si se reinstaló la app o se
-- eligió dos veces de la galería), cada foto llega con su huella (hash del archivo) y la base no repite huellas en la
-- misma campaña. Se suma al identificador de la operación, que ya evitaba repetir un mismo envío.

alter table public.acta_e14 add column foto_hash text check (foto_hash is null or foto_hash ~ '^[0-9a-f]{32,128}$');
create unique index acta_e14_foto_hash on public.acta_e14 (campana_id, simulacro, foto_hash) where foto_hash is not null;

-- ¿Ya llegó esa imagen a la campaña? (con la llave del servidor: el testigo no ve las actas de los demás)
create or replace function privado.e14_con_huella(p_campana uuid, p_hash text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select a.id from public.acta_e14 a
  where a.campana_id = p_campana and a.foto_hash = p_hash and not a.simulacro
  limit 1
$$;
revoke all on function privado.e14_con_huella(uuid, text) from public, anon;
grant execute on function privado.e14_con_huella(uuid, text) to authenticated;

drop function public.registrar_e14_movil(uuid, uuid, uuid, integer, text);
create function public.registrar_e14_movil(p_id uuid, p_campana uuid, p_puesto uuid, p_mesa integer, p_foto text, p_hash text default null)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare v_hash text := lower(nullif(trim(coalesce(p_hash, '')), ''));
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
  -- La misma imagen ya llegó (con otro envío): se da por recibida, sin crear otra acta.
  if v_hash is not null and privado.e14_con_huella(p_campana, v_hash) is not null then
    return 'ya_estaba';
  end if;
  insert into public.acta_e14 (id, campana_id, puesto_id, mesa, foto_url, foto_hash, creado_por)
  values (p_id, p_campana, p_puesto, p_mesa, p_foto, v_hash, auth.uid());
  return 'creada';
end;
$$;
revoke all on function public.registrar_e14_movil(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.registrar_e14_movil(uuid, uuid, uuid, integer, text, text) to authenticated;

-- Para que la app sepa si hay conexión de verdad con el servidor (no solo señal): responde sin leer datos.
create or replace function public.ping_movil()
returns boolean language sql stable set search_path = ''
as $$ select auth.uid() is not null $$;
revoke all on function public.ping_movil() from public, anon;
grant execute on function public.ping_movil() to authenticated;
