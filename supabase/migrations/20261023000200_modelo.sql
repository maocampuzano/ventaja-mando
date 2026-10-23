-- Modelo de datos (docs/02-diseno-producto.md, sección 6).
-- Las reglas que no se negocian de CLAUDE.md que se pueden garantizar en la base se garantizan aquí,
-- con restricciones y disparadores, y no solo en la interfaz.

-- Organización, campaña y personas del equipo ------------------------------------------------

create table public.organizacion (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('partido', 'campana')),
  nombre text not null,
  marca_json jsonb not null default '{}',
  creado_en timestamptz not null default now()
);

create table public.campana (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  nombre text not null,
  cargo text not null,
  circunscripcion_divipole text,
  eleccion_fecha date,
  meta_votos integer check (meta_votos >= 0),
  -- Regla 2: la clasificación política individual es opcional por campaña y está apagada por defecto.
  permite_preferencia_politica boolean not null default false,
  creado_en timestamptz not null default now()
);

-- El id es el mismo de auth.users (Supabase Auth).
create table public.usuario (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  telefono text,
  mfa_activo boolean not null default false,
  creado_en timestamptz not null default now()
);

create table public.membresia (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuario (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  rol text not null check (rol in ('administrador', 'gerente', 'candidato', 'coordinador', 'lider', 'testigo')),
  territorio_ids uuid[] not null default '{}',
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (usuario_id, campana_id)
);
create index on public.membresia (usuario_id) where activa;

create table public.invitacion (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  correo text not null,
  rol text not null check (rol in ('administrador', 'gerente', 'candidato', 'coordinador', 'lider', 'testigo')),
  territorio_ids uuid[] not null default '{}',
  token_hash text not null unique,
  expira_en timestamptz not null,
  aceptada_en timestamptz,
  aceptada_por uuid references public.usuario (id),
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now()
);

-- Territorio ----------------------------------------------------------------------------------

-- campana_id nulo = territorio oficial (DIVIPOLE), visible para todos. Con campaña = zona propia de esa campaña.
create table public.territorio (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid references public.campana (id) on delete cascade,
  codigo_divipole text,
  nivel text not null check (nivel in ('departamento', 'municipio', 'comuna', 'corregimiento', 'barrio', 'vereda', 'zona')),
  nombre text not null,
  padre_id uuid references public.territorio (id),
  geom extensions.geometry(MultiPolygon, 4326),
  fuente text,
  fecha_fuente date
);
-- Un código oficial aparece una sola vez (para cargar DIVIPOLE sin duplicar).
create unique index territorio_oficial_codigo on public.territorio (codigo_divipole) where campana_id is null;
create index on public.territorio (padre_id);
create index on public.territorio (campana_id);
create index on public.territorio using gist (geom);

create table public.capa_gis (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  nombre text not null,
  geom extensions.geometry(Geometry, 4326) not null,
  fuente text not null,
  licencia text,
  fecha date
);

create table public.puesto (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre text not null,
  territorio_id uuid references public.territorio (id),
  geom extensions.geometry(Point, 4326),
  mesas integer not null default 0 check (mesas >= 0),
  fuente text,
  fecha_fuente date,
  unique (codigo)
);
create index on public.puesto (territorio_id);

-- Líderes y personas --------------------------------------------------------------------------

create table public.lider (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  usuario_id uuid references public.usuario (id),
  nombre text not null,
  territorio_ids uuid[] not null default '{}',
  meta integer not null default 0 check (meta >= 0),
  creado_en timestamptz not null default now(),
  unique (campana_id, usuario_id)
);

create table public.lote_ocr (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  lider_id uuid references public.lider (id),
  archivo_url text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'leido', 'en_revision', 'aprobado', 'descartado')),
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now()
);

create table public.fila_ocr (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lote_ocr (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  datos jsonb not null,
  confianza numeric(4, 3) check (confianza between 0 and 1),
  revisada_por uuid references public.usuario (id),
  revisada_en timestamptz,
  check ((revisada_por is null) = (revisada_en is null))
);

create table public.persona (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  -- La cédula nunca se guarda en claro: va cifrada y, para buscar duplicados, como HMAC.
  documento_cifrado bytea,
  documento_hash text,
  nombre text not null,
  telefono text,
  territorio_trabajo_id uuid references public.territorio (id),
  puesto_id uuid references public.puesto (id),
  mesa integer,
  origen text not null check (origen in ('formulario', 'ocr', 'importacion', 'enlace')),
  fila_ocr_id uuid references public.fila_ocr (id),
  lider_id uuid references public.lider (id),
  relacion text not null default 'simpatizante' check (relacion in ('simpatizante', 'voluntario', 'lider', 'testigo')),
  estado_contacto text not null default 'sin_contactar'
    check (estado_contacto in ('sin_contactar', 'contactado', 'validado', 'comprometido', 'no_interesado')),
  necesidades text[] not null default '{}',
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now(),
  geom extensions.geometry(Point, 4326),
  check ((documento_cifrado is null) = (documento_hash is null)),
  -- Regla 7: lo que viene de OCR debe venir de una fila de planilla (que además debe estar revisada, ver disparador).
  check (origen <> 'ocr' or fila_ocr_id is not null)
);
create index on public.persona (campana_id, documento_hash);
create index on public.persona (campana_id, telefono);
create index on public.persona (lider_id);
create index on public.persona (territorio_trabajo_id);

create table public.autorizacion (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.persona (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  finalidades text[] not null check (cardinality(finalidades) > 0),
  sensible boolean not null default false,
  canal text not null check (canal in ('formulario', 'ocr', 'importacion', 'enlace', 'presencial', 'telefono')),
  evidencia_url text not null check (length(trim(evidencia_url)) > 0),
  fecha timestamptz not null default now(),
  revocada_en timestamptz,
  registrado_por uuid references public.usuario (id)
);
create index on public.autorizacion (persona_id);

-- Regla 2: tabla aparte y opcional, ligada a una autorización sensible.
create table public.preferencia_politica (
  persona_id uuid primary key references public.persona (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  nivel text not null check (nivel in ('a_favor', 'indeciso', 'en_contra')),
  autorizacion_id uuid not null references public.autorizacion (id),
  registrado_en timestamptz not null default now()
);

create table public.solicitud_titular (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references public.persona (id) on delete set null,
  campana_id uuid not null references public.campana (id) on delete cascade,
  tipo text not null check (tipo in ('conocer', 'actualizar', 'suprimir', 'revocar')),
  estado text not null default 'recibida' check (estado in ('recibida', 'en_tramite', 'resuelta', 'rechazada')),
  detalle text,
  recibida_en timestamptz not null default now(),
  vence_en timestamptz not null,
  resuelta_en timestamptz
);

-- Operación -------------------------------------------------------------------------------------

create table public.formulario (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  nombre text not null,
  esquema_json jsonb not null,
  version integer not null default 1,
  creado_en timestamptz not null default now()
);

create table public.respuesta (
  id uuid primary key default gen_random_uuid(),
  formulario_id uuid not null references public.formulario (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  persona_id uuid references public.persona (id) on delete set null,
  datos jsonb not null,
  geom extensions.geometry(Point, 4326),
  capturado_por uuid references public.usuario (id),
  capturado_en timestamptz not null,
  sincronizado_en timestamptz not null default now()
);

create table public.tarea (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  territorio_id uuid references public.territorio (id),
  asignado_a uuid references public.usuario (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha', 'cancelada')),
  origen text not null default 'manual' check (origen in ('manual', 'ia')),
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now(),
  vence_en timestamptz
);

create table public.cola_llamadas (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  territorio_id uuid references public.territorio (id),
  nombre text not null,
  guion text
);

create table public.llamada (
  id uuid primary key default gen_random_uuid(),
  cola_id uuid not null references public.cola_llamadas (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  persona_id uuid references public.persona (id) on delete set null,
  resultado text not null,
  agente_id uuid references public.usuario (id),
  en timestamptz not null default now()
);

-- Regla 1: el canal «wa_manual» solo registra que el líder abrió el contacto; nunca guarda el contenido.
create table public.mensaje (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  canal text not null check (canal in ('sms', 'email', 'web', 'telegram', 'messenger', 'wa_manual')),
  persona_id uuid references public.persona (id) on delete set null,
  segmento jsonb,
  plantilla text,
  creado_por uuid references public.usuario (id),
  enviado_en timestamptz not null default now(),
  check (canal <> 'wa_manual' or (plantilla is null and segmento is null and persona_id is not null))
);

-- Regla 4: sin ningún campo de valor monetario y sin relación con la intención de voto.
create table public.solicitud_ciudadana (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  persona_id uuid references public.persona (id) on delete set null,
  tema text not null,
  descripcion text,
  estado text not null default 'abierta' check (estado in ('abierta', 'en_gestion', 'cerrada')),
  responsable uuid references public.usuario (id),
  seguimiento jsonb not null default '[]',
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now()
);

create table public.finanza_tope (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  rubro text not null,
  valor numeric(14, 0) not null check (valor >= 0)
);

create table public.finanza_movimiento (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  rubro text not null,
  valor numeric(14, 0) not null check (valor > 0),
  soporte_url text,
  aportante_id uuid references public.persona (id) on delete set null,
  tope_id uuid references public.finanza_tope (id),
  fecha date not null,
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now()
);

-- Día E -----------------------------------------------------------------------------------------

create table public.testigo (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  persona_id uuid references public.persona (id) on delete set null,
  usuario_id uuid references public.usuario (id),
  puesto_id uuid not null references public.puesto (id),
  mesa integer,
  tipo text not null check (tipo in ('mesa', 'escrutinio', 'abogado')),
  estado text not null default 'asignado' check (estado in ('asignado', 'confirmado', 'en_mesa', 'retirado'))
);
create index on public.testigo (usuario_id);

create table public.incidencia (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  puesto_id uuid not null references public.puesto (id),
  mesa integer,
  tipo text not null,
  descripcion text,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  evidencia_url text,
  reportado_por uuid references public.usuario (id),
  hora timestamptz not null default now(),
  estado text not null default 'abierta' check (estado in ('abierta', 'atendida', 'escalada', 'cerrada'))
);

-- Regla 7: un E-14 solo se consolida después de la revisión de una persona.
create table public.acta_e14 (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  puesto_id uuid not null references public.puesto (id),
  mesa integer not null,
  foto_url text not null,
  extraccion_json jsonb,
  revisada_por uuid references public.usuario (id),
  revisada_en timestamptz,
  estado text not null default 'recibida' check (estado in ('recibida', 'leida', 'revisada', 'consolidada', 'descartada')),
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now(),
  check (estado not in ('revisada', 'consolidada') or revisada_por is not null)
);

-- Datos agregados (sin personas) ------------------------------------------------------------------

create table public.pauta_metrica (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  plataforma text not null check (plataforma in ('meta', 'google')),
  fecha date not null,
  territorio_id uuid references public.territorio (id),
  alcance integer not null default 0,
  clics integer not null default 0,
  gasto numeric(14, 0) not null default 0
);

-- Datos abiertos de resultados anteriores.
create table public.historico_resultado (
  id uuid primary key default gen_random_uuid(),
  eleccion text not null,
  territorio_id uuid references public.territorio (id),
  puesto_id uuid references public.puesto (id),
  candidato_o_partido text not null,
  votos integer not null check (votos >= 0)
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  campana_id uuid references public.campana (id) on delete set null,
  usuario_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  en timestamptz not null default now(),
  detalle jsonb not null default '{}'
);
create index on public.auditoria (campana_id, en desc);
