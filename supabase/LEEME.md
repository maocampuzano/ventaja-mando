# Base de datos (Supabase)

## Qué hay aquí

| Ruta | Qué es |
|---|---|
| `migrations/` | El modelo de datos, la seguridad (RLS) y las funciones. Se aplican en orden, desde cero. |
| `seed.sql` | Semilla **ficticia** de Turbaco: dos campañas del mismo partido, 19 zonas, 8 puestos, 23 líderes, 183 personas con su autorización, testigos, novedades y E-14. |
| `tests/` | Pruebas en pgTAP: aislamiento por campaña, rol y territorio; reglas que no se negocian; duplicados y fusión; invitaciones. |
| `local/` | Solo para pruebas locales: imita lo mínimo de Supabase (roles y `auth.uid()`) y trae funciones para actuar como un usuario de la semilla. **No se aplica en Supabase.** |
| `scripts/probar.sh` | Crea una base desde cero, aplica todo y corre las pruebas (`npm run test:db`). |
| `scripts/cargar-territorios.mjs` | Convierte un CSV de datos abiertos (municipios o puestos) en SQL para cargarlo. |
| `scripts/preparar-datos-abiertos.mjs` | Descarga de datos.gov.co los municipios del DANE y los puestos de la Registraduría y los deja listos para `cargar-territorios.mjs`, con un informe. |
| `scripts/aplicar-remoto.mjs` | Aplica las migraciones, crea los secretos del Vault, carga territorios y verifica el proyecto real, por la API de administración de Supabase. Nunca carga `seed.sql`. |
| `datos/informe-datos-abiertos.md` | Lo que dio el último cruce de municipios y puestos: qué se cruzó sin nombre exacto y qué quedó sin ubicación. |

## Quién ve qué

La seguridad la hace la base de datos con RLS (regla 8 de `CLAUDE.md`), no la interfaz:

| Rol | Ve |
|---|---|
| Administrador y gerente | Toda su campaña, **solo si iniciaron sesión con dos factores**. Sin 2FA no ven nada. |
| Candidato | Configuración, finanzas y datos agregados. No ve personas una por una. |
| Coordinador | Las personas, tareas y puestos de sus territorios y de los que cuelgan de ellos. |
| Líder | Solo las personas que él registró o tiene a su cargo. |
| Testigo | Solo las novedades y el E-14 de su mesa. |
| Sin membresía o anónimo | Nada. |

Ninguna campaña ve datos de otra, aunque sean del mismo partido.

## Reglas que la base hace cumplir

- **Regla 3:** una persona no se puede guardar sin autorización. Se revisa al cerrar la transacción; por eso se usa `registrar_persona`, que crea las dos juntas. Las autorizaciones no se modifican: se revocan.
- **Regla 2:** la preferencia política solo se guarda si la campaña la activó (`permite_preferencia_politica`, apagada por defecto) y con una autorización sensible vigente. Si esa autorización se revoca, la preferencia se borra.
- **Regla 7:** una persona que viene de OCR exige una fila de planilla revisada por una persona. Un E-14 no se consolida sin revisión.
- **Regla 1:** del WhatsApp manual solo queda registro de que el líder abrió el contacto, nunca el texto. Un líder no puede hacer envíos masivos.
- **Regla 4:** la solicitud ciudadana no tiene campos de dinero ni de intención de voto (lo vigila una prueba).
- **Cédula:** se guarda cifrada (`pgp_sym_encrypt`) y, para buscar duplicados, como HMAC con un secreto aparte. Solo la dirección la ve completa, con `ver_documento`, y cada consulta queda en la auditoría.
- Nadie puede apuntar a datos de otra campaña, ni siquiera conociendo su identificador.
- La auditoría registra los cambios de membresías, autorizaciones y preferencias, los borrados de personas, las fusiones y las consultas de cédulas. Desde la API nadie la puede modificar.

## Funciones para la aplicación

`registrar_persona`, `revocar_autorizacion`, `autorizada_para`, `posibles_duplicados` (misma regla que `packages/nucleo`), `fusionar_personas`, `ver_documento`, `crear_invitacion` y `aceptar_invitacion`. Se llaman desde la app con `supabase.rpc(...)`.

Para el panel web (fase 2): `tablero_zonas` y `tablero_lideres` devuelven cifras **agregadas** por zona y por líder (registrados, validados, comprometidos, pauta de 14 días, componentes del índice del líder). Nunca devuelven personas, así que también las usa el candidato. Administración, gerencia (con 2FA) y candidato ven toda la campaña; el coordinador, sus territorios; líder, testigo y quien no sea miembro reciben un error de permiso. La meta de cada zona va en `territorio.meta_votos`.

## Correr las pruebas en local

Necesita PostgreSQL 16 con PostGIS y pgTAP, y `pg_prove`. En Ubuntu:

```bash
sudo apt-get install postgresql-16-postgis-3 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
sudo -u postgres psql -c "alter user postgres password 'postgres'"
npm run test:db
```

La integración continua lo hace sola en cada PR.

## Cargar municipios y puestos oficiales

Las fuentes son de www.datos.gov.co:

| Qué | Conjunto | Quién lo publica | Datos al |
|---|---|---|---|
| Departamentos y municipios | `gdxc-w37w`, «DIVIPOLA - Códigos municipios» | DANE | 24/01/2025 |
| Puestos de votación | `mv2e-prx5`, «Divipole Elecciones Territoriales 2023 con georreferenciación» | Registraduría | 11/10/2023 |

Es el único catálogo nacional de puestos con coordenadas que hay en datos.gov.co. Tiene tres vacíos que conviene conocer:
- **No trae el código DIVIPOLA del municipio**, solo su nombre. El script lo cruza con el DANE por nombre; si el nombre no coincide exacto (por ejemplo «CALI» frente a «SANTIAGO DE CALI»), por palabras, y si hay varios candidatos («SAN PEDRO» en Antioquia), por cercanía a la cabecera. Dos casos se resolvieron a mano (Mompós y Papunahua). Todo cruce que no fue exacto queda en el informe para revisarlo.
- **No trae el código del puesto.** Se genera uno estable (`RNEC23-<municipio>-<huella>`) a partir de departamento, municipio, comuna, nombre y dirección. Así, recargar el archivo actualiza en vez de duplicar.
- **No trae el número de mesas.** Queda en 0 (sin dato) hasta que la Registraduría publique la Divipole de 2027.

Además, 8 puestos traen coordenadas imposibles (fuera de Colombia). Se cargan sin ubicación; no se corrigen a ojo.

```bash
node supabase/scripts/preparar-datos-abiertos.mjs /tmp/datos       # descarga y deja municipios.csv, puestos.csv e informe.md
node supabase/scripts/cargar-territorios.mjs municipios /tmp/datos/municipios.csv --fuente "DANE, DIVIPOLA - Códigos municipios (datos.gov.co gdxc-w37w)" --fecha 2025-01-24 > /tmp/datos/municipios.sql
node supabase/scripts/cargar-territorios.mjs puestos /tmp/datos/puestos.csv --fuente "Registraduría, Divipole territoriales 2023 (datos.gov.co mv2e-prx5)" --fecha 2023-10-11 > /tmp/datos/puestos.sql
node supabase/scripts/aplicar-remoto.mjs cargar /tmp/datos/municipios.sql   # primero municipios: los puestos cuelgan de ellos
node supabase/scripts/aplicar-remoto.mjs cargar /tmp/datos/puestos.sql
```

En el entorno de nube, los scripts que usan la red se corren con `NODE_USE_ENV_PROXY=1` delante, porque Node no usa el proxy del entorno por su cuenta. En local, los `.sql` también se pueden aplicar con `psql -f`. Si un archivo oficial usa otros nombres de columna, `cargar-territorios.mjs` acepta `--columna cod_mpio="Código Municipio"` y, si falta alguna, muestra las que encontró.

## Pasar esto a su proyecto de Supabase (paso a paso)

Esto se hace una sola vez, cuando tenga el proyecto creado. Los nombres de los menús de Supabase pueden cambiar un poco con el tiempo. Si algo no coincide, avíseme qué ve en pantalla.

**Por qué hace falta un token personal.** El entorno de nube solo deja salir conexiones web (HTTPS). La cadena `SUPABASE_DB_URL` usa el puerto 5432 de Postgres, que el entorno no permite. Por eso las migraciones se aplican por la API de administración de Supabase (`api.supabase.com`), que es HTTPS y pide un token personal.

**1. Crear el proyecto**
1. Entre a https://supabase.com y cree una cuenta (puede usar «Continue with GitHub»).
2. Pulse **New project**.
3. Llénelo así:
   - **Name:** `ventaja-mando-prueba`.
   - **Database Password:** pulse **Generate a password**, cópiela y guárdela en un lugar seguro, como un gestor de contraseñas. No la pegue en el chat.
   - **Region:** `South America (São Paulo)`.
4. Pulse **Create new project** y espere un par de minutos.

**2. Copiar las claves al entorno de nube**
1. En el proyecto, entre a **Project Settings** (ícono de engranaje) y luego a **API Keys**.
2. Copie la clave **publishable** (empieza por `sb_publishable_`) y cree y copie una clave **secret** (empieza por `sb_secret_`). La secreta no la comparta con nadie ni la pegue en el chat. Si su proyecto solo muestra las claves antiguas («anon» y «service_role», en la pestaña **Legacy API Keys**), también sirven: la «anon» va como publicable y la «service_role» como secreta.
3. En **Project Settings → Data API** (o en la página de inicio del proyecto) copie la **Project URL**. Debe verse así: `https://abcdefghijklmnopqrst.supabase.co`, **sin** `/rest/v1/` al final.
4. Cree el token personal: entre a https://supabase.com/dashboard/account/tokens, pulse **Generate new token**, póngale de nombre `ventaja-mando-nube` y copie el valor (empieza por `sbp_`). Solo se muestra una vez. Este token puede administrar todos los proyectos de su cuenta: trátelo como una contraseña.
5. En claude.ai/code, abra el menú del entorno, en la barra de título de la sesión, y pulse **Edit**.
6. En **Environment variables**, deje una línea por clave:
   ```
   SUPABASE_URL=la Project URL, sin /rest/v1/
   SUPABASE_PUBLISHABLE_KEY=la clave publishable
   SUPABASE_SECRET_KEY=la clave secret
   SUPABASE_DB_URL=la cadena de conexión (Project Settings → Database → Connection string)
   SUPABASE_ACCESS_TOKEN=el token personal
   ```
7. En **Network access → Allowed domains**, deje `*.supabase.co` y agregue `api.supabase.com`. Deje marcado **Allow package managers**.
8. Guarde, abra una sesión nueva y avíseme. Yo aplico las migraciones, creo los secretos y le confirmo que todo quedó bien.

**3. Los secretos de cifrado de la cédula**

Los crea `aplicar-remoto.mjs migrar` dentro de la base: los valores se generan allí y nadie los ve, ni siquiera yo. Si prefiere crearlos usted:
1. En Supabase, abra **SQL Editor** y pulse **New query**.
2. Pegue esto y pulse **Run**:
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'clave_documento');
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pepper_documento');
   ```
3. **No los borre nunca:** sin `clave_documento`, las cédulas cifradas no se pueden recuperar.

**4. Activar la verificación en dos pasos (2FA)**
1. En Supabase, entre a **Authentication**, luego a **Sign In / Providers** (o **Multi-Factor**, según la versión).
2. Active **TOTP**, que es la verificación con una app como Google Authenticator.
3. Los administradores y gerentes que no la usen no verán datos: la base se los bloquea.

## Lo que no se pudo probar desde aquí

Las pruebas corren sobre un Postgres 16 con PostGIS que imita a Supabase, con la parte de autenticación simulada. `aplicar-remoto.mjs verificar` confirma en el proyecto real que las migraciones quedaron, que no hay tablas sin RLS y que el Vault cifra y descifra. Falta confirmar, con un usuario real que inicie sesión, que el token de sesión trae el dato de dos factores (`aal`). Eso se prueba en la fase 2, con el inicio de sesión del panel.
