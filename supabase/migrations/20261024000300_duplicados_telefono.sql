-- Duplicados: el teléfono pesa 0,3 (antes 0,2), decisión del 24/10/2026.
-- Con 0,2, mismo celular y mismo nombre sin cédula sumaban 0,45 y nunca llegaban al umbral de 0,5. Ahora suman 0,5
-- (0,55 en la misma zona). Mismos pesos que packages/nucleo/src/duplicados.ts.
-- Además ya no se agrupa por palabras del nombre: sin documento ni teléfono en común, un par suma como máximo 0,25 y
-- nunca llega al umbral, así que esos grupos no encontraban nada y con muchos «María» costaban millones de comparaciones.

create or replace function public.posibles_duplicados(p_campana uuid)
returns table (a uuid, b uuid, puntaje numeric, razones text[])
language sql
stable
set search_path = ''
as $$
  with p as (
    select id, documento_hash, privado.normaliza_telefono(telefono) as tel,
           privado.palabras_nombre(nombre) as palabras, territorio_trabajo_id as territorio
    from public.persona
    where campana_id = p_campana
  ),
  claves as (
    select id, 'd:' || documento_hash as clave from p where documento_hash is not null
    union select id, 't:' || tel from p where tel is not null
  ),
  pares as (
    select distinct x.id as a, y.id as b from claves x join claves y on x.clave = y.clave and x.id < y.id
  ),
  evaluados as (
    select pa.a, pa.b,
      (pa1.documento_hash is not null and pa1.documento_hash = pb.documento_hash) as mismo_doc,
      (pa1.tel is not null and pa1.tel = pb.tel) as mismo_tel,
      (pa1.territorio is not null and pa1.territorio = pb.territorio) as mismo_territorio,
      case when cardinality(pa1.palabras) = 0 or cardinality(pb.palabras) = 0 then 0
        else (select count(*) from unnest(pa1.palabras) w where w = any (pb.palabras))::numeric
             / greatest(cardinality(pa1.palabras), cardinality(pb.palabras))
      end as sim
    from pares pa join p pa1 on pa1.id = pa.a join p pb on pb.id = pa.b
  ),
  puntuados as (
    select a, b,
      (case when mismo_doc then 0.7 else 0 end)
      + (case when mismo_tel then 0.3 else 0 end)
      + (case when sim >= 0.75 then 0.2 * sim else 0 end)
      + (case when mismo_territorio then 0.05 else 0 end) as total,
      array_remove(array[
        case when mismo_doc then 'mismo documento' end,
        case when mismo_tel then 'mismo teléfono' end,
        case when sim >= 0.75 then 'nombre similar (' || round(sim * 100) || ' %)' end,
        case when mismo_territorio then 'mismo territorio' end
      ], null) as razones
    from evaluados
  )
  select a, b, least(1, round(total, 4)) as puntaje, razones
  from puntuados
  where total >= 0.5
  order by puntaje desc, a, b
$$;
