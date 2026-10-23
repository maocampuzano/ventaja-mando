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

## Correr las pruebas en local

Necesita PostgreSQL 16 con PostGIS y pgTAP, y `pg_prove`. En Ubuntu:

```bash
sudo apt-get install postgresql-16-postgis-3 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
sudo -u postgres psql -c "alter user postgres password 'postgres'"
npm run test:db
```

La integración continua lo hace sola en cada PR.

## Cargar municipios y puestos oficiales

```bash
node supabase/scripts/cargar-territorios.mjs municipios archivo.csv --fuente "DANE, DIVIPOLA" --fecha 2026-10-01 > municipios.sql
node supabase/scripts/cargar-territorios.mjs puestos archivo.csv --fuente "Registraduría" --fecha 2026-10-01 > puestos.sql
```

Si el archivo oficial usa otros nombres de columna, se indican con `--columna cod_mpio="Código Municipio"`. Si falta alguna columna, el script le muestra las que encontró. No se pudo descargar ni revisar el archivo oficial desde el entorno de nube, porque la red no permite `datos.gov.co`: el primer archivo real hay que revisarlo antes de cargarlo.

## Pasar esto a su proyecto de Supabase (paso a paso)

Esto se hace una sola vez, cuando tenga el proyecto creado. Los nombres de los menús de Supabase pueden cambiar un poco con el tiempo. Si algo no coincide, avíseme qué ve en pantalla.

**1. Crear el proyecto**
1. Entre a https://supabase.com y cree una cuenta (puede usar «Continue with GitHub»).
2. Pulse **New project**.
3. Llénelo así:
   - **Name:** `ventaja-mando-prueba`.
   - **Database Password:** pulse **Generate a password**, cópiela y guárdela en un lugar seguro, como un gestor de contraseñas. No la pegue en el chat.
   - **Region:** `South America (São Paulo)`.
4. Pulse **Create new project** y espere un par de minutos.

**2. Copiar las tres claves al entorno de nube**
1. En el proyecto, entre a **Project Settings** (ícono de engranaje) y luego a **API**.
2. Copie **Project URL**, la clave **anon public** y la clave **service_role**. La `service_role` es secreta: no la comparta con nadie ni la pegue en el chat.
3. En claude.ai/code, abra el menú del entorno, en la barra de título de la sesión, y pulse **Edit**.
4. En **Environment variables**, agregue una línea por clave:
   ```
   SUPABASE_URL=la Project URL
   SUPABASE_ANON_KEY=la clave anon public
   SUPABASE_SERVICE_ROLE_KEY=la clave service_role
   ```
5. En **Network access → Allowed domains**, agregue `*.supabase.co` y deje marcado **Allow package managers**.
6. Guarde y avíseme. Yo aplico las migraciones y le confirmo que todo quedó bien.

**3. Crear los secretos de cifrado de la cédula** (lo puedo hacer yo con las claves; si prefiere hacerlo usted):
1. En Supabase, abra **SQL Editor** y pulse **New query**.
2. Pegue esto y pulse **Run**:
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'clave_documento');
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pepper_documento');
   ```
3. Los valores se generan solos y nadie los ve. **No los borre nunca:** sin `clave_documento`, las cédulas cifradas no se pueden recuperar.

**4. Activar la verificación en dos pasos (2FA)**
1. En Supabase, entre a **Authentication**, luego a **Sign In / Providers** (o **Multi-Factor**, según la versión).
2. Active **TOTP**, que es la verificación con una app como Google Authenticator.
3. Los administradores y gerentes que no la usen no verán datos: la base se los bloquea.

## Lo que no se pudo probar desde aquí

Las pruebas corren sobre un Postgres 16 con PostGIS que imita a Supabase, con la parte de autenticación simulada. El primer despliegue en su proyecto real confirmará tres cosas:
- que el Vault lee los secretos;
- que el token de sesión trae el dato de dos factores (`aal`);
- que las migraciones se aplican sin cambios.
