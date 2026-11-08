-- Planillas imprimibles (fase 3): cada lote impreso queda registrado con su número, su líder, cuántas hojas tiene y
-- con qué texto de autorización salió. El QR de cada hoja lleva solo el id del lote y el número de hoja
-- (packages/nucleo/src/planilla.ts); la lectura de la foto (fase 4) lo resuelve aquí, con la RLS.
-- La tabla no guarda datos de ciudadanos: esos llegan después, con la planilla llena y su revisión humana (regla 7).

create table public.lote_planilla (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  lider_id uuid not null references public.lider (id),
  numero integer not null check (numero > 0),
  hojas integer not null check (hojas between 1 and 50),
  finalidades text[] not null check (cardinality(finalidades) > 0),
  -- El texto exacto que salió impreso: es parte de la evidencia de la autorización (regla 3).
  texto_autorizacion text not null check (length(trim(texto_autorizacion)) > 0),
  generado_por uuid not null references public.usuario (id),
  generado_en timestamptz not null default now(),
  unique (campana_id, numero)
);

create index lote_planilla_lider on public.lote_planilla (lider_id);

create trigger misma_campana before insert or update on public.lote_planilla
  for each row execute function privado.exigir_misma_campana('lider_id', 'lider');

alter table public.lote_planilla enable row level security;

-- Ven el lote: la dirección, la coordinación del líder y el propio líder.
create policy ver on public.lote_planilla for select to authenticated
  using (privado.es_direccion(campana_id) or lider_id = privado.lider_actual(campana_id)
    or privado.coordina_lider(campana_id, lider_id));
-- No hay políticas de escritura: los lotes se crean solo con crear_lote_planilla (numeración sin huecos ni choques)
-- y no se editan ni se borran desde la API.

-- Crea un lote con el siguiente número de la campaña. Lo puede hacer la dirección, o la coordinación si el líder está en
-- su territorio. Es security definer para numerar sobre todos los lotes de la campaña (la coordinadora no los ve todos);
-- por eso verifica los permisos a mano.
create or replace function public.crear_lote_planilla(
  p_campana uuid, p_lider uuid, p_hojas integer, p_finalidades text[], p_texto text
)
returns table (id uuid, numero integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_numero integer;
begin
  if auth.uid() is null then
    raise exception 'Inicie sesión para imprimir planillas.' using errcode = '42501';
  end if;
  if p_hojas is null or p_hojas < 1 or p_hojas > 50 then
    raise exception 'Cada lote lleva entre 1 y 50 hojas.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_finalidades), 0) = 0 then
    raise exception 'Marque al menos una finalidad de la autorización.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then
    raise exception 'Falta el texto de autorización de la planilla.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lider l where l.id = p_lider and l.campana_id = p_campana) then
    raise exception 'Ese líder no es de esta campaña.' using errcode = '22023';
  end if;
  if not (privado.es_direccion(p_campana) or privado.coordina_lider(p_campana, p_lider)) then
    raise exception 'Solo la dirección de la campaña o la coordinación del líder imprimen sus planillas.' using errcode = '42501';
  end if;

  -- Un lote a la vez por campaña, para que dos impresiones simultáneas no tomen el mismo número.
  perform pg_advisory_xact_lock(hashtextextended('lote_planilla:' || p_campana::text, 0));
  select coalesce(max(lp.numero), 0) + 1 into v_numero from public.lote_planilla lp where lp.campana_id = p_campana;

  insert into public.lote_planilla (campana_id, lider_id, numero, hojas, finalidades, texto_autorizacion, generado_por)
  values (p_campana, p_lider, v_numero, p_hojas, p_finalidades, trim(p_texto), auth.uid())
  returning lote_planilla.id into v_id;

  return query select v_id, v_numero;
end;
$$;

-- Últimos lotes que puede ver quien consulta, con el nombre del líder (para la lista del panel).
create or replace function public.lotes_planilla(p_campana uuid, p_limite integer default 20)
returns table (id uuid, numero integer, lider_id uuid, lider text, hojas integer, generado_en timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select lp.id, lp.numero, lp.lider_id, l.nombre, lp.hojas, lp.generado_en
  from public.lote_planilla lp
  join public.lider l on l.id = lp.lider_id
  where lp.campana_id = p_campana
  order by lp.numero desc
  limit least(greatest(coalesce(p_limite, 20), 1), 100);
$$;

revoke all on function public.crear_lote_planilla(uuid, uuid, integer, text[], text) from public, anon;
revoke all on function public.lotes_planilla(uuid, integer) from public, anon;
grant execute on function public.crear_lote_planilla(uuid, uuid, integer, text[], text) to authenticated;
grant execute on function public.lotes_planilla(uuid, integer) to authenticated;
