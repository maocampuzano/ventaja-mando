# Plan de incidentes de seguridad

**BORRADOR para revisión del abogado de datos personales (V3).** Las obligaciones legales están tomadas de la Ley 1581 de 2012 (arts. 17 lit. n y 18 lit. k), la Circular Externa 003 de 2018 de la SIC y su concepto 21-17773 de 2021, consultados el 09/11/2026.

## 1. Qué es un incidente

Cualquier pérdida, robo, consulta, uso o acceso no autorizado a datos de personas de la campaña, o la violación de un control de seguridad. Por ejemplo:

- Le roban el celular o la contraseña a un líder, coordinador o gerente.
- Alguien exporta la base sin una finalidad válida, o un archivo exportado termina en un grupo de WhatsApp.
- Se publica una clave del proyecto (Supabase, Anthropic, Cloudflare) o la clave de los respaldos.
- Un error del panel deja ver datos de otra campaña o de otro territorio.
- Se pierde un equipo con un archivo exportado o con un respaldo descifrado.

**Ante la duda, trátelo como incidente.** Es más barato descartar uno que descubrir tarde uno real.

## 2. Quién es quién

| Papel | Quién | Qué hace |
|---|---|---|
| **Responsable del tratamiento** | La campaña: el candidato y su gerente | Decide sobre los datos, reporta a la SIC y avisa a las personas afectadas. |
| **Encargado del tratamiento** | XYZ Creatia (Mauricio Campuzano), que opera Ventaja Mando | Contiene el incidente, investiga, avisa a la campaña el mismo día y también reporta a la SIC. |
| **Apoyo técnico** | Quien mantenga el sistema | Ejecuta los pasos técnicos de abajo. |

Deje aquí los contactos de cada campaña (nombre, celular y correo del gerente) y del abogado: ______________________

## 3. La primera hora: contener

Haga solo lo necesario para que el daño no siga, y **no borre nada**: la auditoría es la evidencia.

**a. Cuenta robada o sospechosa.** Se le quita el acceso de inmediato, sin borrar a la persona:
1. En Supabase, abra **SQL Editor** y ejecute (cambie el correo):
   ```sql
   update public.membresia set activa = false
   where usuario_id = (select id from auth.users where email = 'correo@ejemplo.co');
   ```
   La base deja de reconocerle cualquier rol: no ve nada más.
2. En **Authentication → Users**, busque la cuenta y use **Send password recovery** para que tenga que cambiar la contraseña.

**b. Una clave publicada o filtrada.** Cámbiela en su origen y cargue la nueva donde se usa:
- **Supabase:** Project Settings → API Keys → genere una nueva y desactive la anterior. Actualice el `.env`, los secretos de GitHub y vuelva a publicar las funciones (`supabase/scripts/activar-strategos.sh`).
- **Anthropic:** console.anthropic.com → API Keys → borre la anterior y cree otra. Actualice el `.env` y vuelva a publicar las funciones.
- **Cloudflare:** borre el token y cree otro.
- **Clave de los respaldos:** cree una nueva en el secreto `RESPALDO_CLAVE` de GitHub y borre los respaldos que se hicieron con la anterior (Actions → cada corrida → Artifacts → borrar).
- **Claves del Vault** (`clave_documento`, `pepper_documento`): no se cambian a mano, porque las cédulas cifradas dejarían de leerse. Llame al apoyo técnico.

**c. Cerrar toda una campaña mientras se investiga** (cambie el id de la campaña):
```sql
update public.membresia set activa = false where campana_id = '00000000-0000-0000-0000-000000000000';
```
Para reabrirla, el mismo comando con `true`, revisando primero quién debe volver a entrar.

## 4. Las primeras 72 horas: entender qué pasó

Use **Datos y cumplimiento → Auditoría** (solo la dirección), con filtros por fecha y acción. Responda por escrito:

1. ¿Qué pasó y cuándo se detectó? (Fecha y hora: desde ahí corren los 15 días hábiles.)
2. ¿Qué datos se vieron afectados? ¿Nombres, celulares, cédulas, fotos de planillas, opinión política (dato sensible)?
3. ¿Cuántas personas, de qué campañas?
4. ¿Desde cuándo y hasta cuándo? ¿Sigue ocurriendo?
5. ¿Quién lo causó, si se sabe? ¿Fue un error o hubo mala intención?
6. ¿Qué riesgo corren las personas afectadas (llamadas, suplantación, presión política)?

## 5. Avisar

1. **El encargado (XYZ Creatia) avisa a la campaña el mismo día**, por escrito, con lo que se sepa hasta ese momento.
2. **Reporte a la SIC, dentro de los 15 días hábiles siguientes a la detección.** Lo hacen la campaña (responsable) y XYZ Creatia (encargado):
   - Si la campaña está obligada a inscribir sus bases en el **Registro Nacional de Bases de Datos (RNBD)**: se reporta como novedad de esa base en el RNBD.
   - Si no está obligada, y en todos los casos el encargado: en el módulo **«Reporte de incidentes de seguridad»** del micrositio de Protección de Datos Personales de [sic.gov.co](https://www.sic.gov.co).
   - Guarde el número de radicado.
3. **Las personas afectadas:** cuando haya riesgo para ellas, la campaña les avisa qué pasó, qué datos y qué pueden hacer. El texto lo revisa el abogado.

## 6. Corregir y cerrar

1. Arreglar la causa con su PR y una **prueba automática** que demuestre que no se repite (como `supabase/tests/24_seguridad.test.sql`).
2. Volver a dar acceso solo a quien lo necesita.
3. Escribir una nota corta: qué pasó, por qué, qué se cambió. Sin culpas: el objetivo es que no se repita.
4. Actualizar este plan si algo no funcionó como estaba escrito.

## 7. Registro

Anote aquí cada incidente, aunque se descarte, y cada simulacro de restauración de respaldos (ver `docs/RESPALDOS.md`).

| Fecha de detección | Qué pasó | Datos y personas afectadas | Acciones | Reporte SIC (fecha y radicado) | Cerrado |
|---|---|---|---|---|---|
| | | | | | |
