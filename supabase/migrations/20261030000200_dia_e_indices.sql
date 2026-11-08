-- Índices para el tablero del día E (public.tablero_dia_e): por cada mesa busca su testigo, su acta y sus novedades,
-- y por cada puesto su histórico. Sin estos índices, cada búsqueda recorre la tabla entera, y en una ciudad con miles
-- de mesas el tablero se vuelve lento justo cuando más se usa (lo mostró la prueba de carga).
create index if not exists testigo_mesa on public.testigo (campana_id, puesto_id, mesa);
create index if not exists acta_e14_mesa on public.acta_e14 (campana_id, puesto_id, mesa, simulacro);
create index if not exists incidencia_mesa on public.incidencia (campana_id, puesto_id, mesa, simulacro);
create index if not exists historico_resultado_puesto on public.historico_resultado (puesto_id);
