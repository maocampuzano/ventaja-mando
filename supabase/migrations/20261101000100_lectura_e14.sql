-- Lectura del E-14 con IA (fase 5). La función de Supabase «lectura» lee la foto del acta y deja los números en
-- extraccion_json con el acta en «leida». No suma nada: una persona distinta a quien subió el acta la revisa y la
-- confirma con revisar_e14 (regla 7).

-- ¿Puede quien llama pedir la lectura de esta acta? Quien maneja el día E de su puesto (dirección o coordinación).
-- Siempre true o false.
create or replace function public.puede_leer_e14(p_acta uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select privado.maneja_puesto(x.campana_id, x.puesto_id) from public.acta_e14 x where x.id = p_acta), false)
$$;

-- Solo la llama la función del servidor (service_role), después de verificar el permiso con puede_leer_e14.
create or replace function public.guardar_lectura_e14(p_acta uuid, p_lectura jsonb, p_alertas integer)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(p_lectura -> 'votos'), '') <> 'array' then
    raise exception 'La lectura no trae los votos del acta.' using errcode = '22023';
  end if;
  update public.acta_e14
  set extraccion_json = p_lectura - 'revision', alertas = greatest(coalesce(p_alertas, 0), 0), estado = 'leida'
  where id = p_acta and estado = 'recibida';
  if not found then
    raise exception 'El acta ya se leyó o ya fue revisada.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.puede_leer_e14(uuid) from public, anon;
grant execute on function public.puede_leer_e14(uuid) to authenticated;
revoke all on function public.guardar_lectura_e14(uuid, jsonb, integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.guardar_lectura_e14(uuid, jsonb, integer) to service_role;
  end if;
end $$;
