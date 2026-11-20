-- guardar_acta: un tema que solo era un teléfono, un correo o un documento (por ejemplo, «310 000 1234») entraba al
-- acta, ya limpio, como la etiqueta «‹número›» o «‹correo›», y de ahí a la búsqueda y al resumen del Asesor IA.
-- Ahora se descarta el tema que después de limpiarlo no dice nada más (revisión de código del 20/11/2026). El resto de
-- la función no cambia.
create or replace function public.guardar_acta(
  p_reunion uuid, p_resumen text, p_temas text[], p_acuerdos text, p_compromisos jsonb, p_origen text default 'manual'
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_r public.reunion; v_acta uuid; v_c jsonb;
begin
  select * into v_r from public.reunion where id = p_reunion;
  if v_r.id is null or not privado.ve_reunion(v_r.campana_id, v_r.territorio_id) then
    raise exception 'La reunión no existe o no la puede editar.' using errcode = '42501';
  end if;
  if exists (select 1 from public.acta where reunion_id = p_reunion and estado = 'aprobada') then
    raise exception 'El acta ya está aprobada: no se modifica.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_compromisos, '[]')) <> 'array' then
    raise exception 'Los compromisos deben ser una lista.' using errcode = '22023';
  end if;
  for v_c in select * from jsonb_array_elements(coalesce(p_compromisos, '[]')) loop
    if privado.menciona_dinero(v_c ->> 'descripcion') then
      raise exception 'Un compromiso no puede ofrecer dinero, mercados, empleo ni otros beneficios (art. 390 del Código Penal). Revise: «%».',
        left(v_c ->> 'descripcion', 80) using errcode = '22023';
    end if;
    if (v_c ->> 'responsable_id') is not null and not exists (select 1 from public.membresia m
        where m.usuario_id = (v_c ->> 'responsable_id')::uuid and m.campana_id = v_r.campana_id and m.activa) then
      raise exception 'El responsable de un compromiso no pertenece a la campaña.' using errcode = '22023';
    end if;
  end loop;

  insert into public.acta (reunion_id, campana_id, resumen, temas, acuerdos, origen)
  values (p_reunion, v_r.campana_id, privado.texto_acta(p_resumen, 8000),
    coalesce((select array_agg(distinct x) from (select lower(trim(privado.texto_acta(t, 60))) x from unnest(coalesce(p_temas, '{}')) t) l
      where length(trim(regexp_replace(x, '‹(número|correo)›', '', 'g'))) > 0), '{}'),
    privado.texto_acta(p_acuerdos, 4000), case when p_origen = 'ia' then 'ia' else 'manual' end)
  on conflict (reunion_id) do update set resumen = excluded.resumen, temas = excluded.temas, acuerdos = excluded.acuerdos,
    origen = case when public.acta.origen = 'ia' then 'ia' else excluded.origen end
  returning id into v_acta;

  delete from public.acta_compromiso where acta_id = v_acta;
  insert into public.acta_compromiso (acta_id, campana_id, descripcion, responsable_id, vence_en)
    select v_acta, v_r.campana_id, privado.texto_acta(c ->> 'descripcion', 500), (c ->> 'responsable_id')::uuid, (c ->> 'vence_en')::date
    from jsonb_array_elements(coalesce(p_compromisos, '[]')) c
    where length(trim(coalesce(c ->> 'descripcion', ''))) >= 3;
  update public.reunion set estado = 'realizada' where id = p_reunion and estado = 'programada';
  return v_acta;
end;
$$;
revoke all on function public.guardar_acta(uuid, text, text[], text, jsonb, text) from public, anon;
grant execute on function public.guardar_acta(uuid, text, text[], text, jsonb, text) to authenticated;
