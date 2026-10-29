# Registro QA con administrador en producción

Alcance solicitado el 29/10/2026: crear registros en recompensas, contenidos,
patrocinadores, ofertas, reservas, campañas y viajes mediante la interfaz de
`https://carreras-viajeras.mentec.dev`, con una cuenta admin autenticada.

## Estado de esta ejecución

- 554 pruebas locales de acciones, identidad y roles, en diez archivos, pasaron. Usan servicios y/o
  identidad simulados: no acreditan login real ni escrituras en producción.
- Los ocho payloads sintéticos del ejecutor se validaron contra los schemas Zod
  reales de la aplicación: siete módulos, con regla y premio en recompensas.
- La precomprobación desde Codex Cloud se ejecutó y quedó bloqueada. El proxy rechaza
  el dominio con CONNECT 403; faltan QA_ADMIN_EMAIL y QA_ADMIN_PASSWORD.
- No se inició sesión, no se enviaron formularios y no se crearon registros remotos.
- Pasaron catorce regresiones del ejecutor: modo interactivo sin lectura de credenciales,
  precomprobaciones, bloqueo de altas sin prueba admin, diagnóstico HTTP seguro,
  CDP limitado a loopback y conservación del navegador externo. La ejecución
  real en Windows sigue pendiente; las instrucciones no se anuncian como E2E aprobado.
- No se modificaron guardas, roles, datos existentes, claves Clerk ni configuración
  de producción. El acceso y las variables se declararon en el borrador del entorno;
  guardarlo no los aplica al runtime ni publica el entorno.

## Requisitos

Una cuenta existente con rol admin o super_admin y correo verificado. En el modo
interactivo introduces el correo, la contraseña y cualquier código de verificación
directamente en la ventana de Clerk. El script no lee esas credenciales ni las
guarda en variables, archivos, informes o historial de comandos.

Para automatización sin interfaz, QA_ADMIN_EMAIL y QA_ADMIN_PASSWORD pueden
inyectarse en ajustes seguros del entorno. Nunca se escriben en el chat, código,
comandos con valores literales ni archivos de prueba. Ese modo se detiene ante
verificación interactiva adicional. Ningún modo crea cuentas, cambia roles o elude
la autenticación. No se necesita acceso directo a Neon ni la clave secreta de Clerk.

El navegador necesita acceso a carreras-viajeras.mentec.dev y clerk.mentec.dev.
Se mantiene la verificación TLS y el proxy configurado.

## Windows con inicio de sesión en el navegador

Requiere Git y Python 3.12 o posterior instalados. Usa PowerShell. La ruta
/workspace/carreras-viajeras pertenece al entorno cloud, no a tu computadora.
Desde tu carpeta de usuario, clona la rama que contiene este ejecutor:

```powershell
cd $HOME
git clone --branch codex/admin-production-registration --single-branch https://github.com/ronalehm/carreras-viajeras.git carreras-viajeras-qa
cd carreras-viajeras-qa
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install playwright tzdata
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe scripts\check-admin-registration.py --interactive-login --report test-results\admin-registration.json
```

No necesitas activar un script de PowerShell ni instalar las dependencias npm de
la aplicación: este test utiliza el sitio remoto. Si Git pide autenticación, usa
tu acceso habitual de GitHub. Usa otra carpeta de destino si carreras-viajeras-qa
ya existe; no sobrescribas una copia con cambios.

El modo interactivo abre Chromium directamente: no depende de que Python pueda
leer /api/health, pues su almacén TLS y proxy pueden diferir de los del navegador.
La comprobación explícita --preflight conserva el diagnóstico de Python; no es
prueba de la conexión de Chromium. TLS sigue habilitado en ambos transportes.

Se abrirá una ventana de Chromium con el login de Clerk. Inicia sesión como admin
y completa la verificación durante los cinco minutos disponibles. El ejecutor
consulta /api/crm/me mediante fetch dentro de Chromium, con sus cookies y su
conexión, y exige respuesta 200 y rol admin antes de enviar el primer formulario; después
registra las filas QA y recarga las fichas o historiales para verificar persistencia.

Lee el resultado con:

```powershell
Get-Content test-results\admin-registration.json -Raw -Encoding UTF8
```

Éxito completo: passedModules igual a 7 y productionRegistrationComplete igual a
true. Un error no acredita el registro: revisa el estado de cada módulo y cualquier
escritura marcada como incierta antes de repetirlo. La ventana se cierra al terminar.

## Reutilizar Google Chrome instalado y conservar una sesión de QA

Si Google rechaza el login en Chromium automatizado, inicia sesión manualmente
antes de conectar el test. Usa tu Chrome instalado con un directorio de datos
separado. Chrome moderno no admite automatizar el perfil principal: no copies su
carpeta User Data, cookies, contraseñas ni claves. El perfil QA se conserva en
LOCALAPPDATA fuera del repositorio y puede reutilizarse en ejecuciones posteriores.
Referencia de Chrome: https://developer.chrome.com/blog/remote-debugging-port.

En la misma ventana de PowerShell del proyecto, actualiza el ejecutor y Playwright:

```powershell
git pull --ff-only
.\.venv\Scripts\python.exe -m pip install --upgrade "playwright>=1.62.0" tzdata
```

Localiza Chrome y abre el perfil QA en modo normal, todavía sin automatización:

```powershell
$qaChrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $qaChrome) { throw "No se encontró Google Chrome instalado." }
$qaProfile = Join-Path $env:LOCALAPPDATA "CarrerasViajeras-QA"
& $qaChrome "--user-data-dir=$qaProfile" "https://carreras-viajeras.mentec.dev/crm/acceso"
```

Inicia sesión en el CRM con la cuenta admin y completa cualquier verificación
normal. Confirma que puedes ver el panel administrativo. Después cierra solo esa
ventana de Chrome QA para liberar el perfil; tu Chrome habitual puede seguir abierto.
No se solicita desactivar controles de Google ni se garantiza que un proveedor
acepte OAuth automatizado. El test utiliza la sesión del CRM obtenida manualmente.

Reabre el mismo perfil con la conexión de pruebas limitada a tu equipo:

```powershell
& $qaChrome "--user-data-dir=$qaProfile" "--remote-debugging-port=9222" "--remote-debugging-address=127.0.0.1" "https://carreras-viajeras.mentec.dev/crm"
```

Cuando se vea el CRM, deja Chrome QA abierto y ejecuta:

```powershell
.\.venv\Scripts\python.exe scripts\check-admin-registration.py --cdp-url http://127.0.0.1:9222 --report test-results\admin-registration.json
```

El test añade una pestaña al contexto existente, sin exportar cookies ni leer otras
pestañas. Mantiene obligatoria la comprobación admin en /api/crm/me. Al terminar
cierra solo su pestaña; no cierra el navegador o el contexto que abriste tú.
Solo acepta direcciones CDP HTTP de loopback, sin usuario, contraseña, query o
fragmento. Playwright 1.62 o posterior permite conectar sin aplicar sus ajustes
predeterminados al contexto existente.

El ciclo CDP se comprobó con Chromium local y pestañas about:blank: la pestaña
anterior permaneció abierta y el navegador siguió vivo tras la desconexión. No se
hicieron solicitudes a producción en esa comprobación. El login Google/Clerk y
las altas en Windows siguen pendientes de ejecución real.

## Codex Cloud o automatización sin interfaz

Con Python Playwright, Chromium y las variables QA seguras disponibles:

```sh
python3 scripts/check-admin-registration.py --preflight --report /tmp/admin-preflight.json
python3 scripts/check-admin-registration.py --report /tmp/admin-registration.json
```

QA_CHROMIUM_PATH permite indicar un Chromium ya instalado. En Linux se usa
/usr/bin/chromium si existe; en Windows se usa el navegador instalado por Playwright.

`--plan` imprime únicamente los datos sintéticos; no visita ni escribe en producción.
`--preflight` revisa la red y los requisitos del modo elegido, sin login ni altas;
puede combinarse con --interactive-login para comprobar solo conectividad desde
una computadora local. La ejecución completa siempre comprueba los roles con
GET /api/crm/me antes de registrar.

Todos los registros llevan un prefijo QA único con fecha/hora de Lima y sufijo
aleatorio. El resultado se verifica recargando la ficha o historial, además del
mensaje de éxito. El informe no contiene contraseñas, cookies, tokens ni datos
personales de clientes. El ejecutor no exporta capturas, trazas ni archivos de estado de sesión. En modo
CDP, Chrome conserva la sesión en el directorio privado del perfil QA.

| Módulo | Registro y verificación |
| --- | --- |
| Patrocinadores | Nueva marca QA; nombre persistido en su ficha. |
| Viajes | Nuevo viaje en borrador; título persistido y estado Borrador. |
| Campañas | Nueva campaña del viaje QA; ficha con el nombre creado. No se usa ni difunde el enlace. |
| Ofertas | Oferta del viaje QA en borrador; nombre y estado después de recargar. |
| Reservas | Reserva pendiente del viaje QA, correo example.test; sin confirmación ni pagos. |
| Contenidos | Noticia QA en borrador; título y estado; no se publica. |
| Recompensas | Regla y premio QA inactivos; condiciones/título y estado Inactiva en el historial. |

Las campañas se crean activas por contrato de la aplicación, pero el viaje QA
permanece en borrador. No se publica ni comercializa el viaje, no se activan
ofertas/reglas/premios, no se asignan beneficios ni se procesan pagos o envíos.
Las cantidades de la prueba son datos sintéticos en registros identificados como QA.

Un fallo después de enviar un formulario puede significar que se guardó sin que
la verificación terminara. El ejecutor marca ese resultado como incierto y no
reintenta automáticamente la escritura. Usa el prefijo del informe para localizar
la fila. Los registros QA quedan visibles al equipo; el script no elimina datos
ni modifica registros anteriores. Toda limpieza posterior debe limitarse a los
ids o al prefijo de esta ejecución.

La precomprobación devuelve código 0 si sus requisitos están disponibles, y 2 si
faltan; no marca módulos como registrados. En una ejecución completa, solo ocho
altas verificadas en los siete módulos terminan con código 0. No se ejecuta este
script automáticamente en CI, al instalar, arrancar o desplegar.


Si una versión anterior terminó con prerequisites_missing, network igual a
production_unreachable y missingEnvironment vacío en Windows, actualiza la rama:

```powershell
git pull --ff-only
.\.venv\Scripts\python.exe scripts\check-admin-registration.py --interactive-login --report test-results\admin-registration.json
```

La corrección usa el navegador para la conexión y la prueba de administrador;
no desactiva TLS ni omite autenticación o permisos. Los mensajes de error del
sondeo Python incluyen solo un motivo fijo y el estado HTTP, sin cuerpo ni datos
privados. Usa -Encoding UTF8 al leer el informe en Windows PowerShell.
