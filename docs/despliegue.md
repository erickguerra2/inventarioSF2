# Despliegue — qué cambia por el servidor

> Análisis de lo que hay (Hostinger Business Web Hosting), qué funciona tal cual, qué no, y
> qué hay que decidir. Responde a la pregunta 1 de [plan-backend.md](plan-backend.md) §15.

---

## 1. Qué es el servidor

De la captura del panel:

| | |
|---|---|
| Plan | Hostinger **Business Web Hosting** |
| Disco | 200 GB |
| RAM | 3072 MB |
| CPU | 2 núcleos |
| Inodos | 600 000 |
| Máximo de procesos | 120 |
| **PHP workers** | **60** |
| Ancho de banda | ilimitado |

**Es hosting compartido**, no un servidor propio. Los recursos no están mal —3 GB de RAM y
2 núcleos le sobran a este sistema— pero el problema no es la potencia: es **qué se puede
instalar y ejecutar**.

Que el panel mida "PHP workers" y no procesos de Node es una pista fuerte de que la pila
pensada es PHP + MySQL. No es prueba, pero orienta.

## 2. El precedente del proyecto anterior no prueba lo que parece

El zip del alumno (`Proyecto de practicas.zip`) tiene **29 archivos**: 25 fotos `.jpg`, dos
`.html`, un `.js` y un `logo.png`. Nada más.

Es un **sitio estático**: HTML con JavaScript en el navegador, sin servidor, sin base de
datos. Los precios y las existencias estaban escritos dentro del código — de ahí el "todas
las tallas tenían Q1.00 y 0 existencias" que quedó anotado en `uniformes-ccsf2.md`.

Entonces, cuando decimos "el del alumno se subió como zip y se descomprimió", lo que eso
demuestra es que **el servidor sirve archivos estáticos**. Eso ya lo sabíamos: cualquier
hosting lo hace. No dice nada sobre si puede correr Node ni si tiene PostgreSQL.

> **Aparte, un problema de seguridad del sitio viejo.** Ese `ims.js` trae, en texto plano y
> del lado del navegador, una contraseña general y una lista de usuarios con sus contraseñas
> — incluidas las de la dirección general, la subdirección y la secretaría, con nombre y
> apellido. Cualquiera que abriera la página podía leerlas con "ver código fuente".
>
> Dos cosas: **esas contraseñas hay que considerarlas quemadas** y cambiarlas donde se hayan
> reusado, y el archivo no debería volver a subirse a ningún lado. El sistema nuevo no tiene
> este problema —las contraseñas se guardan con argon2id y nunca salen del servidor—, pero
> eso no arregla las que ya se publicaron.

## 3. Respuesta del proveedor — CONFIRMADO

Hostinger contestó las tres preguntas:

> **No**, el plan actual solo es Business Web (hosting compartido), no cuenta con **Node.js
> preinstalado**, tampoco tiene permisos para **ejecutar procesos en segundo plano**.
>
> Es optimizado para entornos **PHP**, como base de datos tiene **MySQL y MariaDB** que se
> administra a través de phpMyAdmin.
>
> **SSH está disponible** y activado por medio del puerto personalizado. Para transferir
> archivos, **SFTP/FTP** o el administrador de archivos del hPanel.

Tres consecuencias, en orden de importancia:

1. **"No permisos para ejecutar procesos en segundo plano" es lo que decide todo.** Un
   backend no es un archivo que se abre cuando alguien entra: es un programa que tiene que
   estar **encendido todo el tiempo**, escuchando. Sin permiso para eso, da igual que haya
   Node o no: no hay dónde correrlo.
2. **No hay Node ni PostgreSQL.** Hay PHP y MySQL/MariaDB.
3. **El SSH no cambia nada.** Sirve para copiar archivos y correr comandos cortos, no para
   dejar un servidor levantado. Es útil, pero no resuelve el punto 1.

**Y Docker queda descartado por partida doble**: ningún hosting compartido lo permite —exige
permisos de root sobre una máquina que es de varios clientes— y además caería en la misma
prohibición de procesos en segundo plano. El `docker-compose.yml` del proyecto se queda como
lo que siempre fue: una herramienta para desarrollar en tu computadora.

## 4. Las opciones que quedan

Con la respuesta del proveedor, **dos de las cuatro opciones que había murieron**:

| | |
|---|---|
| ~~B. Node en el hosting + Postgres afuera~~ | No hay Node ni procesos en segundo plano |
| ~~C. Node en el hosting + MySQL~~ | Lo mismo: el problema no era la base, era correr el proceso |

Quedan estas:

### A. VPS de Hostinger — *la recomendada*

Hostinger vende VPS desde unos **USD 5–7 al mes**, en la misma cuenta donde ya está el
dominio. Con eso:

- Todo lo construido corre **tal cual**: Docker, PostgreSQL, nginx, HTTPS, el servicio que se
  reinicia solo. Se sigue §13 del plan de backend y ya.
- **Cero reescritura.** Ni una línea de SQL cambia.
- El dominio `inventario.ccsf2.edu.gt` se apunta al VPS; el hosting actual se queda con lo
  que ya tiene.

Es la opción con menos trabajo total y menos riesgo. Lo que cuesta es el alquiler mensual.

### B. Lo de siempre para el frontend + el backend en un plan gratuito

Esta sí sigue en pie, y cuesta **Q 0**. **Es la elegida.**

**Qué base de datos usar, y por qué no las otras.** Esto importa más que la elección del
backend, porque acá viven los datos:

| | |
|---|---|
| **Neon** ✔ | Plan gratuito **sin caducidad**, 1 GB por proyecto (al colegio le sobra: hablamos de megas, no de gigas). La computación se suspende a los 5 minutos de inactividad, pero despierta rápido. |
| PostgreSQL de Render ✘ | Su base gratuita **caduca a los 30 días**. Descartada de entrada. |
| Supabase ✘ | **Pausa los proyectos gratuitos tras 7 días de poca actividad** (se pueden restaurar hasta 90 días después). Justo el patrón del colegio: noviembre a enero fuerte y después nueve meses tranquilos. Estaría pausándose sola todo el año. |

- El **frontend compilado son 4 archivos y 430 KB**: eso sí se puede subir como zip al
  hosting actual, igual que el proyecto del alumno. El hosting sirve archivos estáticos sin
  problema.
- El **backend y la base** se van a un plan gratuito (Render, Railway o Fly para el backend;
  Neon o Supabase para PostgreSQL). Cero reescritura.
**Sobre que "se duermen": dónde cae realmente la espera.** Los planes gratuitos apagan el
servidor tras un rato sin uso, y despertarlo toma entre 30 y 60 segundos. Pero conviene mirar
el orden de las cosas:

1. La maestra abre la página → el frontend es estático y carga al instante.
2. La página pregunta `GET /auth/me` → **ahí despierta el servidor.**
3. Ella escribe usuario y contraseña, entra.
4. Vende → el servidor ya está caliente.

Es decir: **la espera cae al abrir la aplicación, no al cobrar.** Y eso cambia mucho las
cosas, porque un minuto mientras nadie espera es tolerable; un minuto con el papá enfrente,
no.

**El problema que sí queda** es que vuelve a dormirse tras unos 15 minutos sin peticiones. En
enero, vendiendo seguido, nunca se duerme. El resto del año, con una venta a las 8 y otra a
las 11, la de las 11 **sí** agarraría el servidor dormido, y esa espera ya cae con alguien
enfrente.

**Y eso tiene solución gratis:** un *ping* programado a `/health` cada 10 minutos, desde un
cron gratuito (cron-job.org, o un workflow de GitHub Actions). Pero **no conviene hacerlo
24/7**, y la razón es importante.

### Por qué el ping NO debe correr todo el día

Render da **750 horas de instancia gratis al mes por workspace**, y un servicio dormido no
consume ninguna. El detalle que cambia todo: **el ping consume justamente las horas que
protege**. Un servicio despierto las 24 horas gasta unas 730 al mes — o sea, casi toda la
cuota. Y si se agota, **Render suspende todos los servicios gratuitos del workspace hasta el
mes siguiente**.

Es decir: tener el ping siempre encendido es la forma más fácil de que el sistema se caiga
justo en enero, que es cuando no puede caerse.

**La cuenta que sí cierra**, pensada para el colegio:

| | |
|---|---|
| Ping cada 10 min, de 6:00 a 18:00 | ~12 h/día |
| En un mes de 31 días | **~372 horas** |
| Cuota de Render | 750 horas |
| Margen | sobra la mitad |

Fuera de ese horario el servidor duerme y no gasta nada. Si alguien entra a las 9 de la
noche, espera el minuto de arranque — y a esa hora no hay nadie vendiendo.

> **Ojo con la otra cuota.** Mantener el backend despierto también mantiene abierta su
> conexión a la base, y **Neon da 100 CU-hours al mes**. Con el horario de arriba se queda
> cerca del límite, así que conviene **revisar el consumo real el primer mes** en los paneles
> de los dos servicios, y recortar el horario si hace falta. De las dos cuotas, la de Neon es
> la más apretada.

### Los respaldos son el verdadero riesgo, no el arranque

Los planes gratuitos **no hacen respaldos automáticos**, y la recuperación a un punto en el
tiempo de Neon en el plan gratuito es de pocas horas. El plan de backend (§13) pide respaldo
diario probado, y acá no hay servidor donde programarlo.

**Solución gratis:** un workflow de GitHub Actions, una vez al día, que corra `pg_dump`
contra la base y guarde el resultado como artefacto o en un repositorio privado. Es media
hora de trabajo y es lo que separa "se cayó el sistema" de "se perdió el inventario del
colegio".

Esto no es opcional. El servidor durmiéndose es una molestia; la base evaporándose, no.

**Lo que sigue siendo distinto respecto al VPS:**

- Al quedar en dominios distintos, se rompe el "mismo dominio" del diseño: hay que pasar la
  cookie a `SameSite=None; Secure` y configurar CORS con credenciales (está previsto en §0.2
  del plan de backend, pero es más frágil y lo bloquean algunos navegadores).
- Se depende de dos terceros gratuitos que pueden cambiar condiciones.
- Son tres piezas en tres lugares (hosting, backend, base) en vez de una.

Con el ping, **es una opción real para el uso diario**, no solo para una demostración.

### C. Reescribir en PHP

Es el camino si el colegio decide que no paga nada y que todo tiene que vivir en el hosting
que ya tiene.

- El **modelo de datos, las reglas de negocio y el contrato de API siguen sirviendo
  completos**: están escritos aparte del lenguaje, a propósito. El plan de backend se puede
  seguir casi línea por línea con Laravel.
- Pero hay que **reescribir el backend entero** y volver a escribir las 93 pruebas. Semanas,
  no días. Y se tira a la basura un backend que ya funciona y está probado.
- Ojo con una cosa: PHP tampoco corre "en segundo plano", pero no lo necesita — cada
  petición levanta un proceso, lo atiende y lo apaga. Por eso el hosting sí lo permite.

### La decisión

**C queda descartada** salvo que la decisión de no gastar nada sea definitiva: son semanas de
reescribir algo que ya funciona y está probado.

Entre **A** y **B** la diferencia ya no es "una sirve y la otra no" — con el ping, las dos
sirven para el uso diario. La diferencia es:

| | A. VPS | B. Gratis |
|---|---|---|
| Costo | ~Q 40 al mes | Q 0 |
| Piezas que mantener | una | tres, en tres proveedores |
| La cookie de sesión | como fue diseñada | `SameSite=None`, más frágil |
| Si el proveedor cambia las reglas | no aplica | hay que mudarse |
| Trabajo de código | ninguno | ninguno |

**Recomiendo A** por una razón sola: es una pieza en vez de tres, y el día que algo falle hay
un solo lugar donde mirar. Pero **B es defendible**, sobre todo para arrancar sin pedir dinero
y ver si el sistema realmente se usa antes de comprometer un gasto mensual.

---

## 5. Optimización para un servidor chico

Esto aplica a cualquiera de las opciones, y varias ya están hechas.

### Lo que ya está bien

| | |
|---|---|
| Frontend compilado | **4 archivos, 430 KB** en total (116 KB comprimido) |
| Un solo proceso de Node | sin cluster ni PM2: sobra para esta carga |
| Swagger UI | solo en desarrollo, apagado en producción |
| Nivel de logs | `info` en producción, no `debug` |
| Inodos | ~9 800 archivos de `node_modules` contra un límite de **600 000** |

Los inodos no son problema ni de cerca.

### Lo que hay que hacer al desplegar

1. **Compilar en la computadora, no en el servidor.** `npm run build` y `npm --prefix web run
   build` se corren localmente; al servidor sube el resultado. Compilar TypeScript en una
   máquina de 2 núcleos compartidos es regalarle trabajo al servidor cada despliegue.
2. **Instalar sin dependencias de desarrollo:** `npm ci --omit=dev`. Quita TypeScript, Vite,
   Vitest y Prisma CLI del servidor: menos disco, menos archivos y menos superficie.
3. **Limitar el pool de conexiones de Prisma.** Por omisión abre `núcleos × 2 + 1`. En un
   servidor compartido, y más con una base remota (opción B), conviene bajarlo:
   ```
   DATABASE_URL="postgresql://...?connection_limit=3&pool_timeout=20"
   ```
4. **Limitar la memoria de Node:** arrancarlo con `--max-old-space-size=320`. Con eso el
   proceso no crece más de lo necesario y, si algo se desboca, falla rápido en vez de
   tumbar al vecino.
5. **Cabeceras de caché para los estáticos.** Los archivos del build llevan hash en el
   nombre (`index-Di9XkDNI.js`), así que pueden cachearse un año sin riesgo. `index.html`,
   nunca.
6. **Optimizar las fotos de los uniformes** (ver abajo). Es, de lejos, la ganancia más grande.

---

## 6. Las fotos de los uniformes — HECHO

Las 25 fotos que venían con el proyecto del alumno son las mismas que documenta
`uniformes-ccsf2.md`. Pero vienen sin optimizar, y mucho:

```
foto.1.jpg     2762 KB   6144 x 8192   <- 50 megapíxeles
foto.3.jpg     3056 KB   6144 x 8192
foto.5.jpg     2745 KB   6144 x 8192
15.jpg          480 KB   1183 x 1329
...
TOTAL          21.3 MB en 25 fotos
```

Seis de ellas son de **6144 × 8192 píxeles**. Eso es una foto para imprimir en un afiche,
no para mostrar un polo en una pantalla de venta. Servir 2.7 MB para que se vea una miniatura
de 200 píxeles, sobre el WiFi del colegio y con alguien esperando en la ventanilla, es la
diferencia entre instantáneo e inusable.

**Ya está resuelto.** Se generaron dos versiones de cada foto y viven en el repositorio, en
`web/public/uniformes/`:

| Uso | Tamaño | Peso real |
|---|---|---|
| Miniatura (lista de venta, catálogo) | 200 px de ancho | **4–7 KB** |
| Vista de la prenda | 800 px de ancho | **37–72 KB** |

**De 21.3 MB a 1.3 MB**, contando las 50 imágenes (las dos versiones de cada una). Medido en
la pantalla de venta con la lista completa: **31 miniaturas pesan 157 KB en total**. Con los
originales habrían sido decenas de megas.

El sitio estático completo que se sube al hosting —aplicación compilada más fotos— queda en
**1.7 MB**.

Dos cosas que salieron al hacerlo:

- **Los nombres de archivo no eran los que yo suponía.** El seed decía `foto.15.jpg` para las
  prendas de educación física, pero los archivos reales se llaman `15.jpg`. Estaba anotado
  como suposición en el código y resultó equivocada; ya está corregido contra los archivos
  de verdad.
- **Las fotos las sirve el frontend, no el backend.** Son archivos estáticos: los sirve el
  hosting que ya tienen, gratis y rápido, sin gastar ni una hora de las 750 de Render. Por
  eso `MEDIA_BASE_URL` apunta al sitio y no a la API.

> El `.rar` no lo pude abrir: esta computadora no tiene 7-Zip ni WinRAR. Si trae originales
> distintos o mejores, pasámelo como `.zip` y regenero las dos versiones.

---

## 7. Resumen

- **El hosting actual no puede correr este backend.** No por falta de Node: porque no permite
  dejar un proceso corriendo, que es lo que un backend necesita para existir.
- **El precedente del alumno solo probaba hosting estático**, no Node ni base de datos.
- **Se eligió la opción gratuita (B):** frontend en el hosting que ya tienen, backend en
  Render, base en **Neon** (la única de las tres que no caduca ni se pausa sola).
- **El ping va solo en horario de colegio**, no 24/7: las horas gratuitas de Render se gastan
  teniendo el servidor despierto, y agotarlas suspende el servicio hasta el mes siguiente.
- **Falta lo único que no es opcional: los respaldos.** Los planes gratuitos no los hacen, y
  acá viven las ventas del colegio.
- El VPS (~Q 40 al mes) sigue siendo la opción más simple de mantener si algún día el colegio
  decide pagarlo: una pieza en vez de tres, y sin cuotas que vigilar.
- El hosting actual **no se tira**: puede seguir con el sitio del colegio, y el inventario vive
  en un subdominio apuntado al VPS.
- **La optimización más grande no es del código: son las fotos** (21.3 MB → menos de 2 MB).
- Y hay que **cambiar las contraseñas** que el sitio anterior publicó en su JavaScript.
