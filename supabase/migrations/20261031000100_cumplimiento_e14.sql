-- Índice de cumplimiento del líder contra el E-14 (fase 5, diseño §7.3). Compara, AGREGADO por mesa, los apoyos que
-- cada líder registró en sus mesas con los votos del candidato en los E-14 revisados de esas mesas (regla 7: solo
-- actas revisadas por una persona, y nunca las de un simulacro). Nunca devuelve personas ni el detalle por mesa.
-- Con menos de 3 mesas o 10 apoyos no compara: con tan pocos, la cifra podría insinuar cómo votó alguien.
-- Los umbrales y la fórmula son los de packages/nucleo/src/lider.ts (cumplimientoPost).

-- Cómo aparece el candidato en el E-14 y en los resultados históricos (los escribe la dirección).
alter table public.campana
  add column opcion_e14 text,
  add column opcion_historica text;

create or replace function privado.normalizar_opcion(p text)
returns text language sql immutable set search_path = ''
as $$ select trim(regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '\s+', ' ', 'g')) $$;

create or replace function public.configurar_opciones_e14(p_campana uuid, p_opcion_e14 text, p_opcion_historica text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección configura cómo aparece el candidato en el E-14.' using errcode = '42501';
  end if;
  update public.campana set opcion_e14 = nullif(trim(p_opcion_e14), ''), opcion_historica = nullif(trim(p_opcion_historica), '')
  where id = p_campana;
  perform privado.auditar(p_campana, 'configurar_opciones_e14', 'campana', p_campana,
    jsonb_build_object('opcion_e14', p_opcion_e14, 'opcion_historica', p_opcion_historica));
end;
$$;

create or replace function public.cumplimiento_lideres_e14(p_campana uuid)
returns table (
  lider_id uuid, nombre text, mesas integer, apoyos integer, suficiente boolean,
  votos integer, votos_historicos integer, mesas_sin_historico integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_opcion text; v_historica text;
  v_todo boolean := coalesce(privado.es_direccion(p_campana) or privado.rol(p_campana) = 'candidato', false);
begin
  if not (v_todo or coalesce(privado.rol(p_campana) = 'coordinador', false)) then
    raise exception 'No tiene acceso al cumplimiento de los líderes de esta campaña.' using errcode = '42501';
  end if;
  select privado.normalizar_opcion(c.opcion_e14), privado.normalizar_opcion(c.opcion_historica)
    into v_opcion, v_historica from public.campana c where c.id = p_campana;
  if coalesce(v_opcion, '') = '' then
    raise exception 'Falta configurar cómo aparece el candidato en el E-14.' using errcode = '22023';
  end if;

  return query
  with apoyos as (
    -- Apoyos validados o comprometidos, con autorización vigente (si la revocó, no se usa ni en agregado).
    select p.lider_id, p.puesto_id, p.mesa, count(*)::integer n
    from public.persona p
    where p.campana_id = p_campana and p.lider_id is not null and p.puesto_id is not null and p.mesa is not null
      and p.estado_contacto in ('validado', 'comprometido')
      and exists (select 1 from public.autorizacion a where a.persona_id = p.id and a.revocada_en is null)
    group by 1, 2, 3
  ),
  actas as (
    select distinct on (x.puesto_id, x.mesa) x.puesto_id, x.mesa,
      (select (v ->> 'votos')::integer from jsonb_array_elements(x.extraccion_json -> 'revision' -> 'votos') v
       where privado.normalizar_opcion(v ->> 'opcion') = v_opcion limit 1) votos
    from public.acta_e14 x
    where x.campana_id = p_campana and not x.simulacro and x.estado in ('revisada', 'consolidada')
    order by x.puesto_id, x.mesa, x.revisada_en desc
  ),
  historico as (
    select h.puesto_id, sum(h.votos)::numeric / nullif(pu.mesas, 0) por_mesa
    from public.historico_resultado h join public.puesto pu on pu.id = h.puesto_id
    where v_historica <> '' and privado.normalizar_opcion(h.candidato_o_partido) = v_historica
    group by h.puesto_id, pu.mesas
  ),
  por_lider as (
    select a.lider_id, count(*)::integer mesas, sum(a.n)::integer apoyos, sum(x.votos)::integer votos,
      round(sum(h.por_mesa))::integer votos_historicos, count(*) filter (where h.por_mesa is null)::integer sin_historico
    from apoyos a
    join actas x on x.puesto_id = a.puesto_id and x.mesa = a.mesa and x.votos is not null
    left join historico h on h.puesto_id = a.puesto_id
    group by a.lider_id
  )
  select l.id, l.nombre, coalesce(pl.mesas, 0), coalesce(pl.apoyos, 0),
    coalesce(pl.mesas >= 3 and pl.apoyos >= 10, false),
    case when pl.mesas >= 3 and pl.apoyos >= 10 then pl.votos end,
    case when pl.mesas >= 3 and pl.apoyos >= 10 then pl.votos_historicos end,
    case when pl.mesas >= 3 and pl.apoyos >= 10 then pl.sin_historico end
  from public.lider l
  left join por_lider pl on pl.lider_id = l.id
  where l.campana_id = p_campana and (v_todo or privado.coordina_lider(p_campana, l.id))
  order by l.nombre;
end;
$$;

revoke all on function privado.normalizar_opcion(text) from public, anon;
grant execute on function privado.normalizar_opcion(text) to authenticated;
revoke all on function public.configurar_opciones_e14(uuid, text, text), public.cumplimiento_lideres_e14(uuid) from public, anon;
grant execute on function public.configurar_opciones_e14(uuid, text, text), public.cumplimiento_lideres_e14(uuid) to authenticated;
