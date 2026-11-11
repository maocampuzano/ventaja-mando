-- El asistente de IA pasa a llamarse «Asesor IA» (decisión del 10/11/2026). Se renombra la función que dice si alguien
-- puede usarlo y el valor con el que se registra su consumo. No cambia quién puede usarlo ni cómo se mide el cupo.
alter function public.estado_strategos(uuid) rename to estado_asesor;

alter table public.uso_ia drop constraint uso_ia_funcion_check;
update public.uso_ia set funcion = 'asesor' where funcion = 'strategos';
alter table public.uso_ia add constraint uso_ia_funcion_check
  check (funcion in ('asesor', 'lectura_planilla', 'lectura_e14'));

-- Los permisos viajan con la función al renombrarla; se repiten para que queden a la vista (24_seguridad los revisa).
revoke all on function public.estado_asesor(uuid) from public, anon;
grant execute on function public.estado_asesor(uuid) to authenticated;
