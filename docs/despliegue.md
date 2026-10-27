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

## 3. Lo que hay que confirmar en el panel (10 minutos)

Tres preguntas, y las tres se responden entrando a hPanel:

1. **¿Hay Node.js?** Buscar en el panel una sección "Node.js" (a veces bajo *Avanzado*, o
   "Setup Node.js App" si es cPanel). Si no aparece, el plan no corre Node.
2. **¿Qué bases de datos ofrece?** Entrar a *Bases de datos*. Casi con seguridad dice
   **MySQL**. Si no aparece PostgreSQL por ningún lado, no lo hay.
3. **¿Hay acceso SSH?** *Avanzado → Acceso SSH*. El plan Business suele incluirlo.

**Lo que ya se puede dar por descartado sin preguntar: Docker.** Ningún hosting compartido
da Docker, porque eso exige permisos de root sobre la máquina, y la máquina es compartida
con otros clientes. Así que **"copiar el repo y levantar docker" no es una opción aquí**.
El `docker-compose.yml` del proyecto seguirá siendo solo para desarrollo en tu computadora.

## 4. Las opciones, de menos a más trabajo

### A. VPS de Hostinger — *la recomendada*

Hostinger vende VPS desde unos **USD 5–7 al mes**, en la misma cuenta donde ya está el
dominio. Con eso:

- Todo lo construido corre **tal cual**: Docker, PostgreSQL, nginx, HTTPS, el servicio que se
  reinicia solo. Se sigue §13 del plan de backend y ya.
- **Cero reescritura.** Ni una línea de SQL cambia.
- El dominio `inventario.ccsf2.edu.gt` se apunta al VPS; el hosting actual se queda con lo
  que ya tiene.

Es la opción con menos trabajo total y menos riesgo. Lo que cuesta es el alquiler mensual.

### B. Node en el hosting actual + PostgreSQL gestionado afuera

Solo si la respuesta 1 es "sí hay Node".

- El backend corre en el hosting compartido; la base de datos vive en un **PostgreSQL
  gestionado gratuito** (Neon o Supabase tienen plan gratis que le sobra a un colegio:
  hablamos de miles de filas, no millones).
- **También cero reescritura de SQL**: solo cambia `DATABASE_URL`.
- Contra: una dependencia más, y cada consulta cruza internet en lugar de ir a `localhost`.
  Para esta carga —unas pocas personas vendiendo— es perfectamente usable.

### C. Node en el hosting actual + MySQL del mismo hosting

Solo si hay Node y se prefiere no depender de un tercero.

- Hay que **portar las consultas** que son específicas de PostgreSQL. No es todo el backend,
  pero tampoco es poco:

  | Qué | Dónde |
  |---|---|
  | `TIMESTAMPTZ` en 10 columnas | `prisma/schema.prisma` y su migración |
  | `AT TIME ZONE` para agrupar por día | `reportes.service.ts` |
  | `COUNT(*) FILTER (WHERE ...)` | `reportes.service.ts` (4 consultas) |
  | `nextval('venta_correlativo_seq')` | `ventas.service.ts` → `AUTO_INCREMENT` o tabla contador |
  | `::int`, `to_char`, `COALESCE(...)::int` | los `$queryRaw` de reportes e inventario |
  | `SELECT ... FOR UPDATE` | funciona igual en InnoDB ✔ |

  Lo bueno: el bloqueo pesimista, las transacciones y los `CHECK` funcionan en MySQL 8. Lo
  malo: es un día de trabajo y hay que volver a correr las 93 pruebas contra MySQL.

### D. Reescribir en PHP

Si el hosting resulta ser solo PHP + MySQL y no se quiere pagar un VPS.

- El **modelo de datos, las reglas de negocio y el contrato de API de este proyecto siguen
  sirviendo completos**: están escritos aparte del lenguaje, a propósito.
- Pero es reescribir el backend entero (Laravel). Semanas, no días. Y las 93 pruebas se
  vuelven a escribir.

**Mi recomendación: A.** Si el colegio no puede pagar el VPS, **B** si hay Node, y **D**
solo como último recurso.

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

## 6. Las fotos de los uniformes

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

**Qué hacer:** generar dos versiones de cada foto y subir solo esas.

| Uso | Tamaño | Peso estimado |
|---|---|---|
| Miniatura en la lista de venta | 200 px de ancho | ~15 KB |
| Vista de la prenda | 800 px de ancho | ~80 KB |

De 21.3 MB se baja a **menos de 2 MB en total**, sin que se note ninguna diferencia en
pantalla. Los originales se guardan aparte, fuera del servidor.

> El `.rar` con las fotos no lo pude abrir: esta computadora no tiene 7-Zip ni WinRAR. Si
> trae originales distintos o mejores, pasámelo como `.zip` y lo reviso.

---

## 7. Resumen

- **Docker queda descartado** en el hosting actual. No es que sea difícil: no se puede.
- **El precedente del alumno solo prueba hosting estático**, no Node ni base de datos.
- **Falta confirmar tres cosas en el panel** (§3) antes de decidir.
- **La recomendación es un VPS**: cero reescritura, y el plan de despliegue ya está escrito.
- **La optimización más grande no es del código: son las fotos** (21.3 MB → menos de 2 MB).
- Y hay que **cambiar las contraseñas** que el sitio anterior publicó en su JavaScript.
