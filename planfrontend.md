# Plan de frontend — Inventario CCSF2 (React + Vite)

> Para quien trabaje en la interfaz. El backend está terminado y probado (93 pruebas), y el
> **frontend está completo: las seis fases** (ver §6). El proyecto vive en `web/` y cubre
> sesión, venta, recibo, listado de ventas con anulación, corte de caja, catálogo de uniformes
> y bolsas, inventario completo (existencias, entradas, conteo físico, kardex y alertas),
> reportes con exportación y administración de usuarios. Ya no queda ninguna pantalla
> marcada como pendiente.
>
> Lo que falta para que esto se use de verdad no es código, es el **despliegue**:
> ver [docs/despliegue.md](docs/despliegue.md).
>
> Documentos hermanos:
> - [README.md](README.md) — cómo levantar el backend y la lista de endpoints.
> - [docs/plan-backend.md](docs/plan-backend.md) — el diseño y el por qué de cada decisión.
> - `openapi.json` — el contrato, generado del código. **Empezá por aquí.**

---

## 1. Qué es este sistema, en un minuto

El colegio vende dos cosas en una ventanilla: **uniformes** (por talla) y **bolsas de útiles**
(una bolsa completa por grado, nunca útiles sueltos). El sistema lleva el control de lo que
entra, lo que se vende y lo que queda.

**Dos usuarios muy desiguales, y la interfaz tiene que reflejar eso:**

| | `ADMIN` — la administradora, una | `VENDEDOR` — las maestras, varias |
|---|---|---|
| Qué hace | Ingresa todo: prendas, bolsas, precios, existencias, ajustes. Anula ventas. Ve reportes. | **Solo vende.** |
| Cuántas pantallas necesita | Muchas | Básicamente **una** |

Esa asimetría es el dato de diseño más importante del proyecto. La maestra tiene **una sola
operación de escritura en todo el backend**: `POST /ventas`. Su interfaz debería ser una
pantalla que se aprende en dos minutos y se usa con cola de gente esperando. La de la
administradora puede ser densa, porque la usa sentada y con tiempo.

No hay acceso para los papás. No por ahora.

---

## 2. Lo que hay que entender antes de escribir código

Siete reglas del backend que, si se ignoran, producen bugs raros:

1. **El dinero viaja en centavos enteros.** `Q 125.50` es `12550`. Nunca hay decimales en la
   API. Formateá solo al mostrar, y hacé las sumas en centavos:
   ```ts
   const aQuetzales = (centavos: number) => (centavos / 100).toFixed(2); // "125.50"
   ```
   Si en algún momento aparece un `.5` en un total, es que alguien dividió antes de sumar.

2. **Se vende con `itemId`**, no con el id de la variante ni el de la bolsa. El `itemId` es la
   unidad de inventario y funciona igual para una talla de polo que para una bolsa de 4to
   primaria. Esto hace que el carrito sea **una sola lista homogénea**: no hace falta un
   componente distinto para uniformes y otro para bolsas.

3. **La sesión va en una cookie `httpOnly`.** No hay token que guardar, ni `Authorization`, ni
   refresh. Solo `credentials: 'include'` en cada petición. No intentés leer la cookie desde
   JS: no podés, y es a propósito.

4. **`POST /ventas` exige la cabecera `Idempotency-Key`.** Un UUID por *intento de venta*,
   reusado en los reintentos. Si la clave ya se usó, el backend responde `200` con la venta
   original en vez de cobrar otra vez. Esto es lo que hace que el doble clic en "Cobrar" sea
   inofensivo — **pero solo si el frontend reusa la clave**.

5. **El contenido de toda respuesta correcta va en `data`**, y cuando `data` es una lista, los
   metadatos (`meta`, `resumen`, `totales`, `notas`) van como hermanos (§4.1). Todos los
   errores son `{ error: { code, message, details? } }`. **Reaccioná por `code`**, nunca
   parseando el mensaje (§7 trae la tabla).

6. **El permiso lo decide el backend.** Esconder un botón es cortesía, no seguridad: la
   maestra que llame el endpoint a mano recibe `403` igual. Usá `usuario.rol` para decidir qué
   mostrar, pero no asumas que eso protege nada.

7. **Lo que viene ordenado, no lo reordenes.** Las tallas llegan en orden de dominio
   (`XS, S, M, L, XL` y `28, 30, 32...`). Si las ordenás alfabéticamente te queda
   `L, M, S, XL, XS`. Ya está resuelto del lado del servidor.

---

## 3. Arrancar

### El backend, local

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run db:up            # Postgres en Docker, puerto 5433
npm run migrate:deploy
npm run seed             # catálogo real + 3 usuarios
npm run dev              # http://127.0.0.1:3000
```

El seed crea `admin` (administradora) y `lucia.m` / `ana.c` (maestras). **La contraseña de los
tres es el valor de `SEED_ADMIN_PASSWORD` en el `.env`.** Con esos dos roles podés ver las dos
interfaces desde el primer día.

Para explorar la API a mano: `http://127.0.0.1:3000/api/v1/docs` (Swagger UI, solo en
desarrollo).

### Los tipos

```bash
npm run openapi                                        # regenera openapi.json
npx openapi-typescript openapi.json -o src/tipos-api.ts
```

Los esquemas del `openapi.json` se generan de los mismos objetos Zod que validan las
peticiones en el servidor, así que no pueden mentir sobre lo que la API acepta.

> Una limitación honesta: las **respuestas** están documentadas como el sobre (`{ data }`), no
> campo por campo. Los tipos de petición te van a quedar exactos; los de respuesta, flojos.
> Si los querés exactos, pedíselos al del backend: el TypeScript ya los tiene inferidos y se
> pueden exportar.

### El proyecto

```bash
npm create vite@latest web -- --template react-ts
```

Dentro de `web/`, lo que recomiendo y por qué:

| Para | Qué | Por qué |
|---|---|---|
| Rutas | `react-router-dom` | Lo estándar; nada exótico hace falta. |
| Datos del servidor | `@tanstack/react-query` | **Casi todo el estado de esta app es estado del servidor.** React Query te da caché, revalidación y estados de carga sin escribirlos. |
| Estado global | *ninguno* | No hace falta Redux ni Zustand: el único estado verdaderamente global es el usuario de la sesión, y eso es un contexto de diez líneas. El carrito vive en la pantalla de venta. |
| Formularios | `react-hook-form` + `zod` | Los formularios de catálogo tienen varios campos; validar en el cliente evita viajes, aunque **el backend valida igual**. |
| Estilos | Tailwind | Rápido para pantallas densas de tablas y formularios. Si preferís CSS plano, igual funciona. |
| Fechas | `date-fns` | Solo para formatear. Ojo: zona `America/Guatemala`. |

**No instales** librerías de tablas pesadas ni un design system completo al principio. Son
unas quince pantallas, la mayoría listas y formularios.

### El proxy de Vite (importante)

Poné el backend detrás de `/api` en desarrollo, para que la cookie sea del mismo origen y no
pelees con CORS:

```ts
// web/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
});
```

Así `fetch('/api/v1/...')` funciona igual en desarrollo y en producción, donde el build se
sirve desde el mismo dominio que la API. (El backend también acepta `http://localhost:5173`
por CORS con credenciales, pero el proxy es menos frágil y se parece a producción.)

---

## 4. El cliente de API

Escribí esto una vez y que todo lo demás lo use. Es casi todo el "plumbing" que necesitás:

```ts
// web/src/api/cliente.ts
export class ErrorApi extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T>(
  ruta: string,
  opciones: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { idempotencyKey, ...resto } = opciones;

  const respuesta = await fetch(`/api/v1${ruta}`, {
    ...resto,
    credentials: 'include', // la sesión va en cookie: sin esto, todo responde 401
    headers: {
      ...(resto.body ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      ...resto.headers,
    },
  });

  if (respuesta.status === 204) return undefined as T;

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const error = cuerpo?.error;
    throw new ErrorApi(
      error?.code ?? 'ERROR_INTERNO',
      error?.message ?? 'Ocurrió un error inesperado',
      respuesta.status,
      error?.details,
    );
  }

  return cuerpo?.data as T;
}
```

Con eso, un `401` en cualquier lugar significa "mandá al login" y se puede manejar en un solo
lugar (un interceptor en React Query o un `onError` global).

### 4.1 Las formas de respuesta

Una sola regla: **el contenido va en `data`**, y si `data` es una lista, los metadatos van
como **hermanos** de `data`, nunca dentro. De ahí salen dos formas:

**a) Un recurso, o una lista sin metadatos.** El `api<T>()` de arriba devuelve justo lo que
querés:

```
GET  /uniformes/prendas        -> { data: [prendas] }
GET  /ventas/:id               -> { data: venta }
POST /ventas                   -> { data: venta }
GET  /reportes/corte-caja      -> { data: corte }   // el corte es un objeto, no una lista
```

**b) Una lista con metadatos.** Aquí `api<T>()` te devolvería solo las filas y perderías
`meta`. Para estos usá una segunda función que devuelva el cuerpo completo — el mismo `fetch`
sin el `cuerpo.data` del final:

```
GET /ventas                            -> { data: [ventas],      meta, resumen }
GET /inventario                        -> { data: [items],       meta }
GET /inventario/alertas                -> { data: [items],       resumen }
GET /inventario/:id/kardex             -> { data: [movimientos], item, periodo, meta }
GET /reportes/ventas                   -> { data: [filas],       agrupadoPor, periodo, totales, notas }
GET /reportes/tallas-mas-vendidas      -> { data: [filas],       periodo, nota }
GET /reportes/existencias-valorizadas  -> { data: [filas],       totales, advertencia }
GET /reportes/bolsas-por-grado         -> { data: [filas],       nota, totales }
```

En la práctica: `api<T>()` para (a) y `apiConMeta<T>()` para (b). Dos funciones de diez líneas
y el resto del código no se vuelve a preguntar dónde está qué.

---

## 5. Las pantallas, por orden de importancia

### 5.1 Login
`POST /auth/login` con `{ usuario, password }`. El usuario es corto (`lucia.m`), **no un
correo**: no todas las maestras tienen email.

Al cargar la app, `GET /auth/me`: `200` hay sesión, `401` mostrá el login. Eso es todo el
manejo de sesión.

Cuidá dos errores específicos: `DEMASIADOS_INTENTOS` (bloqueo por 15 minutos tras 5 fallos —
mostrá los minutos que vienen en `details.segundosRestantes`) y el mensaje genérico de
credenciales, que **a propósito** no dice si el usuario existe. No lo "mejores" con un
"usuario no encontrado".

### 5.2 Punto de venta — *la pantalla que más importa*

Es la única que usa una maestra, con gente esperando. Diseñala para eso:

- **Buscar y agregar rápido.** Un campo de búsqueda con foco automático que filtre prendas y
  bolsas al mismo tiempo (`GET /uniformes/prendas` + `GET /bolsas?ciclo=2026`). Que se pueda
  usar con teclado de principio a fin: escribir, Enter, escribir, Enter, cobrar.
- **La búsqueda calza por principio de palabra, no por subcadena.** Esto se descubrió
  probando: con subcadena, escribir `polo m` también encontraba la talla **L**, porque la
  categoría "Uniforme de diario" contiene una "m" — y como Enter agrega el primer resultado,
  despachaba la talla equivocada sin que nadie lo notara. Cada palabra escrita tiene que ser
  el principio de alguna palabra del producto (`src/venta/vendibles.ts`).
- **No reordenar lo que el backend ya ordenó.** Las tallas vienen XS, S, M, L, XL; ordenar
  por texto las deja L, M, S, XL, XS. El orden del catálogo se conserva y solo se mueven los
  agotados al final.
- **Las tallas agotadas se muestran, deshabilitadas.** Vienen con `disponible: false`. No las
  escondas: la vendedora necesita ver que esa talla existe y hay que pedirla. Si la agrega
  igual, el backend responde `409 STOCK_INSUFICIENTE` con `details.disponible`.
- **El carrito es una lista homogénea** de `{ itemId, descripción, cantidad, precioCentavos }`.
  Uniformes y bolsas se ven igual porque el backend los trata igual.
- **No mandes precios.** Los pone el servidor. Mostrá el que viene en el catálogo, pero el
  total autoritativo es el de la respuesta de la venta.
- **Generá la `Idempotency-Key` cuando se abre la venta** (`crypto.randomUUID()`), guardala en
  el estado de la pantalla, y **reusala en todos los reintentos**. Clave nueva solo al empezar
  una venta nueva. Deshabilitá el botón mientras la petición está en vuelo, pero no confíes
  solo en eso: la clave es la red de seguridad real.
- Campos: método de pago (`EFECTIVO`, `TRANSFERENCIA`, `DEPOSITO`, `TARJETA`), nombre del
  comprador (opcional), referencia de pago (opcional), descuento en centavos (opcional).
- Al terminar, mostrá el **recibo** y el botón de imprimir.

### 5.3 Recibo
`GET /ventas/:id/recibo` trae los datos listos. Hacelo imprimible con `window.print()` y un
bloque `@media print` que esconda la navegación. No hace falta PDF: el navegador imprime bien.

### 5.4 Mis ventas (maestra) / Todas las ventas (admin)
`GET /ventas?desde=&hasta=&estado=&page=`. **Es el mismo endpoint para los dos roles**: a una
maestra el backend le devuelve solo las suyas, aunque la URL pida otras. No armes dos
pantallas; armá una y que el título diga de quién son.

Una venta ajena responde `404`, no `403`. Si la maestra llega a un id que no es suyo, mostrale
"no existe".

### 5.5 Corte de caja
`GET /reportes/corte-caja?fecha=YYYY-MM-DD`. Es el único reporte que ve una maestra, y solo el
suyo. Lo que tiene que resaltar en pantalla es **`aEntregarEnEfectivoCentavos`**: lo que debe
entregar en mano. El resto (transferencias, depósitos) ya está en el banco y no se entrega.

Mostrá también las anuladas del día, que vienen aparte, para que los números se puedan
explicar.

### 5.6 Catálogo de uniformes (admin)
Lista de prendas por categoría (`DIARIO`, `FISICA`), cada una con sus tallas: precio, costo,
existencia, mínimo. CRUD con `POST/PATCH /uniformes/prendas` y `PATCH /uniformes/variantes/:id`.

**No existe un campo de existencias editable, y no lo inventes.** El stock solo se mueve con
un movimiento de inventario (§5.8). Si mandás `stockActual`, el backend lo ignora y responde
`400`.

Los precios del seed son de ejemplo: la primera tarea real de la administradora va a ser
corregirlos todos. Hacé que editar un precio sea rápido (edición en línea en la tabla, no un
modal por talla).

### 5.7 Bolsas de útiles (admin)
Una bolsa por grado y ciclo. Pantalla por bolsa con: precio, costo, existencia y la **lista de
útiles**, que es informativa y **puede estar vacía**.

- La lista se guarda **completa de una vez**, no línea por línea:
  `PUT /bolsas/:id/contenido` con `{ contenido: [{ descripcion, cantidad, unidad? }] }`, y el
  orden del arreglo es el orden en que se imprime. Armá un editor donde se agreguen, borren y
  reordenen filas, con un solo botón de guardar.
- `POST /bolsas/:id/duplicar` clona la bolsa a otro ciclo con stock en 0: es como se arma el
  catálogo cada año. Ponelo visible, ahorra una hora de tecleo.
- `GET /bolsas/:id/lista` da la versión para imprimir y entregarle al papá.

### 5.8 Inventario (admin)
Cuatro pantallas sobre `/inventario`:

- **Existencias**: vista unificada de uniformes y bolsas (`GET /inventario?tipo=&q=&bajoStock=`).
  Cada ítem trae `origen`, que te dice si es una talla (con prenda y talla) o una bolsa (con
  grado y ciclo).
- **Ingresar existencias**: la pantalla que más se usa. `POST /inventario/entradas` con varias
  líneas y un motivo. Que tome diez segundos: buscar, cantidad, Enter, repetir, guardar.
  *"Entraron 25 bolsas de 4to primaria y 12 polos M"* es literalmente el caso de uso.
- **Conteo físico**: `POST /inventario/conteos` con lo que se contó. Mostrá en pantalla las
  tres columnas antes de guardar: **sistema / contado / diferencia**, y que la diferencia se
  vea en rojo. El backend registra la diferencia como ajuste con motivo, no "corrige" el
  número en silencio.
- **Kardex**: `GET /inventario/:itemId/kardex`. Es el historial de un ítem con saldos. Es la
  pantalla que responde "¿y por qué hay 18 y no 20?".

En los movimientos a mano (`POST /inventario/:itemId/movimientos`), **la cantidad va siempre
positiva** y el `tipo` define si entra o sale. Una merma de 2 es `{ cantidad: 2, tipo: 'MERMA' }`.
Los ajustes y las mermas exigen `motivo`.

### 5.9 Alertas de reposición (admin)
`GET /inventario/alertas` devuelve lo que hay que reponer, ya ordenado por lo que falta. Un
contador en la navegación con el total es suficiente para que no se olvide.

### 5.10 Reportes (admin)
`/reportes/ventas?agrupar=dia|usuario|tipo|grado`, `tallas-mas-vendidas`,
`existencias-valorizadas`, `bolsas-por-grado`.

Dos detalles que no son adorno:
- **Cualquier reporte acepta `formato=csv`** y devuelve un archivo listo para Excel. Un botón
  "Exportar" por reporte: `window.open('/api/v1/reportes/...&formato=csv')`.
- Varios reportes traen un campo **`advertencia`** o **`notas`**. Mostralos. Por ejemplo,
  existencias valorizadas avisa que los ítems sin costo registrado aportan 0 y el total es un
  mínimo; si lo escondés, alguien va a leer ese número como el valor del inventario.

### 5.11 Anular una venta (admin)
`POST /ventas/:id/anular` con un `motivo` obligatorio. Pedí confirmación y dejá claro que
devuelve el stock. La venta no desaparece: queda marcada `ANULADA`, con quién y por qué.

### 5.12 Usuarios (admin)
`GET/POST/PATCH /usuarios` y `POST /usuarios/:id/password`. Alta de maestras, baja (nunca
borrado) y reseteo de contraseñas — no hay recuperación por correo, la administradora la
cambia.

Dos guardas del backend que conviene explicar en la interfaz: no puede desactivarse a sí
misma, y no puede dejar el sistema sin ninguna administradora activa.

---

## 6. Cómo armarlo, por fases

Cada fase deja algo que se puede usar y mostrar.

| Fase | Qué | Por qué en ese orden |
|---|---|---|
| **1 — LISTA** | Proyecto, cliente de API, login, `/auth/me`, rutas protegidas, layout con el rol | Sin esto no se puede probar nada más. |
| **2 — LISTA** | **Punto de venta + recibo** | Es el corazón y lo que más se usa. Terminarlo temprano deja ver el sistema funcionando de verdad. |
| **3 — LISTA** | Mis ventas, recibo reimprimible, corte de caja | Completa todo lo que necesita una maestra. Con esto ya se puede soltar a producción para vender. |
| **4 — LISTA** | Catálogo: uniformes y bolsas | Le quita a la administradora el Prisma Studio de encima. |
| **5 — LISTA** | Inventario: existencias, entradas, conteo, kardex, alertas | Lo que más usa la administradora cada semana. |
| **6 — LISTA** | Reportes, exportación, usuarios | Lo último porque hasta aquí no hay suficientes datos para que los reportes digan algo. |

Si hay que recortar, recortá la fase 6, no la 2.

**Lo que ya está construido**, para no volver a decidirlo:

```
web/
  public/logo.jpg           el logo del colegio
  vite.config.ts            proxy de /api al backend (cookie del mismo origen)
  src/
    index.css               paleta del colegio y el CSS de impresión del recibo
    api/cliente.ts          api() y apiConMeta(), ErrorApi, credentials: include
    api/errores.ts          mensaje por `code` y campos inválidos de un 400
    api/modelos.ts          tipos de respuesta escritos a mano
    api/esquema.ts          generado del openapi.json (npm run tipos)
    sesion/sesion.ts        useSesion, useIniciarSesion, useCerrarSesion
    sesion/RutaPrivada.tsx  redirige a /login, y bloquea las de solo ADMIN
    venta/vendibles.ts      uniformes + bolsas aplanados, y la búsqueda
    venta/carrito.ts        el carrito y la conversión a centavos
    inventario/items.ts     los ítems del inventario, búsqueda e invalidación
    inventario/*.tsx        existencias, entradas, conteo, alertas, kardex, movimiento
    utilidades/texto.ts     búsqueda por principio de palabra (compartida)
    utilidades/fechas.ts    YYYY-MM-DD local; la zona la resuelve el backend
    reportes/*.tsx          los cuatro reportes, cada uno con su exportación
    componentes/edicion.tsx edición en línea de montos y enteros, dentro de la tabla
    componentes/FiltroFechas.tsx  desde/hasta con atajos, compartido
    componentes/BotonExportar.tsx descarga del CSV por enlace, con la cookie
    componentes/Layout.tsx  cabecera, navegación filtrada por rol, cerrar sesión
    componentes/Recibo.tsx  recibo imprimible (window.print)
    componentes/ui.tsx      Tarjeta, Titulo, Aviso, Boton, Campo, Quetzales...
    paginas/Login.tsx       formulario y manejo de los errores del login
    paginas/Inicio.tsx      tablero distinto por rol, con datos reales
    paginas/Vender.tsx      el punto de venta
    paginas/Ventas.tsx      listado con filtros, recibo y anulación (ADMIN)
    paginas/Corte.tsx       corte de caja del día, con exportación a CSV
    paginas/Catalogo.tsx    prendas y tallas, con precios editables en línea
    paginas/Bolsas.tsx      bolsas por ciclo, editor de la lista, duplicar, imprimir
    paginas/Inventario.tsx  pestañas de inventario (rutas anidadas)
    paginas/Reportes.tsx    pestañas de reportes (rutas anidadas)
    paginas/Usuarios.tsx    alta, baja y reseteo de contraseñas
```

La **anulación** (§5.11) quedó dentro del listado de ventas y no en una fase aparte: una
administradora con una lista de ventas y sin forma de corregir un cobro mal hecho no tiene
una pantalla terminada. Pide motivo, avisa cuánto se devuelve al inventario, y es lo único
de esa pantalla que una maestra no ve.

Dos decisiones del catálogo que vale la pena no deshacer:

- **Los precios se editan en línea, dentro de la tabla** (clic en el número, Enter guarda,
  Escape cancela). La administradora va a corregir los 31 precios del seed de una sentada:
  un modal por talla haría ese trabajo tres veces más largo. Solo manda la petición si el
  valor cambió, para no ensuciar el historial de precios con guardados vacíos.
- **Cada campo editable dice qué es** (`aria-label` con "Precio de la talla M: Q 85.00").
  Sin eso, una tabla con quince campos editables presenta quince botones que se llaman
  igual, y deja de poderse usar por teclado.

Y dos del inventario:

- **Ingresar existencias y contar usan el mismo gesto que vender**: buscar, Enter, repetir.
  Es la pantalla que más usa la administradora, y ese gesto ya está aprendido.
- **El conteo muestra las tres columnas antes de guardar** (sistema, contado, diferencia en
  rojo). El valor de contar está en *ver* la diferencia; si la pantalla solo pidiera el
  número nuevo, el faltante pasaría sin que nadie lo note.

Y una del cobro, que salió de cómo se cobra en el colegio de verdad:

- **Efectivo y transferencia son dos botones; depósito y tarjeta están detrás de un enlace.**
  En la práctica solo se cobra de las dos primeras formas, así que un desplegable con cuatro
  opciones era una decisión de más en cada venta. Las otras dos siguen existiendo en el
  backend por si alguna vez se usan, pero no estorban. Por lo mismo, el corte de caja
  **solo muestra las columnas de los métodos que tuvieron movimiento** ese día, más el
  efectivo, que siempre importa porque es lo que hay que entregar en mano.

La paleta sale del logo y del sitio anterior, sin inventar colores: verde institucional
`#245501` (documentado en `uniformes-ccsf2.md`) para la cabecera y los botones, verde salvia
`#8fad7e` (muestreado del logo) para acentos, y azul `#002746` para los títulos.

Las pantallas que faltan **ya están en la navegación** y muestran de qué fase son. Así se ve
la forma completa del sistema —y la diferencia entre los dos roles— desde el primer día, sin
fingir que algo funciona.

---

## 7. Tabla de errores

Reaccioná por `code`. Esta es la lista completa, es cerrada:

| `code` | HTTP | Qué pasó | Qué mostrar |
|---|---|---|---|
| `VALIDACION` | 400 | Datos mal formados. `details.campos` dice cuáles | Marcá los campos |
| `NO_AUTENTICADO` | 401 | Sin sesión o expiró | Mandá al login |
| `SIN_PERMISO` | 403 | Rol insuficiente | "Esta acción es solo de la administradora" |
| `NO_ENCONTRADO` | 404 | No existe (o no es suyo) | "No existe" |
| `STOCK_INSUFICIENTE` | 409 | No hay existencias. `details.disponible` dice cuántas hay | "Solo quedan N" |
| `ITEM_INACTIVO` | 409 | Se descontinuó | "Ya no está disponible" |
| `VENTA_YA_ANULADA` | 409 | Doble anulación | "Esta venta ya estaba anulada" |
| `RECURSO_DUPLICADO` / `SKU_DUPLICADO` | 409 | Ya existe | "Ya existe un registro con esos datos" |
| `CICLO_CERRADO` | 409 | Editar un ciclo que ya pasó | "Ese ciclo ya cerró" |
| `MOVIMIENTO_INVALIDO` | 409 | Movimiento imposible | El mensaje del backend sirve |
| `RESTRICCION_BD` | 409 | Choca con otros registros | "Desactive en lugar de borrar" |
| `DEMASIADOS_INTENTOS` | 429 | Bloqueo de login | "Intente en N minutos" |
| `ERROR_INTERNO` | 500 | Bug del servidor | "Ocurrió un error" + avisar |

---

## 8. Lo que NO hay que construir

Para que no pierdas tiempo en cosas que el backend no soporta todavía:

- **Alumnos.** No hay padrón. La venta guarda un nombre escrito a mano y nada más.
- **Subir fotos de uniformes.** La tabla existe pero no hay endpoint de subida. Las fotos que
  vienen en el catálogo son URL absolutas del sitio anterior: mostralas y listo.
- **Cambio de talla.** Hoy se anula y se vuelve a vender.
- **Apartados / reservas**, pagos en cuotas, facturación.
- **Acceso para papás.** Todo requiere sesión.
- **Carrito que sobreviva al refresco.** La venta es de un minuto en una ventanilla; guardarla
  en `localStorage` agrega un estado raro (ventas a medias de ayer) a cambio de nada.

---

## 9. Detalles que parecen chicos y no lo son

- **La pantalla de venta tiene que servir con teclado.** Buscar, Enter, cantidad, Enter.
  Alguien va a vender 40 uniformes seguidos el primer día de clases.
- **Resolución objetivo:** una laptop de secretaría, 1366×768. Que las tablas no necesiten
  scroll horizontal ahí. Si va a haber tablet, botones grandes en la pantalla de venta.
- **Formatea siempre `Q 0.00` con dos decimales.** Un total que dice "Q 170" y otro "Q 170.5"
  en la misma pantalla se lee como un error del sistema.
- **Zona horaria `America/Guatemala`.** El corte de caja es del día del colegio, no del día
  UTC. Si construís fechas en el cliente, usá solo `YYYY-MM-DD` y dejá que el backend
  resuelva los límites del día.
- **Estados de carga y de error en todo.** Es un sistema que se usa con alguien esperando del
  otro lado del mostrador; un botón que no da señal de vida hace que lo presionen tres veces.
- **Confirmación solo donde duele:** anular una venta, desactivar algo, reemplazar la lista de
  útiles. En el resto, estorba.

---

## 10. Preguntas abiertas que te afectan

1. ~~**Para las facturas del portal de la SAT, ¿hace falta el NIT del comprador?**~~
   **CERRADA: sí, y ya está.** La venta tiene `compradorNit`, el recibo lo imprime y la lista
   de ventas lo muestra debajo del nombre, que es la lista de trabajo para facturar.

   Lo que salió al hacerlo y vale saber: **hoy conviven tres formas de NIT.** El clásico
   (cuerpo + verificador 0-9 o K, con guion), los **primeros 9 dígitos del CUI del DPI** —que
   es lo que recibe todo contribuyente individual nuevo desde octubre de 2023— y el **CUI
   completo de 13 dígitos**, hacia donde la SAT está llevando la armonización.

   El verificador del CUI **no** se calcula como el del NIT clásico, y ni la SAT ni el RENAP
   publican su algoritmo. Por eso **ningún NIT bloquea una venta**: se valida el formato, se
   comprueba el verificador solo cuando la forma del dato dice sin ambigüedad que es clásico,
   y si no cuadra se cobra igual y se marca "revisar". Rechazar un NIT sería dejar a la
   maestra sin poder cobrar con el papá enfrente, y el comprobante es el recibo, no la
   factura. Dejar el campo vacío es consumidor final, que es el caso normal.
2. **¿Las maestras venden desde una compu compartida o cada una desde la suya?** Si es
   compartida, el botón de "cerrar sesión" tiene que ser enorme y visible, y conviene pensar
   en un cierre por inactividad en el cliente.
3. **¿Imprimen recibo siempre?** Si sí, vale la pena ajustar el `@media print` a papel media
   carta o a una impresora de tickets desde el principio.
4. **¿La administradora va a querer editar precios en masa?** Hoy es una talla por petición;
   si el flujo real es "subir todos los precios 5%", decíselo al del backend y es un endpoint
   nuevo, no una pantalla con 31 peticiones.
