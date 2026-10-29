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
protege**. Un servicio despierto las 24 horas gasta unas **744 al mes** (un mes de 31 días tiene
exactamente 744), o sea la cuota entera menos 6 horas de margen — y cada despliegue se come
una parte. Y si se agota, **Render suspende todos los servicios gratuitos del workspace
hasta el mes siguiente**.

Es decir: tener el ping siempre encendido es la forma más fácil de que el sistema se caiga
justo en enero, que es cuando no puede caerse.

**La cuenta que sí cierra**, pensada para el colegio:

| | |
|---|---|
| Ping cada 10 min, de 6:00 a 18:00 | ~12 h/día |
| En un mes de 31 días, de lunes a sábado | **~312 horas** |
| Cuota de Render | 750 horas |
| Margen | sobra la mitad |

Fuera de ese horario el servidor duerme y no gasta nada. Si alguien entra a las 9 de la
noche, espera el minuto de arranque — y a esa hora no hay nadie vendiendo.

> **La otra cuota, y por qué el ping le pega a `/health` y no a `/health/db`.** Neon da
> **100 CU-hours al mes** y suspende su computación a los 5 minutos de inactividad, donde
> "inactividad" significa *sin consultas*: una conexión abierta pero quieta no la mantiene
> despierta.
>
> `/health` no toca la base. Entonces el ping mantiene despierto a **Render sin despertar a
> Neon**: la base solo arranca cuando alguien entra o vende de verdad, y tarda medio segundo
> en hacerlo. Si el ping le pegara a `/health/db`, se irían unas **78 de las 100 CU-hours
> sin que nadie hubiera vendido nada**, y ahí sí la cuota de Neon sería la más apretada.
>
> Lo de la conexión quieta está medido por terceros, no documentado por Neon, así que de
> todos modos vale **revisar el consumo real el primer mes** en los dos paneles.

### Los respaldos son el verdadero riesgo, no el arranque

Los planes gratuitos **no hacen respaldos automáticos**, y la recuperación a un punto en el
tiempo de Neon en el plan gratuito es de pocas horas. El plan de backend (§13) pide respaldo
diario probado, y acá no hay servidor donde programarlo.

**Solución gratis, y ya está hecha:** [`.github/workflows/respaldo.yml`](../.github/workflows/respaldo.yml)
corre `pg_dump` una vez al día contra Neon y guarda el resultado como artefacto del
repositorio, **cifrado con AES-256** (el volcado incluye los hashes de las contraseñas de las
usuarias, así que se cifra pase lo que pase con la visibilidad del repositorio). Si el volcado
sale truncado, el workflow falla en vez de subir un archivo inútil: un respaldo vacío es peor
que ninguno, porque da falsa tranquilidad.

Esto no es opcional. El servidor durmiéndose es una molestia; la base evaporándose, no.

**Lo que sigue siendo distinto respecto al VPS:**

- Al quedar en dominios distintos se rompe el "mismo dominio" del diseño. Ya está resuelto:
  la cookie se marca según `COOKIE_SAMESITE` y el frontend se compila con `VITE_API_URL`
  (§7.2 y §7.4). Pero es más frágil que el mismo dominio, y un navegador con las cookies de
  terceros bloqueadas a mano no deja entrar.
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

### Lo que hay que hacer al desplegar — y qué cambió al elegir la opción B

Esta lista estaba escrita pensando en el VPS. Al elegir la opción gratuita, **dos de sus
puntos se invirtieron**, y vale dejarlo anotado porque son justo los que uno copiaría sin
pensar.

1. ~~**Compilar en la computadora, no en el servidor.**~~ **Ya no aplica así.** Render compila
   en su propia máquina: es como funciona el blueprint, y no gasta nada del hosting del
   colegio. Lo que sí se compila localmente es el **frontend** (§7.4), porque el hosting solo
   sabe servir archivos.
2. ~~**Instalar sin dependencias de desarrollo:** `npm ci --omit=dev`.~~ **En Render es al
   revés.** Render pone `NODE_ENV=production` en los servicios de Node, y con eso `npm ci`
   se salta por su cuenta las `devDependencies` — que es donde viven TypeScript y el CLI de
   Prisma, los dos necesarios *para compilar*. De ahí que el `buildCommand` diga
   `npm ci --include=dev`. Sin eso el despliegue falla con `tsc: not found`. Era buen consejo
   para un VPS, donde sube el `dist/` ya compilado.
3. **Limitar el pool de conexiones de Prisma.** ✔ **Hecho**: la cadena de Neon lleva
   `connection_limit=5` (§7.1). Por omisión Prisma abre `núcleos × 2 + 1`, que acá no hace
   falta y en la base remota solo son conexiones ocupadas de gusto.
4. **Limitar la memoria de Node.** ✔ **Hecho**: `npm start` arranca con
   `--max-old-space-size=320`. La instancia gratuita de Render tiene 512 MB, así que el
   proceso falla rápido en vez de que lo mate el sistema a media venta.
5. **Cabeceras de caché para los estáticos.** ✔ **Hecho**: están en
   [`web/public/.htaccess`](../web/public/.htaccess). Los archivos del build llevan hash en el
   nombre (`index-UoxYfM9x.js`), así que se cachean un año; `index.html`, nunca.
6. **Optimizar las fotos de los uniformes.** ✔ **Hecho**: §6, de 21.3 MB a 1.3 MB.
7. **Compilar solo `src/` para producción.** ✔ **Hecho**: `tsconfig.build.json`. El
   `tsconfig.json` principal incluye además `prisma/`, `tests/` y `scripts/` porque sirve
   para revisar tipos de todo el proyecto; compilando con él, las pruebas y el seed terminaban
   dentro de `dist/` y el servidor salía en `dist/src/server.js` en vez de donde lo busca
   `npm start`. Era un despliegue roto que no se veía ni en desarrollo ni en las pruebas.

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

## 7. Guía de despliegue, paso a paso

Hay que tocar cinco lugares, **en este orden**: GitHub (subir el código), Neon (la base),
Render (el backend), otra vez la computadora (compilar la página) y el hosting del colegio
(subirla). El orden no es capricho: **la URL de Render queda incrustada dentro del JavaScript
compilado**, así que la página no se puede compilar —ni mandar a nadie— hasta que el backend
exista.

Lo que ya quedó decidido y no hay que volver a pensar:

| | |
|---|---|
| Subdominio | `https://inventario.ccsf2.edu.gt`, confirmado, con HTTPS funcionando |
| Repositorio | `Qu3zada22/inventarioSF2`, **público** (ver §7.5) |
| Región | Neon en **AWS us-east-1** y Render en **Virginia**: tienen que ser la misma |

Hace falta tener a mano: acceso al panel del hosting —o alguien que lo tenga— y un correo para
las cuentas de Neon y Render, que son gratuitas.

Lo que ya está escrito en el repositorio y no hay que inventar:

| Archivo | Qué hace |
|---|---|
| [`render.yaml`](../render.yaml) | Toda la configuración del backend en Render |
| [`.github/workflows/ping.yml`](../.github/workflows/ping.yml) | El ping en horario de colegio |
| [`.github/workflows/respaldo.yml`](../.github/workflows/respaldo.yml) | El respaldo diario cifrado |
| [`web/public/.htaccess`](../web/public/.htaccess) | Las rutas, la compresión y el caché en el hosting |

---

### 7.0 GitHub — subir el código

**Render despliega desde GitHub, no desde tu computadora.** Si el repositorio no está al día,
Render construye la versión vieja: sin `render.yaml`, sin los workflows y sin el campo de NIT.
Es el error más fácil de cometer y el más difícil de ver, porque Render dice "deploy exitoso"
igual.

```bash
git push origin main
```

Para comprobarlo, en GitHub tiene que verse `render.yaml` en la raíz y la carpeta
`.github/workflows/` con `ping.yml` y `respaldo.yml`. Si no están ahí, no sigas: nada de lo
que viene va a funcionar.

---

### 7.1 Neon — la base de datos

1. En **neon.com**, nuevo proyecto:
   - **Región: AWS us-east-1 (N. Virginia).** Tiene que ser esta, porque es la misma región
     donde queda el backend en Render. Si la base y el backend caen en costas opuestas, cada
     consulta cruza el país y se nota en cada venta.
   - **PostgreSQL 17**, la misma versión que corre en desarrollo y en las pruebas.
2. Copiar la cadena de conexión **directa**: la que **NO** dice `-pooler`. El pooler de Neon
   trabaja en modo transacción, y este sistema usa `SELECT ... FOR UPDATE` dentro de
   transacciones para que dos maestras no vendan la misma última talla; por el pooler eso se
   vuelve impredecible.
3. Agregarle `&connection_limit=5` al final. Render corre una sola instancia y Prisma, si no
   se le dice nada, abre un montón de conexiones que acá no hacen falta:

   ```
   postgresql://USUARIO:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require&connection_limit=5
   ```

**Esa cadena se usa en tres lugares** (Render, el seed de la primera vez, y el secreto del
respaldo en GitHub), así que conviene dejarla a mano — y en ningún archivo del repositorio.

---

### 7.2 Render — el backend

1. Generar el secreto de sesión. Con cualquier otro valor las sesiones de todas las usuarias
   se invalidan cada vez que se reinicie el servicio:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

2. **`render.yaml` ya viene con el subdominio correcto**, así que no hay que tocarlo. Para
   que conste: `CORS_ORIGINS` y `MEDIA_BASE_URL` apuntan los dos a `https://inventario.ccsf2.edu.gt`
   —el dominio de la **página**, no el de la API— y van **sin barra final**. El navegador manda
   el origen sin barra, y si no coincide carácter por carácter, el login responde bien y la
   pantalla siguiente rebota al login, que es de los errores más desconcertantes que hay.
3. En **render.com**: `New` → `Blueprint` → elegir el repositorio. Render lee `render.yaml` y
   pide los dos valores que no están ahí: `DATABASE_URL` (la cadena del paso 7.1) y
   `SESSION_SECRET` (el del paso 1).
4. El primer despliegue tarda unos minutos. Aplica las migraciones él solo, como parte del
   build; si una migración falla, el build falla y no sube nada roto.
5. Copiar la URL del servicio, algo como `https://inventario-ccsf2-api.onrender.com`.
6. Comprobar los dos extremos antes de seguir:

   ```bash
   curl https://inventario-ccsf2-api.onrender.com/health
   curl https://inventario-ccsf2-api.onrender.com/health/db
   ```

   El primero tiene que decir `"ambiente":"production"` — si dice `development`, quedó mal una
   variable y la cookie va a salir sin `Secure`. El segundo es el que confirma que el backend
   de verdad alcanza a Neon.

---

### 7.3 La primera usuaria y el catálogo — el seed

El plan gratuito de Render no da consola, así que el seed se corre **desde tu computadora**
apuntando a Neon. Es idempotente: no duplica ni pisa precios o existencias ya ajustados a
mano, pero igual esta es la única vez que se corre contra la base de verdad.

```powershell
$env:DATABASE_URL = "postgresql://...&connection_limit=5"
$env:SEED_ADMIN_PASSWORD = "la-que-va-a-usar-la-directora"
npm run seed
Remove-Item Env:\DATABASE_URL, Env:\SEED_ADMIN_PASSWORD
```

Deja creados los niveles, los grados, el ciclo escolar, el catálogo de uniformes con sus
tallas, las bolsas de útiles y la usuaria `admin`.

> **Dos cosas que quedan mal a propósito y hay que corregir desde la aplicación**, porque el
> seed no las puede saber:
>
> - **Los precios son inventados.** El sitio anterior tenía Q 1.00 en todas las tallas, que
>   eran valores de prueba. Hay que poner los reales desde la pantalla de catálogo.
> - **Las existencias son de ejemplo.** Lo correcto es hacer un **conteo físico** desde
>   *Inventario → Conteo*: eso deja el stock en lo que de verdad hay en la bodega y queda
>   registrado como un conteo, con su motivo y su fecha.
>
> Y que la directora **cambie la contraseña de `admin`** desde la pantalla de usuarias, para
> que no quede la que se escribió en esa línea de comandos.

---

### 7.4 El hosting del colegio — la página

1. Compilar el frontend **con la URL de Render puesta**:

   ```powershell
   cd web
   $env:VITE_API_URL = "https://inventario-ccsf2-api.onrender.com"
   npm run build
   Remove-Item Env:\VITE_API_URL
   ```

   **Vite incrusta esa URL dentro del JavaScript compilado.** No es un archivo de
   configuración que se pueda editar en el servidor: si algún día cambia la dirección del
   backend, hay que volver a compilar y volver a subir.

2. **Vaciar la carpeta del subdominio** antes de subir nada. Ahí vive todavía el proyecto del
   alumno, y subir encima no lo borra: `index.html` se reemplaza, pero todo lo demás sigue
   servido. En particular `ims.js`, que publica contraseñas del personal en texto plano y a
   octubre de 2026 seguía respondiendo 200. Y como el `.htaccess` solo manda a `index.html` lo
   que **no** corresponde a un archivo real, un `ims.js` que quede ahí se seguiría sirviendo
   tal cual, con la aplicación nueva funcionando por encima y nadie enterándose.

   > Borrar el archivo no deshace lo ya expuesto: esas contraseñas estuvieron públicas y hay
   > que cambiarlas donde se usen. Las usuarias del sistema nuevo son independientes, así que
   > no heredan el problema — pero que nadie reutilice la vieja al crear su cuenta.

3. Subir **todo** el contenido de `web/dist/` a la carpeta ya vacía. Son unos 1.7 MB contando
   las fotos.

   > **El `.htaccess` es un archivo oculto.** En FileZilla hay que activar
   > *Servidor → Forzar mostrar archivos ocultos*, y en el administrador de archivos de
   > Hostinger, la opción equivalente. Si no se sube, la aplicación parece funcionar hasta que
   > alguien recarga la página.

4. Comprobar que subió bien: escribir `https://inventario.ccsf2.edu.gt/corte` **directo en la
   barra de direcciones**, no navegando desde el menú. Si sale la pantalla de corte (o el login), el
   `.htaccess` está puesto. Si sale un 404 del servidor, no subió.

---

### 7.5 GitHub — el ping y el respaldo

En el repositorio, `Settings` → `Secrets and variables` → `Actions`:

| Dónde | Nombre | Valor |
|---|---|---|
| **Variables** | `URL_BACKEND` | La URL de Render (`https://...onrender.com`) |
| **Secrets** | `DATABASE_URL` | La cadena directa de Neon |
| **Secrets** | `RESPALDO_PASSPHRASE` | Una clave larga, **guardada aparte** |

> **La `RESPALDO_PASSPHRASE` no se puede perder.** Es lo único con lo que se descifran los
> respaldos; sin ella los archivos no sirven para nada. Que viva en el gestor de contraseñas
> de la directora, no solo en GitHub.

> **El repositorio es público, y eso corta para los dos lados.**
>
> A favor: GitHub Actions no cobra minutos en repositorios públicos, así que el ping cada 10
> minutos sale gratis sin pensarlo.
>
> En contra: **los artefactos del respaldo los puede descargar cualquiera.** Por eso el
> volcado va cifrado con AES-256 y no en claro — el volcado trae los hashes de las contraseñas
> de las usuarias. Con el repositorio público, esa passphrase es lo único que separa el
> inventario del colegio de cualquier persona en internet: que sea larga y que no se use en
> ningún otro lado.
>
> Si en algún momento lo pasan a privado, **el ping de GitHub Actions deja de servir**: son 72
> ejecuciones al día por 26 días, y GitHub cobra un minuto mínimo por ejecución, o sea 1,872
> de los 2,000 minutos gratis mensuales. Con el respaldo encima, se pasa. En ese caso hay que
> mover el ping a cron-job.org (§7.7), que además resuelve lo de los 60 días.

Después, en la pestaña `Actions`, correr **Ping** y **Respaldo** a mano una vez
(`Run workflow`). Es la forma de saber que están bien configurados sin esperar a que toque el
horario.

---

### 7.6 Comprobar que todo quedó

En este orden, porque cada uno descarta una cosa distinta:

1. `/health` responde `"ambiente":"production"` → el backend está arriba y bien configurado.
2. `/health/db` responde bien → el backend alcanza Neon.
3. Entrar a la página y **loguearse** → la cookie entre dominios funciona. Si el login
   responde pero la pantalla siguiente se va al login otra vez, el problema es
   `COOKIE_SAMESITE` o `CORS_ORIGINS`, no las credenciales.
4. **Hacer una venta de prueba y anularla** → las transacciones y el stock funcionan contra
   Neon. Queda registrada como anulada, con su motivo, que es justo como debe quedar.
5. **Ver una foto de uniforme** en la pantalla de venta → `MEDIA_BASE_URL` apunta bien.
6. Bajar el artefacto del respaldo y **restaurarlo contra la base local** (§7.8).

---

### 7.7 Lo que hay que vigilar — y el calendario del colegio juega en contra

**GitHub apaga los workflows programados después de 60 días sin actividad en el repositorio.**
De febrero a octubre nadie va a estar tocando este código, así que es exactamente cuando se
van a apagar: el ping y el respaldo dejan de correr justo en los meses tranquilos, y para
noviembre ya nadie se acuerda. GitHub avisa por correo antes de apagarlos.

Dos salidas, y conviene tomar las dos:

- **Para el ping, pasarlo a cron-job.org.** Es gratis, no tiene esa regla, y hace exactamente
  lo mismo: un `GET` a `https://...onrender.com/health` cada 10 minutos, con el horario
  limitado de 6:00 a 18:00, lunes a sábado. Si se hace esto, el workflow `ping.yml` se puede
  borrar.
- **Para el respaldo, dejarlo en GitHub** (necesita los secretos) y, cuando llegue el correo
  de GitHub, entrar a `Actions` y darle *Enable workflow*. Lo mismo pasa corriendo cualquier
  workflow a mano una vez cada dos meses.

Y una vez al mes, durante la temporada: mirar las horas gastadas en el panel de Render y las
CU-hours en el de Neon. Los dos tienen la cuenta a la vista.

---

### 7.8 Cómo se restaura un respaldo

Esto es la otra mitad del respaldo, y la que casi nadie hace: **un respaldo que nunca se
probó no es un respaldo**. Conviene hacerlo una vez ahora, contra la base local de Docker, y
no descubrirlo en enero.

Bajar el artefacto de la pestaña `Actions` del workflow **Respaldo**, y:

```bash
gpg --output respaldo.sql.gz --decrypt respaldo-2026-11-15.sql.gz.gpg
gunzip respaldo.sql.gz
psql "postgresql://inventario:inventario_dev@localhost:5433/inventario" < respaldo.sql
```

Pide la `RESPALDO_PASSPHRASE` al descifrar. Para restaurar contra Neon de verdad, la última
línea va con la cadena de Neon en vez de la local — pero eso solo se hace si pasó algo, y
sobre una base vacía.

---

### 7.9 Lo que cuesta mantener esto

| | |
|---|---|
| Dinero | **Q 0** |
| Atención, en temporada (nov–ene) | mirar las dos cuotas una vez al mes |
| Atención, fuera de temporada | reactivar los workflows cuando GitHub avise, cada dos meses |
| Lo que no se puede perder | la `RESPALDO_PASSPHRASE` y el `SESSION_SECRET` |

Si algún día el colegio decide pagar el VPS (~Q 40 al mes), **todo esto desaparece**: una sola
pieza, respaldos del proveedor, sin cuotas que vigilar y sin workflows que se apaguen solos.
La comparación completa está en §4.

---

## 8. Resumen

- **El hosting actual no puede correr este backend.** No por falta de Node: porque no permite
  dejar un proceso corriendo, que es lo que un backend necesita para existir.
- **El precedente del alumno solo probaba hosting estático**, no Node ni base de datos.
- **Se eligió la opción gratuita (B):** frontend en el hosting que ya tienen, backend en
  Render, base en **Neon** (la única de las tres que no caduca ni se pausa sola).
- **El ping va solo en horario de colegio**, no 24/7: las horas gratuitas de Render se gastan
  teniendo el servidor despierto, y agotarlas suspende el servicio hasta el mes siguiente.
- **Los respaldos, que eran lo único no opcional que faltaba, ya están**: un workflow diario
  que corre `pg_dump` contra Neon y guarda el volcado cifrado. Lo que falta es *probar una
  restauración* (§7.8), porque un respaldo sin probar no cuenta.
- **El calendario del colegio juega en contra del cron de GitHub**: apaga los workflows
  programados tras 60 días sin actividad en el repositorio, y de febrero a octubre no hay
  actividad. El ping conviene moverlo a cron-job.org (§7.7).
- El VPS (~Q 40 al mes) sigue siendo la opción más simple de mantener si algún día el colegio
  decide pagarlo: una pieza en vez de tres, y sin cuotas que vigilar.
- El hosting actual **no se tira**: puede seguir con el sitio del colegio, y el inventario vive
  en un subdominio apuntado al VPS.
- **La optimización más grande no es del código: son las fotos** (21.3 MB → menos de 2 MB).
- Y hay que **cambiar las contraseñas** que el sitio anterior publicó en su JavaScript.
