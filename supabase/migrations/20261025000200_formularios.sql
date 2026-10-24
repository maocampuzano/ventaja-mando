-- Formularios (fase 2): la base valida el esquema y lleva la versión.
-- Mismas reglas que packages/nucleo/src/formularios.ts: ninguna pregunta individual sobre voto u opinión política
-- (regla 2) y nunca la cédula en un formulario (se guarda cifrada en el registro de la persona).

-- Devuelve el motivo si el texto no se puede preguntar en un formulario; nulo si se puede.
create or replace function privado.texto_prohibido_en_formulario(p_texto text)
returns text language sql stable set search_path = ''
as $$
  with t as (select regexp_replace(lower(extensions.unaccent(coalesce(p_texto, ''))), '[¿?¡!.,;:()]', ' ', 'g') as x)
  select case
    when x ~ '\m(vot(o|os|ar|aria|ara|ante)|intencion de voto|por quien|partido politico|simpatiza con|candidat[oa] preferid[oa]|opinion politica|ideologia)\M'
      then 'No se puede preguntar a cada persona por su voto u opinión política (regla 2).'
    when x ~ '\m(cedula|documento de identidad|numero de documento|c\.? ?c\.?)\M'
      then 'La cédula no se pide en un formulario: se guarda cifrada al registrar a la persona.'
  end
  from t
$$;

create or replace function privado.validar_formulario()
returns trigger language plpgsql set search_path = ''
as $$
declare
  c jsonb;
  motivo text;
begin
  if jsonb_typeof(new.esquema_json -> 'campos') is distinct from 'array'
     or jsonb_array_length(new.esquema_json -> 'campos') not between 1 and 40 then
    raise exception 'El formulario debe tener entre 1 y 40 campos.' using errcode = '22023';
  end if;
  for c in select value from jsonb_array_elements(new.esquema_json -> 'campos') loop
    motivo := privado.texto_prohibido_en_formulario(concat_ws(' ', c ->> 'etiqueta', c ->> 'ayuda',
      (select string_agg(o, ' ') from jsonb_array_elements_text(coalesce(c -> 'opciones', '[]')) o)));
    if motivo is not null then
      raise exception '«%»: %', c ->> 'etiqueta', motivo using errcode = '22023';
    end if;
  end loop;
  if tg_op = 'UPDATE' and new.esquema_json is distinct from old.esquema_json then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
create trigger validar before insert or update on public.formulario
  for each row execute function privado.validar_formulario();

revoke all on function privado.texto_prohibido_en_formulario(text) from public, anon;
-- Solo revisa un texto (no lee datos): el disparador la usa con los permisos de quien guarda el formulario.
grant execute on function privado.texto_prohibido_en_formulario(text) to authenticated;
