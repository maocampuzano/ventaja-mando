-- Semilla de desarrollo y demos. TODOS LOS DATOS SON FICTICIOS.
-- Campaña inventada a la Alcaldía de Turbaco (Bolívar) y una segunda campaña del mismo partido,
-- para probar que un candidato no ve la base del otro.
-- Las cédulas empiezan por 000 (no son números válidos) y los celulares siguen el patrón 300 000 XXXX del prototipo.
-- Los usuarios de auth.users son solo para la base local; en un proyecto real se crean por invitación.

begin;

-- Identificadores fijos, fáciles de reconocer en las pruebas.
create temporary table ids (clave text primary key, id uuid not null) on commit drop;
insert into ids values
  ('partido',        '10000000-0000-4000-8000-000000000001'),
  ('campana_a',      '20000000-0000-4000-8000-00000000000a'),
  ('campana_b',      '20000000-0000-4000-8000-00000000000b'),
  ('bolivar',        '30000000-0000-4000-8000-000000000013'),
  ('turbaco',        '30000000-0000-4000-8000-000000013836'),
  ('u_admin_a',      '40000000-0000-4000-8000-000000000001'),
  ('u_gerente_a',    '40000000-0000-4000-8000-000000000002'),
  ('u_candidata_a',  '40000000-0000-4000-8000-000000000003'),
  ('u_coord_a',      '40000000-0000-4000-8000-000000000004'),
  ('u_lider_a1',     '40000000-0000-4000-8000-000000000005'),
  ('u_lider_a2',     '40000000-0000-4000-8000-000000000006'),
  ('u_testigo_a',    '40000000-0000-4000-8000-000000000007'),
  ('u_gerente_b',    '40000000-0000-4000-8000-000000000008'),
  ('u_lider_b1',     '40000000-0000-4000-8000-000000000009'),
  ('u_sin_campana',  '40000000-0000-4000-8000-000000000010');

create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids where clave = p $$;

-- Organización y campañas
insert into public.organizacion (id, tipo, nombre) values (pg_temp.id('partido'), 'partido', 'Partido Demo');
insert into public.campana (id, organizacion_id, nombre, cargo, circunscripcion_divipole, eleccion_fecha, meta_votos) values
  (pg_temp.id('campana_a'), pg_temp.id('partido'), 'Laura Méndez', 'Alcaldía de Turbaco', '13836', '2027-10-31', 18500),
  (pg_temp.id('campana_b'), pg_temp.id('partido'), 'Carlos Ruiz', 'Concejo de Turbaco', '13836', '2027-10-31', 2200);

-- Territorio oficial de referencia (códigos DANE) y zonas propias de cada campaña
insert into public.territorio (id, codigo_divipole, nivel, nombre, padre_id, fuente, fecha_fuente) values
  (pg_temp.id('bolivar'), '13', 'departamento', 'Bolívar', null, 'Semilla ficticia (código DANE de referencia)', '2026-10-23'),
  (pg_temp.id('turbaco'), '13836', 'municipio', 'Turbaco', pg_temp.id('bolivar'), 'Semilla ficticia (código DANE de referencia)', '2026-10-23');

-- 19 zonas hexagonales ilustrativas, como en el prototipo (no son barrios ni límites oficiales).
create temporary table zona_semilla on commit drop as
with axiales as (
  select q, s, row_number() over (order by q, s) as n
  from generate_series(-2, 2) q, generate_series(-2, 2) s
  where abs(q + s) <= 2
),
nombres as (
  select n, nombre from unnest(array[
    'Centro', 'Los Almendros', 'La Ceiba', 'Villa Rosa', 'El Mirador', 'Nueva Esperanza',
    'Las Palmas', 'Altos del Cerro', 'La Granja', 'Bellavista', 'San Pedro', 'El Bosque',
    'Los Robles', 'Campo Alegre', 'Villa del Sol', 'El Recreo', 'La Floresta', 'Buenos Aires', 'Las Colinas'
  ]) with ordinality as x(nombre, n)
)
select a.n, nm.nombre,
  ('50000000-0000-4000-8000-' || lpad(a.n::text, 12, '0'))::uuid as id,
  -75.4115 + 0.0052 * sqrt(3) * (a.q + a.s / 2.0) as cx,
  10.3345 + 0.0052 * 1.5 * a.s as cy
from axiales a join nombres nm using (n);

insert into public.territorio (id, campana_id, nivel, nombre, padre_id, geom, fuente, fecha_fuente)
select z.id, pg_temp.id('campana_a'), 'zona', z.nombre, pg_temp.id('turbaco'),
  extensions.st_setsrid(extensions.st_multi(extensions.st_makepolygon(extensions.st_addpoint(
    extensions.st_makeline(array(
      select extensions.st_makepoint(z.cx + 0.0052 * 0.98 * cos(pi() / 3 * i + pi() / 6),
                                     z.cy + 0.0052 * 0.98 * sin(pi() / 3 * i + pi() / 6))
      from generate_series(0, 5) i order by i
    )),
    extensions.st_makepoint(z.cx + 0.0052 * 0.98 * cos(pi() / 6), z.cy + 0.0052 * 0.98 * sin(pi() / 6))
  ))), 4326),
  'Zona ilustrativa de la semilla', '2026-10-23'
from zona_semilla z;

insert into public.territorio (id, campana_id, nivel, nombre, padre_id, fuente) values
  ('50000000-0000-4000-8000-0000000000b1', pg_temp.id('campana_b'), 'zona', 'Zona Norte (campaña B)', pg_temp.id('turbaco'), 'Semilla'),
  ('50000000-0000-4000-8000-0000000000b2', pg_temp.id('campana_b'), 'zona', 'Zona Sur (campaña B)', pg_temp.id('turbaco'), 'Semilla');

-- Puestos de votación ficticios, dentro de las zonas 2, 4, 6, ...
insert into public.puesto (id, codigo, nombre, territorio_id, geom, mesas, fuente, fecha_fuente)
select ('60000000-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid, 'DEMO-' || lpad(p.n::text, 3, '0'), p.nombre,
  pg_temp.id('turbaco'),
  extensions.st_setsrid(extensions.st_makepoint(z.cx, z.cy), 4326), 6 + (p.n * 5) % 13,
  'Semilla ficticia', '2026-10-23'
from unnest(array['I.E. Ficticia Central', 'Colegio Demo San José', 'Escuela Demo La Ceiba', 'I.E. Demo El Mirador',
  'Coliseo Demo', 'Escuela Demo Las Palmas', 'I.E. Demo Bellavista', 'Colegio Demo Los Robles']) with ordinality p(nombre, n)
join zona_semilla z on z.n = (p.n * 2) % 19 + 1;

-- Usuarios del equipo (solo base local)
insert into auth.users (id, email)
select id, replace(clave, 'u_', '') || '@ejemplo.co' from ids where clave like 'u\_%';

insert into public.usuario (id, nombre, mfa_activo) values
  (pg_temp.id('u_admin_a'), 'Admin Demo A', true),
  (pg_temp.id('u_gerente_a'), 'Gerente Demo A', true),
  (pg_temp.id('u_candidata_a'), 'Laura Méndez', false),
  (pg_temp.id('u_coord_a'), 'Coordinadora Demo', false),
  (pg_temp.id('u_lider_a1'), 'Yesenia Barrios', false),
  (pg_temp.id('u_lider_a2'), 'Rafael Pérez', false),
  (pg_temp.id('u_testigo_a'), 'Testigo Demo', false),
  (pg_temp.id('u_gerente_b'), 'Gerente Demo B', true),
  (pg_temp.id('u_lider_b1'), 'Líder Demo B', false),
  (pg_temp.id('u_sin_campana'), 'Usuario sin campaña', false);

-- La coordinadora tiene las zonas 1 a 3; cada líder trabaja en una zona.
insert into public.membresia (usuario_id, campana_id, rol, territorio_ids) values
  (pg_temp.id('u_admin_a'), pg_temp.id('campana_a'), 'administrador', '{}'),
  (pg_temp.id('u_gerente_a'), pg_temp.id('campana_a'), 'gerente', '{}'),
  (pg_temp.id('u_candidata_a'), pg_temp.id('campana_a'), 'candidato', '{}'),
  (pg_temp.id('u_coord_a'), pg_temp.id('campana_a'), 'coordinador',
    array['50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003']::uuid[]),
  (pg_temp.id('u_lider_a1'), pg_temp.id('campana_a'), 'lider', array['50000000-0000-4000-8000-000000000001']::uuid[]),
  (pg_temp.id('u_lider_a2'), pg_temp.id('campana_a'), 'lider', array['50000000-0000-4000-8000-000000000010']::uuid[]),
  (pg_temp.id('u_testigo_a'), pg_temp.id('campana_a'), 'testigo', '{}'),
  (pg_temp.id('u_gerente_b'), pg_temp.id('campana_b'), 'gerente', '{}'),
  (pg_temp.id('u_lider_b1'), pg_temp.id('campana_b'), 'lider', array['50000000-0000-4000-8000-0000000000b1']::uuid[]);

-- 22 líderes de la campaña A (nombres del prototipo); el 1 y el 10 tienen usuario. Un líder en la campaña B.
insert into public.lider (id, campana_id, usuario_id, nombre, territorio_ids, meta)
select ('70000000-0000-4000-8000-' || lpad(l.n::text, 12, '0'))::uuid, pg_temp.id('campana_a'),
  case l.n when 1 then pg_temp.id('u_lider_a1') when 10 then pg_temp.id('u_lider_a2') end,
  l.nombre, array[('50000000-0000-4000-8000-' || lpad(((l.n - 1) % 19 + 1)::text, 12, '0'))::uuid], 150 + (l.n * 37) % 250
from unnest(array[
  'Yesenia Barrios', 'Rafael Pérez', 'Luz Marina Julio', 'Edwin Cassiani', 'Kelly Herrera', 'Jhon Fredy Tapia',
  'Marelvis Cárdenas', 'Álvaro Puello', 'Diana Mercado', 'Hernando Orozco', 'Sandra Batista', 'Luis Carlos Arrieta',
  'Nayibe Castro', 'Wilmer Salgado', 'Ana Isabel Ortega', 'Ronald Guerrero', 'Mónica Padilla', 'Fabián Ospino',
  'Zuleima Pacheco', 'Germán Rodelo', 'Yuranis Simancas', 'Óscar Villadiego']) with ordinality l(nombre, n);
-- El líder con usuario «lider_a2» es el número 10 (zona 10); se corrige su nombre para que coincida con su usuario.
update public.lider set nombre = 'Rafael Pérez' where id = '70000000-0000-4000-8000-000000000010';
update public.lider set nombre = 'Hernando Orozco' where id = '70000000-0000-4000-8000-000000000002';
insert into public.lider (id, campana_id, usuario_id, nombre, territorio_ids, meta) values
  ('70000000-0000-4000-8000-0000000000b1', pg_temp.id('campana_b'), pg_temp.id('u_lider_b1'), 'Líder Demo B',
   array['50000000-0000-4000-8000-0000000000b1']::uuid[], 120);

-- Personas: 8 por líder en la campaña A, cada una con su autorización (regla 3).
create temporary table persona_semilla on commit drop as
with nombres as (select array['María José', 'José Luis', 'Luz Dary', 'Carlos', 'Ana', 'Edilberto', 'Yulieth', 'Andrés',
                              'Leidy', 'Jorge', 'Katerine', 'Wilson', 'Dayana', 'Fredy', 'Marta', 'Iván'] as n),
     apellidos as (select array['Peña', 'Ortiz', 'Gómez', 'Díaz', 'Ruiz', 'Cabarcas', 'Julio', 'Herrera', 'Tapia',
                                'Puello', 'Mercado', 'Castro', 'Salgado', 'Padilla', 'Ospino', 'Rodelo', 'Simancas'] as a)
select ('80000000-0000-4000-8000-' || lpad((l.n * 100 + k)::text, 12, '0'))::uuid as id,
  ('70000000-0000-4000-8000-' || lpad(l.n::text, 12, '0'))::uuid as lider_id,
  ('50000000-0000-4000-8000-' || lpad(((l.n - 1) % 19 + 1)::text, 12, '0'))::uuid as territorio_id,
  (select n[1 + (l.n * 7 + k * 3) % 16] from nombres) || ' ' || (select a[1 + (l.n * 5 + k * 11) % 17] from apellidos)
    || ' ' || (select a[1 + (l.n + k * 13) % 17] from apellidos) as nombre,
  '000' || lpad((l.n * 1000 + k)::text, 7, '0') as documento,
  '+57 300 000 ' || lpad((l.n * 10 + k)::text, 4, '0') as telefono,
  (array['sin_contactar', 'contactado', 'validado', 'validado', 'comprometido'])[1 + (l.n + k) % 5] as estado
from generate_series(1, 22) l(n), generate_series(1, 8) k;

insert into public.persona (id, campana_id, documento_cifrado, documento_hash, nombre, telefono, territorio_trabajo_id,
  origen, lider_id, estado_contacto, creado_por)
select id, pg_temp.id('campana_a'), privado.cifrar_documento(documento), privado.hash_documento(documento), nombre, telefono,
  territorio_id, 'formulario', lider_id, estado, pg_temp.id('u_gerente_a')
from persona_semilla;

-- Duplicados sembrados a propósito (para la revisión de duplicados):
--  · la misma cédula que una persona del líder 1, cargada por el líder 5 con otro nombre;
--  · la misma persona del líder 1 escrita distinto, sin cédula y con el mismo celular.
insert into public.persona (id, campana_id, documento_cifrado, documento_hash, nombre, telefono, territorio_trabajo_id,
  origen, lider_id, creado_por) values
  ('80000000-0000-4000-8000-000000009001', pg_temp.id('campana_a'), privado.cifrar_documento('0000001001'),
   privado.hash_documento('0000001001'), 'Carlos Díaz M.', '+57 300 000 9001', '50000000-0000-4000-8000-000000000005',
   'importacion', '70000000-0000-4000-8000-000000000005', pg_temp.id('u_gerente_a')),
  ('80000000-0000-4000-8000-000000009002', pg_temp.id('campana_a'), null, null,
   (select upper(nombre) from persona_semilla where documento = '0000001002'), (select telefono from persona_semilla where documento = '0000001002'),
   '50000000-0000-4000-8000-000000000001', 'formulario', '70000000-0000-4000-8000-000000000001', pg_temp.id('u_gerente_a'));

-- Campaña B: 5 personas; una tiene la misma cédula que una de la campaña A (no debe cruzarse).
insert into public.persona (id, campana_id, documento_cifrado, documento_hash, nombre, telefono, territorio_trabajo_id,
  origen, lider_id, creado_por)
select ('80000000-0000-4000-8000-0000000b000' || k)::uuid, pg_temp.id('campana_b'),
  privado.cifrar_documento(case k when 1 then '0000001001' else '0009000' || k end),
  privado.hash_documento(case k when 1 then '0000001001' else '0009000' || k end),
  'Persona Demo B ' || k, '+57 300 000 8' || lpad(k::text, 3, '0'), '50000000-0000-4000-8000-0000000000b1',
  'formulario', '70000000-0000-4000-8000-0000000000b1', pg_temp.id('u_gerente_b')
from generate_series(1, 5) k;

insert into public.autorizacion (persona_id, campana_id, finalidades, canal, evidencia_url, fecha, registrado_por)
select p.id, p.campana_id, array['contacto_campana', 'actividades_territorio'], 'formulario',
  'semilla://autorizacion/' || p.id, '2026-09-01 10:00-05', p.creado_por
from public.persona p;

-- Día E: testigos, novedades y un E-14 recibido
insert into public.testigo (campana_id, usuario_id, puesto_id, mesa, tipo, estado)
select pg_temp.id('campana_a'), case when p.codigo = 'DEMO-001' and m = 3 then pg_temp.id('u_testigo_a') end,
  p.id, m, 'mesa', 'confirmado'
from public.puesto p, generate_series(1, 4) m;

insert into public.incidencia (campana_id, puesto_id, mesa, tipo, prioridad, reportado_por, hora) values
  (pg_temp.id('campana_a'), '60000000-0000-4000-8000-000000000001', 3, 'Fila larga, votantes se están yendo', 'media',
   pg_temp.id('u_testigo_a'), '2027-10-31 09:40-05'),
  (pg_temp.id('campana_a'), '60000000-0000-4000-8000-000000000003', 2, 'Testigo no admitido por el jurado', 'alta',
   pg_temp.id('u_gerente_a'), '2027-10-31 08:12-05');

insert into public.acta_e14 (campana_id, puesto_id, mesa, foto_url, estado, creado_por) values
  (pg_temp.id('campana_a'), '60000000-0000-4000-8000-000000000001', 3, 'semilla://e14/demo-001-3.jpg', 'recibida', pg_temp.id('u_testigo_a')),
  (pg_temp.id('campana_a'), '60000000-0000-4000-8000-000000000003', 2, 'semilla://e14/demo-003-2.jpg', 'recibida', pg_temp.id('u_gerente_a'));

-- Datos agregados: pauta por zona e histórico por puesto
insert into public.pauta_metrica (campana_id, plataforma, fecha, territorio_id, alcance, clics, gasto)
select pg_temp.id('campana_a'), 'meta', '2026-10-20', z.id, 2000 + z.n * 731 % 9000, 80 + z.n * 37 % 400, 150000 + z.n * 41000 % 900000
from zona_semilla z;

insert into public.historico_resultado (eleccion, puesto_id, candidato_o_partido, votos)
select 'Alcaldía 2023 (ficticio)', p.id, 'Partido Demo', 300 + (row_number() over (order by p.codigo))::int * 97 % 900
from public.puesto p;

-- Operación
insert into public.formulario (campana_id, nombre, esquema_json) values
  (pg_temp.id('campana_a'), 'Registro de simpatizante', '{"campos": ["nombre", "celular", "zona", "necesidades"]}');
insert into public.tarea (campana_id, tipo, titulo, territorio_id, asignado_a, creado_por) values
  (pg_temp.id('campana_a'), 'brigada', 'Brigada de fin de semana en La Ceiba', '50000000-0000-4000-8000-000000000003',
   pg_temp.id('u_coord_a'), pg_temp.id('u_gerente_a'));
-- Tareas de hoy de la líder 1 (las ve en la app del celular).
insert into public.tarea (id, campana_id, tipo, titulo, territorio_id, asignado_a, creado_por, vence_en) values
  ('91000000-0000-4000-8000-000000000001', pg_temp.id('campana_a'), 'visita', 'Visitar a 8 simpatizantes sin validar',
   '50000000-0000-4000-8000-000000000001', pg_temp.id('u_lider_a1'), pg_temp.id('u_coord_a'), '2026-10-24 18:00-05'),
  ('91000000-0000-4000-8000-000000000002', pg_temp.id('campana_a'), 'convocatoria', 'Invitar a la reunión del jueves',
   '50000000-0000-4000-8000-000000000001', pg_temp.id('u_lider_a1'), pg_temp.id('u_coord_a'), null),
  ('91000000-0000-4000-8000-000000000003', pg_temp.id('campana_a'), 'planilla', 'Escanear la planilla del sábado',
   '50000000-0000-4000-8000-000000000001', pg_temp.id('u_lider_a1'), pg_temp.id('u_coord_a'), null);
insert into public.solicitud_ciudadana (campana_id, tema, descripcion, creado_por) values
  (pg_temp.id('campana_a'), 'Alumbrado público', 'Varias cuadras sin luz en El Mirador.', pg_temp.id('u_coord_a'));
insert into public.finanza_tope (id, campana_id, rubro, valor) values
  ('90000000-0000-4000-8000-000000000001', pg_temp.id('campana_a'), 'Propaganda electoral', 120000000);
insert into public.finanza_movimiento (campana_id, tipo, rubro, valor, tope_id, fecha, creado_por) values
  (pg_temp.id('campana_a'), 'gasto', 'Propaganda electoral', 4500000, '90000000-0000-4000-8000-000000000001', '2026-10-15', pg_temp.id('u_gerente_a'));

commit;
