-- Permiso para pedir un envío desde la función del servidor «enviar»: solo la dirección de la campaña del envío.
-- Siempre true o false.
create or replace function public.puede_enviar(p_envio uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select privado.es_direccion(e.campana_id) from public.envio e where e.id = p_envio), false)
$$;
revoke all on function public.puede_enviar(uuid) from public, anon;
grant execute on function public.puede_enviar(uuid) to authenticated;
