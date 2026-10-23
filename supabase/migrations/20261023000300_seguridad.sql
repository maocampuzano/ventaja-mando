-- Seguridad: quién ve qué (RLS) y reglas que la base hace cumplir.
-- Regla 8 de CLAUDE.md: el aislamiento por campaña y territorio lo garantiza la base de datos, no la interfaz.
--
-- Alcance por rol dentro de una campaña:
--   administrador, gerente  toda la campaña (solo con sesión de dos factores, aal2)
--   candidato               datos agregados, finanzas y configuración; no ve personas una por una
--   coordinador             sus territorios y los que cuelgan de ellos
--   lider                   las personas que él registró o tiene asignadas
--   testigo                 solo su mesa

-- Funciones de apoyo ----------------------------------------------------------------------------

-- Rol vigente del usuario actual en la campaña. Administradores y gerentes sin 2FA no tienen rol.
create or replace function privado.rol(p_campana uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol
  from public.membresia m
  where m.usuario_id = auth.uid()
    and m.campana_id = p_campana
    and m.activa
    and (m.rol not in ('administrador', 'gerente') or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;

create or replace function privado.es_miembro(p_campana uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select privado.rol(p_campana) is not null $$;

create or replace function privado.es_direccion(p_campana uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(privado.rol(p_campana) in ('administrador', 'gerente'), false) $$;

-- Territorios asignados al usuario en la campaña, con todos sus descendientes.
create or replace function privado.territorios_permitidos(p_campana uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive arbol as (
    select unnest(m.territorio_ids) as id
    from public.membresia m
    where m.usuario_id = auth.uid() and m.campana_id = p_campana and m.activa
    union
    select t.id from public.territorio t join arbol a on t.padre_id = a.id
  )
  select coalesce(array_agg(id), '{}') from arbol
$$;

create or replace function privado.lider_actual(p_campana uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select l.id from public.lider l
  where l.campana_id = p_campana and l.usuario_id = auth.uid() and privado.rol(p_campana) = 'lider'
$$;

-- Un puesto está en los territorios del usuario si su territorio oficial o su ubicación caen en ellos.
create or replace function privado.puesto_en_territorios(p_campana uuid, p_puesto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.puesto p
    left join public.territorio t on t.id = any (privado.territorios_permitidos(p_campana))
    where p.id = p_puesto
      and (p.territorio_id = t.id or (p.geom is not null and t.geom is not null and extensions.st_within(p.geom, t.geom)))
  )
$$;

create or replace function privado.es_mi_mesa(p_campana uuid, p_puesto uuid, p_mesa integer)
returns boolean language sql stable security definer set search_path = ''
as $$
  select privado.rol(p_campana) = 'testigo' and exists (
    select 1 from public.testigo tg
    where tg.campana_id = p_campana and tg.usuario_id = auth.uid()
      and tg.puesto_id = p_puesto and (tg.mesa is null or tg.mesa = p_mesa)
  )
$$;

create or replace function privado.puede_ver_persona(p_campana uuid, p_territorio uuid, p_lider uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case privado.rol(p_campana)
    when 'administrador' then true
    when 'gerente' then true
    when 'coordinador' then p_territorio = any (privado.territorios_permitidos(p_campana))
    when 'lider' then p_lider is not null and p_lider = privado.lider_actual(p_campana)
    else false
  end
$$;

create or replace function privado.coordina_territorio(p_campana uuid, p_territorio uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select privado.rol(p_campana) = 'coordinador' and p_territorio = any (privado.territorios_permitidos(p_campana))
$$;

create or replace function privado.coordina_lider(p_campana uuid, p_lider uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select privado.rol(p_campana) = 'coordinador' and exists (
    select 1 from public.lider l
    where l.id = p_lider and l.territorio_ids && privado.territorios_permitidos(p_campana)
  )
$$;

grant execute on all functions in schema privado to authenticated;
revoke execute on function privado.secreto(text) from authenticated;

-- Auditoría -----------------------------------------------------------------------------------------

create or replace function privado.auditar(
  p_campana uuid, p_accion text, p_entidad text, p_entidad_id uuid, p_detalle jsonb default '{}'
)
returns void language sql security definer set search_path = ''
as $$
  insert into public.auditoria (campana_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (p_campana, auth.uid(), p_accion, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'))
$$;
revoke all on function privado.auditar(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- Registra cambios de tablas sensibles. Nunca guarda el documento, ni cifrado ni su hash.
create or replace function privado.auditar_cambio()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old)) - 'documento_cifrado' - 'documento_hash';
  antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'documento_cifrado' - 'documento_hash' end;
begin
  perform privado.auditar(
    (fila ->> 'campana_id')::uuid,
    lower(tg_op),
    tg_table_name,
    coalesce((fila ->> 'id')::uuid, (fila ->> 'persona_id')::uuid),
    jsonb_strip_nulls(jsonb_build_object('nuevo', case when tg_op <> 'DELETE' then fila end, 'anterior', antes))
  );
  return coalesce(new, old);
end;
$$;

create trigger auditar after insert or update or delete on public.membresia
  for each row execute function privado.auditar_cambio();
create trigger auditar after insert or update or delete on public.preferencia_politica
  for each row execute function privado.auditar_cambio();
create trigger auditar after update or delete on public.autorizacion
  for each row execute function privado.auditar_cambio();
create trigger auditar after delete on public.persona
  for each row execute function privado.auditar_cambio();
create trigger auditar after update of permite_preferencia_politica on public.campana
  for each row execute function privado.auditar_cambio();

-- Reglas que hace cumplir la base -----------------------------------------------------------------

-- Una fila no puede apuntar a datos de otra campaña. Argumentos: columna, tabla referida.
-- Para territorio se acepta también un territorio oficial (sin campaña).
create or replace function privado.exigir_misma_campana()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  i integer := 0;
  valor uuid;
  campana_ref uuid;
  encontrado boolean;
begin
  while i < tg_nargs loop
    valor := (to_jsonb(new) ->> tg_argv[i])::uuid;
    if valor is not null then
      execute format('select true, campana_id from public.%I where id = $1', tg_argv[i + 1])
        into encontrado, campana_ref using valor;
      if encontrado and campana_ref is distinct from new.campana_id
         and not (tg_argv[i + 1] = 'territorio' and campana_ref is null) then
        raise exception 'El registro de % pertenece a otra campaña.', tg_argv[i + 1]
          using errcode = '42501';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end;
$$;

create trigger misma_campana before insert or update on public.persona
  for each row execute function privado.exigir_misma_campana('lider_id', 'lider', 'territorio_trabajo_id', 'territorio', 'fila_ocr_id', 'fila_ocr');
create trigger misma_campana before insert or update on public.autorizacion
  for each row execute function privado.exigir_misma_campana('persona_id', 'persona');
create trigger misma_campana before insert or update on public.preferencia_politica
  for each row execute function privado.exigir_misma_campana('persona_id', 'persona', 'autorizacion_id', 'autorizacion');
create trigger misma_campana before insert or update on public.solicitud_titular
  for each row execute function privado.exigir_misma_campana('persona_id', 'persona');
create trigger misma_campana before insert or update on public.lote_ocr
  for each row execute function privado.exigir_misma_campana('lider_id', 'lider');
create trigger misma_campana before insert or update on public.fila_ocr
  for each row execute function privado.exigir_misma_campana('lote_id', 'lote_ocr');
create trigger misma_campana before insert or update on public.respuesta
  for each row execute function privado.exigir_misma_campana('formulario_id', 'formulario', 'persona_id', 'persona');
create trigger misma_campana before insert or update on public.tarea
  for each row execute function privado.exigir_misma_campana('territorio_id', 'territorio');
create trigger misma_campana before insert or update on public.cola_llamadas
  for each row execute function privado.exigir_misma_campana('territorio_id', 'territorio');
create trigger misma_campana before insert or update on public.llamada
  for each row execute function privado.exigir_misma_campana('cola_id', 'cola_llamadas', 'persona_id', 'persona');
create trigger misma_campana before insert or update on public.mensaje
  for each row execute function privado.exigir_misma_campana('persona_id', 'persona');
create trigger misma_campana before insert or update on public.solicitud_ciudadana
  for each row execute function privado.exigir_misma_campana('persona_id', 'persona');
create trigger misma_campana before insert or update on public.finanza_movimiento
  for each row execute function privado.exigir_misma_campana('aportante_id', 'persona', 'tope_id', 'finanza_tope');
create trigger misma_campana before insert or update on public.testigo
  for each row execute function privado.exigir_misma_campana('persona_id', 'persona');
create trigger misma_campana before insert or update on public.pauta_metrica
  for each row execute function privado.exigir_misma_campana('territorio_id', 'territorio');

-- Regla 3: ninguna persona queda guardada sin autorización. Se revisa al cerrar la transacción,
-- para poder crear la persona y su autorización juntas.
create or replace function privado.exigir_autorizacion()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.persona where id = new.id)
     and not exists (select 1 from public.autorizacion a where a.persona_id = new.id) then
    raise exception 'No se puede guardar a una persona sin autorización registrada (finalidades, canal, fecha y evidencia).'
      using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger exigir_autorizacion after insert on public.persona
  deferrable initially deferred
  for each row execute function privado.exigir_autorizacion();

-- Regla 7: lo leído por OCR entra a la base solo después de la revisión de una persona.
create or replace function privado.exigir_ocr_revisado()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.origen = 'ocr' and not exists (
    select 1 from public.fila_ocr f where f.id = new.fila_ocr_id and f.revisada_por is not null
  ) then
    raise exception 'Una fila leída por OCR debe tener revisión humana antes de entrar a la base.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger ocr_revisado before insert or update of origen, fila_ocr_id on public.persona
  for each row execute function privado.exigir_ocr_revisado();

-- Regla 2: la preferencia política solo existe si la campaña la activó y con autorización sensible vigente.
create or replace function privado.exigir_preferencia_valida()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not (select permite_preferencia_politica from public.campana where id = new.campana_id) then
    raise exception 'Esta campaña no tiene activada la clasificación política individual.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.autorizacion a
    where a.id = new.autorizacion_id and a.persona_id = new.persona_id and a.sensible and a.revocada_en is null
  ) then
    raise exception 'La preferencia política exige una autorización sensible vigente de la misma persona.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger preferencia_valida before insert or update on public.preferencia_politica
  for each row execute function privado.exigir_preferencia_valida();

-- Si se revoca la autorización sensible, la preferencia política se borra.
create or replace function privado.al_revocar_autorizacion()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.revocada_en is not null and old.revocada_en is null and new.sensible then
    delete from public.preferencia_politica where autorizacion_id = new.id;
  end if;
  return new;
end;
$$;
create trigger al_revocar after update of revocada_en on public.autorizacion
  for each row execute function privado.al_revocar_autorizacion();

-- Una autorización no se reescribe: solo se puede revocar.
create or replace function privado.autorizacion_inmutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.persona_id, new.finalidades, new.sensible, new.canal, new.evidencia_url, new.fecha)
     is distinct from (old.persona_id, old.finalidades, old.sensible, old.canal, old.evidencia_url, old.fecha)
     or (old.revocada_en is not null and new.revocada_en is distinct from old.revocada_en) then
    raise exception 'Una autorización no se modifica; si cambia, se revoca y se registra una nueva.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger inmutable before update on public.autorizacion
  for each row execute function privado.autorizacion_inmutable();

-- Políticas RLS ------------------------------------------------------------------------------------

alter table public.organizacion enable row level security;
alter table public.campana enable row level security;
alter table public.usuario enable row level security;
alter table public.membresia enable row level security;
alter table public.invitacion enable row level security;
alter table public.territorio enable row level security;
alter table public.capa_gis enable row level security;
alter table public.puesto enable row level security;
alter table public.lider enable row level security;
alter table public.lote_ocr enable row level security;
alter table public.fila_ocr enable row level security;
alter table public.persona enable row level security;
alter table public.autorizacion enable row level security;
alter table public.preferencia_politica enable row level security;
alter table public.solicitud_titular enable row level security;
alter table public.formulario enable row level security;
alter table public.respuesta enable row level security;
alter table public.tarea enable row level security;
alter table public.cola_llamadas enable row level security;
alter table public.llamada enable row level security;
alter table public.mensaje enable row level security;
alter table public.solicitud_ciudadana enable row level security;
alter table public.finanza_tope enable row level security;
alter table public.finanza_movimiento enable row level security;
alter table public.testigo enable row level security;
alter table public.incidencia enable row level security;
alter table public.acta_e14 enable row level security;
alter table public.pauta_metrica enable row level security;
alter table public.historico_resultado enable row level security;
alter table public.auditoria enable row level security;

-- Organización, campaña y equipo
create policy ver on public.organizacion for select to authenticated
  using (exists (select 1 from public.campana c where c.organizacion_id = organizacion.id and privado.es_miembro(c.id)));

create policy ver on public.campana for select to authenticated using (privado.es_miembro(id));
create policy editar on public.campana for update to authenticated
  using (privado.es_direccion(id)) with check (privado.es_direccion(id));

create policy ver on public.usuario for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.membresia m where m.usuario_id = usuario.id and privado.es_direccion(m.campana_id)
  ));
create policy editar_propio on public.usuario for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Solo un administrador puede dar los roles de administrador o gerente.
create policy ver on public.membresia for select to authenticated
  using (usuario_id = auth.uid() or privado.es_direccion(campana_id));
create policy gestionar on public.membresia for all to authenticated
  using (privado.es_direccion(campana_id))
  with check (privado.es_direccion(campana_id)
    and (rol not in ('administrador', 'gerente') or privado.rol(campana_id) = 'administrador'));

create policy gestionar on public.invitacion for all to authenticated
  using (privado.es_direccion(campana_id))
  with check (privado.es_direccion(campana_id)
    and (rol not in ('administrador', 'gerente') or privado.rol(campana_id) = 'administrador'));

-- Territorio y datos abiertos
create policy ver on public.territorio for select to authenticated
  using (campana_id is null or privado.es_miembro(campana_id));
create policy gestionar on public.territorio for all to authenticated
  using (campana_id is not null and privado.es_direccion(campana_id))
  with check (campana_id is not null and privado.es_direccion(campana_id));

create policy ver on public.capa_gis for select to authenticated using (privado.es_miembro(campana_id));
create policy gestionar on public.capa_gis for all to authenticated
  using (privado.es_direccion(campana_id)) with check (privado.es_direccion(campana_id));

create policy ver on public.puesto for select to authenticated using (true);
create policy ver on public.historico_resultado for select to authenticated using (true);

-- Líderes
create policy ver on public.lider for select to authenticated
  using (privado.es_direccion(campana_id) or usuario_id = auth.uid() or privado.coordina_lider(campana_id, id));
create policy gestionar on public.lider for all to authenticated
  using (privado.es_direccion(campana_id) or privado.coordina_lider(campana_id, id))
  with check (privado.es_direccion(campana_id)
    or (privado.rol(campana_id) = 'coordinador' and territorio_ids <@ privado.territorios_permitidos(campana_id)));

-- Personas (regla 8) y sus autorizaciones
create policy ver on public.persona for select to authenticated
  using (privado.puede_ver_persona(campana_id, territorio_trabajo_id, lider_id));
create policy crear on public.persona for insert to authenticated
  with check (privado.puede_ver_persona(campana_id, territorio_trabajo_id, lider_id) and creado_por = auth.uid());
create policy editar on public.persona for update to authenticated
  using (privado.puede_ver_persona(campana_id, territorio_trabajo_id, lider_id))
  with check (privado.puede_ver_persona(campana_id, territorio_trabajo_id, lider_id));
create policy borrar on public.persona for delete to authenticated using (privado.es_direccion(campana_id));

create policy ver on public.autorizacion for select to authenticated
  using (exists (select 1 from public.persona p where p.id = persona_id));
create policy crear on public.autorizacion for insert to authenticated
  with check (exists (select 1 from public.persona p where p.id = persona_id) and registrado_por = auth.uid());
create policy revocar on public.autorizacion for update to authenticated
  using (exists (select 1 from public.persona p where p.id = persona_id))
  with check (exists (select 1 from public.persona p where p.id = persona_id));

create policy gestionar on public.preferencia_politica for all to authenticated
  using (privado.es_direccion(campana_id)) with check (privado.es_direccion(campana_id));

create policy gestionar on public.solicitud_titular for all to authenticated
  using (privado.es_direccion(campana_id)) with check (privado.es_direccion(campana_id));

-- Planillas (OCR)
create policy ver on public.lote_ocr for select to authenticated
  using (privado.es_direccion(campana_id) or lider_id = privado.lider_actual(campana_id)
    or privado.coordina_lider(campana_id, lider_id));
create policy crear on public.lote_ocr for insert to authenticated
  with check ((privado.es_direccion(campana_id) or lider_id = privado.lider_actual(campana_id)
    or privado.coordina_lider(campana_id, lider_id)) and creado_por = auth.uid());
create policy editar on public.lote_ocr for update to authenticated
  using (privado.es_direccion(campana_id) or lider_id = privado.lider_actual(campana_id)
    or privado.coordina_lider(campana_id, lider_id));

create policy ver on public.fila_ocr for select to authenticated
  using (exists (select 1 from public.lote_ocr l where l.id = lote_id));
create policy crear on public.fila_ocr for insert to authenticated
  with check (exists (select 1 from public.lote_ocr l where l.id = lote_id));
-- Quien revisa queda registrado con su propio usuario.
create policy revisar on public.fila_ocr for update to authenticated
  using (exists (select 1 from public.lote_ocr l where l.id = lote_id))
  with check (revisada_por is null or revisada_por = auth.uid());

-- Formularios y respuestas
create policy ver on public.formulario for select to authenticated using (privado.es_miembro(campana_id));
create policy gestionar on public.formulario for all to authenticated
  using (privado.es_direccion(campana_id)) with check (privado.es_direccion(campana_id));

create policy ver on public.respuesta for select to authenticated
  using (privado.es_direccion(campana_id) or capturado_por = auth.uid());
create policy crear on public.respuesta for insert to authenticated
  with check (privado.es_miembro(campana_id) and capturado_por = auth.uid()
    and (persona_id is null or exists (select 1 from public.persona p where p.id = persona_id)));

-- Tareas
create policy ver on public.tarea for select to authenticated
  using (privado.es_direccion(campana_id) or asignado_a = auth.uid() or privado.coordina_territorio(campana_id, territorio_id));
create policy crear on public.tarea for insert to authenticated
  with check (privado.es_direccion(campana_id) or privado.coordina_territorio(campana_id, territorio_id));
create policy editar on public.tarea for update to authenticated
  using (privado.es_direccion(campana_id) or asignado_a = auth.uid() or privado.coordina_territorio(campana_id, territorio_id));

-- Telemarketing y mensajes
create policy ver on public.cola_llamadas for select to authenticated
  using (privado.es_direccion(campana_id) or privado.coordina_territorio(campana_id, territorio_id));
create policy gestionar on public.cola_llamadas for all to authenticated
  using (privado.es_direccion(campana_id)) with check (privado.es_direccion(campana_id));

create policy ver on public.llamada for select to authenticated
  using (privado.es_direccion(campana_id) or agente_id = auth.uid());
create policy crear on public.llamada for insert to authenticated
  with check (privado.es_miembro(campana_id) and agente_id = auth.uid()
    and (persona_id is null or exists (select 1 from public.persona p where p.id = persona_id)));

create policy ver on public.mensaje for select to authenticated
  using (privado.es_direccion(campana_id) or creado_por = auth.uid());
-- Un líder solo registra que abrió el WhatsApp de una persona que puede ver.
create policy crear on public.mensaje for insert to authenticated
  with check (creado_por = auth.uid() and (
    privado.es_direccion(campana_id)
    or (canal = 'wa_manual' and exists (select 1 from public.persona p where p.id = persona_id))
  ));

-- Solicitudes ciudadanas
create policy ver on public.solicitud_ciudadana for select to authenticated
  using (privado.es_direccion(campana_id) or creado_por = auth.uid() or responsable = auth.uid());
create policy crear on public.solicitud_ciudadana for insert to authenticated
  with check (privado.es_miembro(campana_id) and creado_por = auth.uid());
create policy editar on public.solicitud_ciudadana for update to authenticated
  using (privado.es_direccion(campana_id) or responsable = auth.uid());

-- Finanzas: dirección y candidato (responsable legal de las cuentas)
create policy ver on public.finanza_tope for select to authenticated
  using (privado.es_direccion(campana_id) or privado.rol(campana_id) = 'candidato');
create policy gestionar on public.finanza_tope for all to authenticated
  using (privado.es_direccion(campana_id)) with check (privado.es_direccion(campana_id));
create policy ver on public.finanza_movimiento for select to authenticated
  using (privado.es_direccion(campana_id) or privado.rol(campana_id) = 'candidato');
create policy gestionar on public.finanza_movimiento for all to authenticated
  using (privado.es_direccion(campana_id)) with check (privado.es_direccion(campana_id));

-- Día E
create policy ver on public.testigo for select to authenticated
  using (privado.es_direccion(campana_id) or usuario_id = auth.uid() or
    (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id)));
create policy gestionar on public.testigo for all to authenticated
  using (privado.es_direccion(campana_id) or
    (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id)))
  with check (privado.es_direccion(campana_id) or
    (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id)));

create policy ver on public.incidencia for select to authenticated
  using (privado.es_direccion(campana_id) or privado.es_mi_mesa(campana_id, puesto_id, mesa) or
    (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id)));
create policy crear on public.incidencia for insert to authenticated
  with check (reportado_por = auth.uid() and (privado.es_direccion(campana_id) or privado.es_mi_mesa(campana_id, puesto_id, mesa)
    or (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id))));
create policy atender on public.incidencia for update to authenticated
  using (privado.es_direccion(campana_id) or
    (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id)));

create policy ver on public.acta_e14 for select to authenticated
  using (privado.es_direccion(campana_id) or privado.es_mi_mesa(campana_id, puesto_id, mesa) or
    (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id)));
create policy crear on public.acta_e14 for insert to authenticated
  with check (creado_por = auth.uid() and estado = 'recibida' and revisada_por is null
    and (privado.es_direccion(campana_id) or privado.es_mi_mesa(campana_id, puesto_id, mesa)));
-- El testigo no revisa su propia acta; la revisa la dirección o el coordinador, con su usuario.
create policy revisar on public.acta_e14 for update to authenticated
  using (privado.es_direccion(campana_id) or
    (privado.rol(campana_id) = 'coordinador' and privado.puesto_en_territorios(campana_id, puesto_id)))
  with check (revisada_por is null or revisada_por = auth.uid());

-- Datos agregados
create policy ver on public.pauta_metrica for select to authenticated using (privado.es_miembro(campana_id));

-- Auditoría: solo lectura para la dirección; nadie la modifica desde la API.
create policy ver on public.auditoria for select to authenticated using (privado.es_direccion(campana_id));
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;
