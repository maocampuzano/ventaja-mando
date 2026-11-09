-- Finanzas de campaña (fase 6). Libro de ingresos y gastos con los códigos del formulario 5B del CNE, tope de gastos,
-- terceros (aportantes y proveedores) con el documento cifrado, soportes en un bucket privado y exportación auditada
-- para el contador. Reglas de la Ley 1475 de 2011: ningún aportante particular por encima del 10 % del tope, los
-- ingresos privados no superan el tope, nada anónimo, verificación de fuentes prohibidas y acta para personas jurídicas.
-- Ven y manejan las finanzas la dirección; la candidata (responsable legal) las ve.

alter table public.campana add column tope_gastos numeric(14, 0) check (tope_gastos > 0);

-- Terceros: quien aporta o a quien se le paga. El documento va cifrado y con HMAC, como la cédula de las personas.
create table public.tercero (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  tipo_persona text not null check (tipo_persona in ('natural', 'juridica')),
  nombre text not null check (length(trim(nombre)) > 0),
  documento_cifrado bytea not null,
  documento_hash text not null,
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now(),
  unique (campana_id, documento_hash)
);
alter table public.tercero enable row level security;
create policy ver on public.tercero for select to authenticated
  using (privado.es_direccion(campana_id) or privado.rol(campana_id) = 'candidato');

-- El movimiento deja de apuntar a una persona de la base de simpatizantes: los aportantes son terceros.
drop trigger misma_campana on public.finanza_movimiento;
alter table public.finanza_movimiento
  drop column aportante_id,
  alter column rubro drop not null,
  add column codigo integer not null default 211 check (codigo in (101, 102, 103, 104, 105, 107, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211)),
  add column concepto text not null default '',
  add column forma text not null default 'dinero' check (forma in ('dinero', 'especie')),
  add column tercero_id uuid references public.tercero (id),
  add column parentesco text,
  add column acta_aprobacion text,
  add column verificacion_fuentes jsonb,
  add constraint codigo_segun_tipo check ((tipo = 'ingreso') = (codigo < 200));
alter table public.finanza_movimiento alter column codigo drop default;
create trigger misma_campana before insert or update on public.finanza_movimiento
  for each row execute function privado.exigir_misma_campana('tercero_id', 'tercero', 'tope_id', 'finanza_tope');
create trigger auditar after insert or update or delete on public.finanza_movimiento
  for each row execute function privado.auditar_cambio();
-- Los movimientos se registran y se anulan con funciones: así siempre pasan por las reglas de abajo.
drop policy gestionar on public.finanza_movimiento;

-- Reglas de cada movimiento (también si alguien lo inserta directo con permisos de servidor).
create or replace function privado.validar_movimiento()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_tope numeric; v_tercero public.tercero; v_ya numeric; v_privados numeric;
begin
  select tope_gastos into v_tope from public.campana where id = new.campana_id;
  if new.codigo = 101 and length(trim(coalesce(new.parentesco, ''))) = 0 then
    raise exception 'Indique de quién son los recursos propios: la candidata o el parentesco del familiar.' using errcode = '22023';
  end if;
  if new.codigo = 102 then
    if v_tope is null then
      raise exception 'Antes de registrar aportes de particulares, configure el tope de gastos que fijó el CNE.' using errcode = '22023';
    end if;
    if new.tercero_id is null then
      raise exception 'Un aporte no puede ser anónimo (Ley 1475, art. 27): registre quién lo da.' using errcode = '22023';
    end if;
    select * into v_tercero from public.tercero where id = new.tercero_id;
    if v_tercero.tipo_persona = 'juridica' and length(trim(coalesce(new.acta_aprobacion, ''))) = 0 then
      raise exception 'Una persona jurídica necesita el número del acta que aprobó el aporte.' using errcode = '22023';
    end if;
    if not coalesce((select bool_and(coalesce((new.verificacion_fuentes ->> k)::boolean, false))
        from unnest(array['extranjero', 'ilicito', 'anonimo', 'procesado', 'funcionario', 'contratista']) k), false) then
      raise exception 'Confirme todas las verificaciones de fuentes prohibidas (Ley 1475, art. 27).' using errcode = '22023';
    end if;
    select coalesce(sum(valor), 0) into v_ya from public.finanza_movimiento
    where campana_id = new.campana_id and codigo = 102 and tercero_id = new.tercero_id and id <> new.id;
    if v_ya + new.valor > v_tope * 0.1 then
      raise exception 'Ese aportante pasaría el 10 %% del tope de gastos (Ley 1475, art. 23).' using errcode = '22023';
    end if;
  end if;
  if new.codigo in (101, 102, 103, 104, 107) and v_tope is not null then
    select coalesce(sum(valor), 0) into v_privados from public.finanza_movimiento
    where campana_id = new.campana_id and codigo in (101, 102, 103, 104, 107) and id <> new.id;
    if v_privados + new.valor > v_tope then
      raise exception 'Los ingresos de origen privado pasarían el tope de gastos (Ley 1475, art. 23).' using errcode = '22023';
    end if;
  end if;
  new.rubro := new.codigo::text;
  return new;
end;
$$;
create trigger validar before insert or update on public.finanza_movimiento
  for each row execute function privado.validar_movimiento();

-- Funciones de la dirección -------------------------------------------------------------------------------------

create or replace function public.configurar_tope_gastos(p_campana uuid, p_tope numeric)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección configura el tope de gastos.' using errcode = '42501';
  end if;
  update public.campana set tope_gastos = p_tope where id = p_campana;
  perform privado.auditar(p_campana, 'configurar_tope_gastos', 'campana', p_campana, jsonb_build_object('tope', p_tope));
end;
$$;

-- Busca o crea el tercero por su documento (sin duplicarlo) y devuelve su id.
create or replace function public.registrar_tercero(p_campana uuid, p_tipo text, p_nombre text, p_documento text)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_hash text := privado.hash_documento(p_documento); v_id uuid;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección registra aportantes y proveedores.' using errcode = '42501';
  end if;
  if v_hash is null then
    raise exception 'Escriba el documento o NIT: no se registran terceros anónimos.' using errcode = '22023';
  end if;
  select id into v_id from public.tercero where campana_id = p_campana and documento_hash = v_hash;
  if v_id is null then
    insert into public.tercero (campana_id, tipo_persona, nombre, documento_cifrado, documento_hash, creado_por)
    values (p_campana, p_tipo, trim(p_nombre), privado.cifrar_documento(p_documento), v_hash, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.registrar_movimiento(
  p_campana uuid, p_codigo integer, p_fecha date, p_valor numeric, p_concepto text, p_forma text,
  p_tercero uuid, p_parentesco text, p_acta text, p_verificacion jsonb, p_soporte text
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección registra movimientos.' using errcode = '42501';
  end if;
  if p_soporte is not null and privado.campana_de_ruta(p_soporte) is distinct from p_campana then
    raise exception 'El soporte no es de esta campaña.' using errcode = '42501';
  end if;
  insert into public.finanza_movimiento (campana_id, tipo, codigo, fecha, valor, concepto, forma, tercero_id, parentesco,
    acta_aprobacion, verificacion_fuentes, soporte_url, creado_por)
  values (p_campana, case when p_codigo < 200 then 'ingreso' else 'gasto' end, p_codigo, p_fecha, p_valor, trim(coalesce(p_concepto, '')),
    coalesce(p_forma, 'dinero'), p_tercero, nullif(trim(p_parentesco), ''), nullif(trim(p_acta), ''), p_verificacion, p_soporte, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Anular deja rastro en la auditoría (el disparador guarda la fila borrada).
create or replace function public.anular_movimiento(p_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_campana uuid;
begin
  select campana_id into v_campana from public.finanza_movimiento where id = p_id;
  if v_campana is null or not coalesce(privado.es_direccion(v_campana), false) then
    raise exception 'El movimiento no existe o no lo puede anular.' using errcode = '42501';
  end if;
  delete from public.finanza_movimiento where id = p_id;
end;
$$;

-- Libro para el contador, con los documentos descifrados. Queda en la auditoría con su referencia.
create or replace function public.exportar_libro_finanzas(p_campana uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_ref text := upper(substr(md5(random()::text), 1, 8)); v_usuario text; v_filas jsonb;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección exporta el libro de finanzas.' using errcode = '42501';
  end if;
  select nombre into v_usuario from public.usuario where id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
    'fecha', m.fecha, 'tipo', m.tipo, 'codigo', m.codigo, 'concepto', m.concepto, 'forma', m.forma, 'valor', m.valor,
    'tercero', t.nombre, 'tipo_persona', t.tipo_persona,
    'documento', case when t.id is not null then extensions.pgp_sym_decrypt(t.documento_cifrado, privado.secreto('clave_documento')) end,
    'parentesco', m.parentesco, 'acta', m.acta_aprobacion, 'soporte', m.soporte_url is not null) order by m.fecha, m.codigo), '[]'::jsonb)
  into v_filas
  from public.finanza_movimiento m left join public.tercero t on t.id = m.tercero_id
  where m.campana_id = p_campana;
  perform privado.auditar(p_campana, 'exportar_libro_finanzas', 'finanza_movimiento', null,
    jsonb_build_object('referencia', v_ref, 'cantidad', jsonb_array_length(v_filas)));
  return jsonb_build_object('referencia', v_ref, 'exportado_por', v_usuario, 'exportado_en', now(), 'filas', v_filas);
end;
$$;

revoke all on function privado.validar_movimiento() from public, anon, authenticated;
revoke all on function public.configurar_tope_gastos(uuid, numeric), public.registrar_tercero(uuid, text, text, text),
  public.registrar_movimiento(uuid, integer, date, numeric, text, text, uuid, text, text, jsonb, text),
  public.anular_movimiento(uuid), public.exportar_libro_finanzas(uuid) from public, anon;
grant execute on function public.configurar_tope_gastos(uuid, numeric), public.registrar_tercero(uuid, text, text, text),
  public.registrar_movimiento(uuid, integer, date, numeric, text, text, uuid, text, text, jsonb, text),
  public.anular_movimiento(uuid), public.exportar_libro_finanzas(uuid) to authenticated;

-- Soportes (facturas, recibos, actas) en un bucket privado: <campaña>/<archivo>. Solo la dirección sube; la candidata ve.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sin Storage en esta base: se omite el bucket de soportes.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('soportes', 'soportes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists soportes_ver on storage.objects;
  drop policy if exists soportes_subir on storage.objects;
  create policy soportes_ver on storage.objects for select to authenticated
    using (bucket_id = 'soportes' and coalesce(privado.es_direccion(privado.campana_de_ruta(name))
      or privado.rol(privado.campana_de_ruta(name)) = 'candidato', false));
  create policy soportes_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'soportes' and coalesce(privado.es_direccion(privado.campana_de_ruta(name)), false));
end $$;

-- Fusión de duplicados: ya no hay aportantes en la tabla de personas (ahora son terceros). Además, la fusión traslada
-- los envíos, las colas de llamadas y la baja de la persona eliminada (sin esto, una baja se perdía al fusionar).
create or replace function public.fusionar_personas(p_conservar uuid, p_eliminar uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.persona;
  e public.persona;
begin
  select * into c from public.persona where id = p_conservar;
  select * into e from public.persona where id = p_eliminar;
  if c.id is null or e.id is null or c.id = e.id or c.campana_id <> e.campana_id
     or not privado.es_direccion(c.campana_id) then
    raise exception 'No puede fusionar estas personas: deben ser distintas, de la misma campaña, y usted debe ser de su dirección.'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indique el motivo de la fusión.' using errcode = '23514';
  end if;

  update public.persona set
    documento_cifrado = coalesce(c.documento_cifrado, e.documento_cifrado),
    documento_hash = coalesce(c.documento_hash, e.documento_hash),
    telefono = coalesce(c.telefono, e.telefono),
    territorio_trabajo_id = coalesce(c.territorio_trabajo_id, e.territorio_trabajo_id),
    puesto_id = coalesce(c.puesto_id, e.puesto_id),
    mesa = coalesce(c.mesa, e.mesa),
    necesidades = array(select distinct unnest(c.necesidades || e.necesidades))
  where id = c.id;

  insert into public.autorizacion (persona_id, campana_id, finalidades, sensible, canal, evidencia_url, fecha, revocada_en, registrado_por)
  select c.id, campana_id, finalidades, sensible, canal, evidencia_url, fecha, revocada_en, auth.uid()
  from public.autorizacion where persona_id = e.id;

  update public.respuesta set persona_id = c.id where persona_id = e.id;
  update public.llamada set persona_id = c.id where persona_id = e.id;
  update public.mensaje set persona_id = c.id where persona_id = e.id;
  update public.solicitud_ciudadana set persona_id = c.id where persona_id = e.id;
  update public.solicitud_titular set persona_id = c.id where persona_id = e.id;
  -- La correspondencia y las colas de llamadas: si alguna se repite, queda la de la persona que se conserva.
  update public.envio_destinatario d set persona_id = c.id where d.persona_id = e.id
    and not exists (select 1 from public.envio_destinatario x where x.envio_id = d.envio_id and x.persona_id = c.id);
  update public.cola_item i set persona_id = c.id where i.persona_id = e.id
    and not exists (select 1 from public.cola_item x where x.cola_id = i.cola_id and x.persona_id = c.id);
  -- Si cualquiera de las dos se dio de baja, la persona que queda sigue dada de baja (no se pierde por fusionar).
  insert into public.baja_contacto (persona_id, campana_id, en, origen)
  select c.id, b.campana_id, b.en, b.origen from public.baja_contacto b where b.persona_id = e.id
  on conflict (persona_id) do nothing;
  update public.testigo set persona_id = c.id where persona_id = e.id;
  -- La preferencia política de la persona eliminada no se traslada: depende de su propia autorización sensible.

  perform privado.auditar(c.campana_id, 'fusionar', 'persona', c.id,
    jsonb_build_object('eliminada', e.id, 'motivo', p_motivo));
  delete from public.persona where id = e.id;
end;
$$;
