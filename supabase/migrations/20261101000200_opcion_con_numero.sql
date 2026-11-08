-- Las actas E-14 escriben el número del tarjetón delante del candidato («01 · Laura Méndez (Partido Demo)»). Sin
-- quitarlo, la opción configurada no coincidía y los votos de la candidata quedaban por fuera del cumplimiento.
-- Misma regla que votosDeOpcion en packages/nucleo/src/lider.ts.
create or replace function privado.normalizar_opcion(p text)
returns text language sql immutable set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '^\s*\d+\s*[·.\-–:)]*\s*', ''),
    '\s+', ' ', 'g'))
$$;
