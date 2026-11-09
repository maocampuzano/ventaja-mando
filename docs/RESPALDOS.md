# Respaldos de la base de datos

## Cómo funciona

- **Todos los días a las 3:00 a. m. (hora de Bogotá)**, GitHub copia la base de datos del proyecto de Supabase (`.github/workflows/respaldo.yml`).
- **Qué se copia:** las tablas de la aplicación (`public` y `privado`) y las cuentas de usuario (`auth`).
- **Se cifra antes de guardarse** (AES-256) con una clave que **solo usted** tiene. El repositorio es público y cualquier persona con cuenta de GitHub puede descargar los archivos que dejan sus tareas: sin la clave, el archivo no se puede leer.
- **La misma tarea verifica la copia:** la descifra y revisa que tenga todas las tablas.
- **Cada copia se guarda 30 días** en GitHub (Actions → «Respaldo diario» → la corrida del día → «Artifacts»).
- **Lo que NO se copia aquí:** las fotos de planillas y E-14 y los soportes de finanzas (están en el almacenamiento de archivos de Supabase), y las claves del Vault con las que se cifran las cédulas. Vea «Lo que usted debe guardar aparte».

> **Importante:** el plan gratuito de Supabase **no** hace copias automáticas propias. Antes de cargar datos reales (V6), conviene pasar al plan Pro, que guarda copias diarias de 7 días. Esta copia de GitHub se suma a esas: no las reemplaza.

## Lo que usted debe hacer una sola vez (unos 15 minutos)

### 1. Copiar la dirección de conexión de la base

1. Entre a [supabase.com](https://supabase.com/dashboard) y abra el proyecto **ventaja-mando-prueba**.
2. Arriba, haga clic en **Connect**.
3. Elija la pestaña **Connection string**, el tipo **URI** y el modo **Session pooler**. No use «Direct connection»: GitHub no puede llegar a ella.
4. Copie la dirección. Empieza por `postgresql://postgres.` y tiene `[YOUR-PASSWORD]` en medio.
5. Cambie `[YOUR-PASSWORD]` por la contraseña de la base. Si no la recuerda: **Project Settings → Database → Reset database password**.

Así queda bien: `postgresql://postgres.xxxxxxxx:SU-CONTRASEÑA@aws-0-us-east-2.pooler.supabase.com:5432/postgres`

### 2. Crear la clave del respaldo y guardarla

1. Invente una frase larga, de **al menos 24 caracteres** (por ejemplo, cuatro o cinco palabras que no tengan relación entre sí, con números). Lo ideal es que la genere su gestor de contraseñas.
2. **Guárdela en dos lugares seguros** (su gestor de contraseñas y un papel en un lugar seguro). **Si la pierde, los respaldos no sirven**: nadie, ni siquiera nosotros, puede abrirlos.

### 3. Cargar las dos claves en GitHub

1. Abra [github.com/maocampuzano/ventaja-mando](https://github.com/maocampuzano/ventaja-mando) y entre a **Settings** (el engranaje, arriba).
2. En el menú de la izquierda: **Secrets and variables → Actions**.
3. Clic en **New repository secret**:
   - Name: `RESPALDO_DB_URL`
   - Secret: la dirección del paso 1.
   - Clic en **Add secret**.
4. Otra vez **New repository secret**:
   - Name: `RESPALDO_CLAVE`
   - Secret: la frase del paso 2.
   - Clic en **Add secret**.

### 4. Probarlo

1. En el repositorio, entre a **Actions → Respaldo diario → Run workflow → Run workflow** (botón verde).
2. Espere unos 3 minutos y abra la corrida.
3. **Quedó bien si:**
   - aparece en verde con el aviso «Respaldo del … verificado: N tablas con datos»;
   - abajo, en «Artifacts», está `respaldo-AAAA-MM-DD`.

## Lo que usted debe guardar aparte

Las cédulas se guardan cifradas con dos claves que viven dentro de Supabase, en el **Vault**: `clave_documento` y `pepper_documento`. Si algún día hubiera que restaurar la base en **otro** proyecto, sin esas dos claves las cédulas no se podrían leer ni buscar.

1. En Supabase: **Project Settings → Vault** (o el menú **Integrations → Vault**).
2. Abra cada una y copie su valor.
3. Guárdelas igual que la clave del respaldo: en el gestor de contraseñas y en papel, en lugar seguro. **Nunca** en el repositorio ni en un chat.

## Cómo se restaura (lo hace la persona técnica)

1. Descargar el archivo `ventaja-mando-AAAA-MM-DD.dump.gpg` desde la corrida de Actions.
2. Descifrarlo (pide la clave del respaldo):
   ```bash
   gpg --decrypt --output respaldo.dump ventaja-mando-AAAA-MM-DD.dump.gpg
   ```
3. Crear un proyecto nuevo de Supabase (o usar el mismo, si se dañó) y aplicar las migraciones con `node --env-file=.env supabase/scripts/aplicar-remoto.mjs migrar`.
4. Cargar las claves del Vault guardadas aparte con los mismos nombres.
5. Restaurar solo los datos, sobre la estructura que ya crearon las migraciones. Con `session_replication_role=replica`, la base no revisa los controles mientras carga; los datos ya pasaron esos controles cuando se guardaron:
   ```bash
   PGOPTIONS='-c session_replication_role=replica' pg_restore --data-only --no-owner --dbname "$RESPALDO_DB_URL" respaldo.dump
   ```
   *Pendiente de confirmar en el primer simulacro de restauración contra Supabase.*
6. Comprobar con `node --env-file=.env supabase/scripts/aplicar-remoto.mjs verificar`: `cifrado_ok` y `hmac_ok` deben salir en `true`.
7. Borrar `respaldo.dump` del equipo cuando termine (tiene datos personales en claro).

## Simulacro de restauración

Una vez por trimestre, y siempre antes de una elección, conviene restaurar el respaldo más reciente en un proyecto de Supabase de prueba aparte y verificar que el panel abre con los datos. Anote la fecha y el resultado en el registro de incidentes (`docs/PLAN-INCIDENTES.md`, sección «Registro»).
