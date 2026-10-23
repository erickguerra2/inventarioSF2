# Plan de backend — Inventario CCSF2 (uniformes + bolsas de útiles)

> Documento de diseño. Define el modelo de datos, las reglas de negocio, el contrato
> de API y el orden de construcción. El frontend (React) lo hace otra persona, así que
> la sección **Contrato de API** (§6) es la que se le entrega a esa persona.

## 0. Supuestos de arranque

- **Stack recomendado:** Node.js + TypeScript, Fastify (o Express), PostgreSQL con Prisma,
  Zod para validación, Vitest/Jest para pruebas. Si se prefiere otro stack (Python/FastAPI,
  Laravel, .NET), el modelo de datos y las reglas de negocio de este documento se mantienen
  tal cual; solo cambia la sintaxis.
- **Usuarios internos únicamente:** una administradora que ingresa todo y **varias maestras**
  que solo registran sus ventas. Los papás **no** tienen acceso (ver §0.1).
- **Aplicación web en un servidor**, con HTTPS obligatorio. API y frontend servidos **desde el
  mismo dominio** (`inventario.ccsf2.edu.gt`, API bajo `/api/v1`) y sesión por cookie
  `httpOnly` (ver §0.2 y §7). Que sea web y no una app en una sola computadora es lo que
  obliga a tratar cada petición como no confiable.
- **El inventario se ingresa en la unidad que se vende:** "tengo 25 bolsas de 4to primaria",
  "tengo 12 polos talla M". Nunca componentes ("tantos lápices").
- **Una sola sede / una sola bodega.** El modelo deja la puerta abierta a varias (ver §11).
- **Moneda:** quetzales, guardados **siempre como enteros en centavos** (`Int`). Nunca `float`.
  `Q 125.50` → `12550`. El formateo a `Q` es responsabilidad del frontend.
- **Zona horaria:** `America/Guatemala`. Guardar todo en UTC (`timestamptz`) y convertir al
  presentar o al filtrar por día.
- Idioma del dominio en español (`prenda`, `talla`, `bolsa`), idioma técnico en inglés.
  Consistencia > pureza.

## 0.1 Alcance real: herramienta interna, dos roles muy desiguales

Esto no es una tienda en línea. Es personal del colegio llevando el control de lo que entra,
lo que se vende y lo que queda. Conviene decirlo antes del modelo de datos porque es lo que
justifica todo lo que **no** se construye.

**Quién usa el sistema:**

- **La administradora (`ADMIN`), una.** Ingresa todo: prendas, bolsas, precios, existencias,
  ajustes. Es la única que anula ventas, administra usuarios y ve los reportes completos.
- **Las maestras (`VENDEDOR`), varias.** Solo registran lo que venden. Nada más: no ingresan
  existencias, no cambian precios, no anulan, no ven las ventas de otra maestra.

Los papás no entran — "no al menos en este momento".

**Lo que esto quita del camino crítico:**

| Cosa | Por qué se cae |
|---|---|
| Catálogo público, buscador para papás | Nadie de fuera entra |
| Permisos finos por recurso | Dos roles alcanzan: `ADMIN` todo, `VENDEDOR` solo vender |
| JWT, refresh tokens, tokens en React | Cookie de sesión `httpOnly`: más simple y más segura (§0.2) |
| Subida de fotos, miniaturas | Quien vende ya conoce las prendas (§9) |
| Padrón de alumnos | Se vende a quien llegue a la ventanilla; el nombre basta (§6.2) |
| Carrito, apartados, pagos en línea | No existe ese flujo |

**Lo que sí hay que hacer bien, y lo que el reparto de roles vuelve más importante:**

- **Que no se pueda vender lo que no hay.** Es el error que descuadra el inventario.
- **Que cada venta quede amarrada a la maestra que la hizo.** Con varias personas vendiendo
  esto deja de ser auditoría abstracta: es cómo se cuadra el efectivo que cada una entrega al
  final del día (`/reportes/corte-caja?usuarioId=`).
- **Que varias maestras vendiendo a la vez no se pisen.** Aquí sí hay concurrencia real: dos
  pueden tomar el último polo talla M en el mismo minuto. Es exactamente lo que resuelven los
  locks ordenados de §4.1 y el `CHECK` de §2.1 — con varias vendedoras eso pasa de "buena
  práctica" a necesario.
- **Que el doble clic no cobre dos veces** (§4.2).
- **Que una maestra no pueda hacer nada más que vender**, ni equivocándose de botón. El
  permiso se niega en el backend, no escondiendo botones en React: el frontend es sugerencia,
  el backend es la regla.
- **Que ingresar existencias tome diez segundos.** Es la pantalla que más usa la admin.

**Lo que queda listo para cuando los papás sí entren** (el requerimiento dice "no al menos en
este momento", así que no se cierra la puerta): el catálogo ya está separado de la escritura de
stock, así que exponer endpoints de solo lectura hacia afuera es agregar rutas, no rediseñar.
La tabla `Media` se queda en el esquema desde el inicio aunque la subida se haga después, y
las bolsas ya tienen su lista de contenido imprimible.

## 0.2 Consecuencia de ser web: mismo dominio y cookie de sesión

Que la aplicación viva en un servidor y se abra desde el navegador cambia dos decisiones
técnicas. Vale la pena fijarlas ahora porque afectan al frontend.

**Uno: frontend y API en el mismo dominio.**

```
https://inventario.ccsf2.edu.gt/           -> el build de React (archivos estáticos)
https://inventario.ccsf2.edu.gt/api/v1/... -> el backend
```

Un solo dominio significa: **cero configuración de CORS**, cookies que funcionan sin
`SameSite=None`, un solo certificado y nada de URLs distintas entre desarrollo y producción
más allá de una variable. Si en cambio el React se publica en otro lado (Netlify, Vercel) y
la API aparte, hay que configurar CORS con `credentials` y cookies `SameSite=None; Secure`,
que funciona pero es más frágil y lo bloquean algunos navegadores. **Recomendación: un solo
dominio**, con nginx (o Caddy) sirviendo los estáticos y haciendo proxy de `/api` a Node.

**Dos: sesión por cookie `httpOnly`, no un token en `localStorage`.**

Esta es la que más suele equivocarse. Un JWT guardado en `localStorage` es legible por
cualquier JavaScript de la página: un solo bug de XSS entrega la sesión de la administradora,
y además un JWT no se puede revocar antes de que expire. Con una cookie
`httpOnly; Secure; SameSite=Lax` y la sesión guardada en la base de datos:

- el JavaScript **no puede leerla**, así que un XSS no se la lleva;
- cerrar sesión, o que la admin eche a una maestra, **tiene efecto inmediato**: se borra la
  fila de la sesión;
- el React **no maneja tokens**: no hay `Authorization` que armar, ni refresh que renovar, ni
  decisión de dónde guardar nada. Solo `fetch(..., { credentials: 'include' })`.

El costo es protección CSRF, y con `SameSite=Lax` más dominio propio ya está cubierto para
este caso (sin formularios de terceros, sin peticiones cruzadas). Si se quiere el cinturón
extra, token CSRF de doble envío en las mutaciones.

> Si por alguna razón el hosting obliga a separar frontend y API en dominios distintos, se
> cambia a `Authorization: Bearer` con JWT corto más refresh. El resto del plan no se mueve;
> solo esa pieza.

---

## 1. La decisión central del diseño

El sistema vende **dos cosas con granularidad de inventario distinta**:

| Qué se vende | Unidad que tiene stock y precio | Lo que NO se inventaría |
|---|---|---|
| Uniformes | la **talla** de una prenda (Polo talla M) | la prenda en abstracto |
| Útiles | la **bolsa completa** de un grado (Bolsa 3ro Primaria 2026) | cada útil por separado |

De ahí la decisión que ordena todo lo demás:

> **Existe una sola tabla de "cosa vendible con stock" (`InventoryItem`).**
> Una talla de uniforme apunta a un `InventoryItem`. Una bolsa de útiles apunta a un
> `InventoryItem`. Los detalles propios de cada familia viven en tablas hijas.

Beneficio: **una sola** tabla de movimientos, **una sola** lógica de "no vender sin
existencias", **una sola** línea de venta, **un solo** kardex, **un solo** reporte de stock
bajo. Si en el futuro se vende otra cosa (libros, cuotas de laboratorio), se agrega un tipo
y el 90% del backend ya funciona.

La unidad de inventario de los útiles es la bolsa y nada más. Lo que se ingresa al sistema es
**"tengo 25 bolsas de 4to primaria"**: un grado, un número. Nunca "tantos lápices, tantos
cuadernos". Vender una bolsa descuenta `1` de la bolsa, jamás 40 cuadernos.

El contenido de la bolsa (`BolsaItem`: "40 cuadernos doble línea", "1 caja de crayones") es
**opcional y puramente informativo**: sirve para imprimir la lista que se le entrega al papá.
**No tiene existencias, no se descuenta, no se mueve.** Una bolsa con cero líneas de
contenido funciona perfectamente: se puede vender, contar y reportar igual. Si en algún
momento no se quiere capturar las listas, simplemente no se capturan y nada se rompe.

---

## 2. Modelo de datos

Esquema en Prisma (traducible 1:1 a SQL). Los `@@index` / `@@unique` son parte del diseño,
no un detalle: son lo que evita datos basura.

### 2.1 Núcleo: ítem vendible con stock

```prisma
enum TipoItem {
  UNIFORME_TALLA
  BOLSA_UTILES
}

model InventoryItem {
  id              String   @id @default(cuid())
  tipo            TipoItem
  sku             String   @unique          // UNI-POLO-M, BOL-3PRIM-2026
  nombre          String                    // "Polo institucional - M" (denormalizado para reportes)
  precioCentavos  Int                       // precio de venta vigente
  costoCentavos   Int?                      // costo de adquisición, para valorizar inventario
  stockActual     Int      @default(0)      // CACHÉ del ledger (ver §3)
  stockMinimo     Int      @default(0)      // umbral de alerta
  activo          Boolean  @default(true)   // baja lógica, nunca DELETE
  creadoEn        DateTime @default(now())
  actualizadoEn   DateTime @updatedAt

  variante         UniformeVariante?
  bolsa            BolsaUtiles?
  movimientos      MovimientoStock[]
  lineasVenta      VentaLinea[]
  historialPrecios HistorialPrecio[]

  @@index([tipo, activo])
}
```

Dos invariantes que **se escriben como CHECK en la migración SQL**, no solo en el código:

```sql
ALTER TABLE "InventoryItem" ADD CONSTRAINT stock_no_negativo
  CHECK ("stockActual" >= 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT precio_no_negativo
  CHECK ("precioCentavos" >= 0);
```

El `CHECK` de stock es la última red de seguridad contra sobreventa: aunque haya un bug de
concurrencia en la aplicación, la base de datos rechaza la transacción.

La relación 1-1 con la tabla hija se declara del lado hijo (`itemId @unique`), lo que
garantiza que una talla y una bolsa nunca compartan el mismo `InventoryItem`.

### 2.2 Uniformes

```prisma
enum TipoTalla {
  LETRA    // XS, S, M, L, XL
  NUMERO   // 28, 30, 32, 34, 36, 38
}

model CategoriaUniforme {
  id      String @id @default(cuid())
  codigo  String @unique    // DIARIO | FISICA
  nombre  String            // "Uniforme de diario" | "Uniforme de educación física"
  orden   Int
  prendas Prenda[]
}

model Prenda {
  id          String  @id @default(cuid())
  categoriaId String
  nombre      String             // "Polo institucional"
  descripcion String?
  tipoTalla   TipoTalla
  activo      Boolean @default(true)

  categoria CategoriaUniforme  @relation(fields: [categoriaId], references: [id])
  variantes UniformeVariante[]
  fotos     Media[]

  @@unique([categoriaId, nombre])
}

model UniformeVariante {
  id         String @id @default(cuid())
  prendaId   String
  talla      String   // "M", "32"
  ordenTalla Int      // XS=1, S=2, M=3, L=4, XL=5  /  28=28, 30=30, ...
  itemId     String   @unique

  prenda Prenda        @relation(fields: [prendaId], references: [id])
  item   InventoryItem @relation(fields: [itemId], references: [id])

  @@unique([prendaId, talla])   // no puede haber dos "talla M" del mismo polo
}
```

**Por qué `ordenTalla`:** ordenar tallas alfabéticamente da `L, M, S, XL, XS`, que es
absurdo para el usuario. El orden es un dato del dominio; no se calcula en el frontend.

Cada variante tiene su propio precio y su propia existencia porque así es la realidad del
colegio (ya está documentado en `uniformes-ccsf2.md`): el pantalón talla 38 puede costar
más que el 28.

### 2.3 Bolsas de útiles

```prisma
model Nivel {
  id     String @id @default(cuid())
  nombre String @unique   // Preprimaria, Primaria, Básicos, Diversificado
  orden  Int
  grados Grado[]
}

model Grado {
  id      String @id @default(cuid())
  nivelId String
  nombre  String          // "3ro Primaria"
  orden   Int

  nivel   Nivel         @relation(fields: [nivelId], references: [id])
  bolsas  BolsaUtiles[]
  alumnos Alumno[]

  @@unique([nivelId, nombre])
}

model CicloEscolar {
  id     String  @id @default(cuid())
  anio   Int     @unique      // 2026
  activo Boolean @default(false)
  bolsas BolsaUtiles[]
}

model BolsaUtiles {
  id      String  @id @default(cuid())
  gradoId String
  cicloId String
  version Int     @default(1)   // si la lista cambia a medio ciclo
  nombre  String                // "Bolsa de útiles - 3ro Primaria - 2026"
  notas   String?
  itemId  String  @unique

  grado     Grado         @relation(fields: [gradoId], references: [id])
  ciclo     CicloEscolar  @relation(fields: [cicloId], references: [id])
  item      InventoryItem @relation(fields: [itemId], references: [id])
  contenido BolsaItem[]

  @@unique([gradoId, cicloId, version])
}

// OPCIONAL: solo para imprimir la lista de útiles. Sin existencias, sin precio.
// Una BolsaUtiles sin ningún BolsaItem es válida y se vende igual.
model BolsaItem {
  id          String  @id @default(cuid())
  bolsaId     String
  descripcion String        // "Cuaderno doble línea 80 hojas"
  cantidad    Int
  unidad      String?       // unidad, resma, caja, docena
  orden       Int

  bolsa BolsaUtiles @relation(fields: [bolsaId], references: [id], onDelete: Cascade)

  @@index([bolsaId, orden])
}
```

**`BolsaItem` no tiene `stockActual` ni precio, y eso es intencional.** Es la línea de una
lista impresa, no un producto. El único stock es el `InventoryItem.stockActual` de la bolsa:
"tenemos 25 bolsas de 4to primaria".

El costo y el precio son de la **bolsa completa**, en su `InventoryItem`
(`costoCentavos`, `precioCentavos`): se teclea un número, no se suma el de 30 útiles. Esa es
la consecuencia directa de manejar útiles por bolsa, y es lo que hace que la captura sea
rápida.

`POST /bolsas/:id/duplicar` clona la bolsa y su contenido para el siguiente ciclo con stock
en 0, así se arma el catálogo cada año sin volver a teclear todo.

### 2.4 Movimientos de stock (el ledger)

```prisma
enum TipoMovimiento {
  APERTURA         // saldo inicial al montar el sistema
  ENTRADA          // compra, donación, bolsas armadas
  VENTA            // -
  DEVOLUCION       // + (el cliente devuelve)
  AJUSTE_POS       // + por conteo físico
  AJUSTE_NEG       // - por conteo físico
  MERMA            // - daño, pérdida, extravío
  ANULACION_VENTA  // + reversa de una venta anulada
}

model MovimientoStock {
  id           String   @id @default(cuid())
  itemId       String
  cantidad     Int              // FIRMADO: + entra, - sale. Nunca 0.
  tipo         TipoMovimiento
  motivo       String?
  refTipo      String?          // VENTA | CONTEO | COMPRA
  refId        String?          // id de la venta/conteo que lo originó
  saldoDespues Int              // snapshot del stock después de este movimiento
  usuarioId    String
  creadoEn     DateTime @default(now())

  item    InventoryItem @relation(fields: [itemId], references: [id])
  usuario Usuario       @relation(fields: [usuarioId], references: [id])

  @@index([itemId, creadoEn])
  @@index([refTipo, refId])
}
```

### 2.5 Ventas

```prisma
enum EstadoVenta { PAGADA ANULADA }
enum MetodoPago  { EFECTIVO TRANSFERENCIA DEPOSITO TARJETA }

model Venta {
  id                String      @id @default(cuid())
  correlativo       Int         @unique      // consecutivo visible, desde secuencia de BD
  alumnoId          String?
  compradorNombre   String?                  // si el comprador no está en el sistema
  estado            EstadoVenta @default(PAGADA)
  metodoPago        MetodoPago
  referenciaPago    String?                  // no. de boleta / transferencia
  subtotalCentavos  Int
  descuentoCentavos Int         @default(0)
  totalCentavos     Int
  idempotencyKey    String?     @unique      // ver §4.2
  usuarioId         String
  creadoEn          DateTime    @default(now())
  anuladaEn         DateTime?
  anuladaPorId      String?
  motivoAnulacion   String?

  // Quién vendió: obligatorio, y con FK real para poder traer el nombre en un include
  // y para que la base impida una venta con un usuario que no existe.
  usuario    Usuario  @relation("VentasRealizadas", fields: [usuarioId], references: [id])
  // Quién anuló: nullable, porque la mayoría de las ventas nunca se anulan.
  anuladaPor Usuario? @relation("VentasAnuladas", fields: [anuladaPorId], references: [id])
  alumno     Alumno?  @relation(fields: [alumnoId], references: [id])
  lineas     VentaLinea[]

  @@index([creadoEn])
  @@index([alumnoId])
  @@index([usuarioId, creadoEn])   // corte de caja: ventas de una maestra en un día
}

model VentaLinea {
  id                  String @id @default(cuid())
  ventaId             String
  itemId              String
  descripcionSnapshot String   // "Polo institucional - M", congelado
  precioUnitCentavos  Int      // precio AL MOMENTO de la venta
  cantidad            Int
  totalCentavos       Int

  venta Venta         @relation(fields: [ventaId], references: [id])
  item  InventoryItem @relation(fields: [itemId], references: [id])

  @@index([ventaId])
}
```

**Por qué los snapshots.** Si el recibo de una venta de enero se arma haciendo join con el
precio actual del polo, en marzo ese recibo miente. La línea de venta guarda el precio y la
descripción tal como estaban. Regla general: **los documentos históricos no se calculan, se
congelan.**

### 2.6 Alumnos, usuarios y soporte

```prisma
// Fase 6. `Venta.alumnoId` es nullable a propósito: hoy la venta guarda solo
// `compradorNombre` y el sistema funciona completo sin un solo alumno cargado.
model Alumno {
  id        String  @id @default(cuid())
  codigo    String? @unique      // carné, si el colegio lo usa
  nombres   String
  apellidos String
  gradoId   String
  cicloId   String
  activo    Boolean @default(true)

  grado  Grado   @relation(fields: [gradoId], references: [id])
  ventas Venta[]

  @@index([apellidos, nombres])
}

// ADMIN: la administradora, ingresa todo. VENDEDOR: cada maestra, solo registra sus ventas.
enum Rol { ADMIN VENDEDOR }

model Usuario {
  id           String  @id @default(cuid())
  usuario      String  @unique   // login corto: "lucia.m". NO email: puede que no tengan.
  nombre       String            // "Lucía Méndez" — lo que sale en los reportes
  email        String?           // opcional, solo contacto
  passwordHash String
  rol          Rol
  activo       Boolean @default(true)

  movimientos    MovimientoStock[]
  ventas         Venta[] @relation("VentasRealizadas")
  ventasAnuladas Venta[] @relation("VentasAnuladas")
  sesiones       Sesion[]
}

// Sesión del lado del servidor: lo que hace que el logout y la baja de una maestra
// tengan efecto inmediato. El id viaja en la cookie httpOnly (§0.2).
model Sesion {
  id          String   @id @default(cuid())   // valor de la cookie: opaco, aleatorio
  usuarioId   String
  expiraEn    DateTime
  ultimoUsoEn DateTime @default(now())
  ip          String?
  userAgent   String?

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId])
  @@index([expiraEn])
}

model Media {
  id          String  @id @default(cuid())
  prendaId    String?
  bolsaId     String?
  path        String            // "foto.1.jpg" — ruta relativa, ver §9
  alt         String?
  orden       Int     @default(0)
  esPrincipal Boolean @default(false)

  prenda Prenda? @relation(fields: [prendaId], references: [id], onDelete: Cascade)
}

model HistorialPrecio {
  id             String   @id @default(cuid())
  itemId         String
  precioAnterior Int
  precioNuevo    Int
  usuarioId      String
  creadoEn       DateTime @default(now())

  item InventoryItem @relation(fields: [itemId], references: [id])
}

model AuditLog {
  id        String   @id @default(cuid())
  usuarioId String
  accion    String            // "venta.anular", "item.precio.cambiar"
  entidad   String
  entidadId String
  datos     Json?             // antes / después
  creadoEn  DateTime @default(now())

  @@index([entidad, entidadId])
}
```

---

## 3. Regla de oro del inventario: el stock se deriva de los movimientos

**Invariante del sistema:**

```
InventoryItem.stockActual == SUM(MovimientoStock.cantidad WHERE itemId = item.id)
```

El stock **nunca se edita a mano**. No existe un `PATCH /items/:id { stockActual: 50 }`.
Para cambiar el stock se registra un movimiento, y el movimiento actualiza el caché dentro
de la misma transacción.

Por qué así y no un simple campo editable:

1. **Auditoría.** Aquí entra dinero del colegio. Ante un descuadre, la pregunta siempre es
   "¿quién, cuándo y por qué?". El ledger la responde; un campo editable solo dice "ahora
   hay 12".
2. **Kardex gratis.** El historial por producto es un `SELECT ... ORDER BY creadoEn`.
3. **Reconciliación.** Se puede verificar el invariante con una consulta y detectar
   corrupción de datos (endpoint `/admin/verificar-integridad`, útil tras un bug o una
   migración).
4. **El conteo físico se modela bien.** Contar y encontrar 11 donde el sistema dice 12 no es
   "corregir a 11": es un `AJUSTE_NEG` de -1 con motivo "conteo físico 15/10/2026". El
   faltante queda registrado en lugar de desaparecer.

`stockActual` existe solo como caché por rendimiento (listar 60 tallas no debe disparar 60
sumas sobre el ledger). Es un valor derivado, y el servicio de inventario es el único que
lo toca.

### Función única de escritura de inventario

**Todo** cambio de stock pasa por una sola función. Si algún endpoint escribe stock por su
cuenta, el diseño ya se rompió.

```ts
// modules/inventario/inventario.service.ts
async function registrarMovimiento(
  tx: PrismaTransaction,
  { itemId, cantidad, tipo, motivo, refTipo, refId, usuarioId }: MovimientoInput,
) {
  if (cantidad === 0) throw new BadRequest('La cantidad no puede ser 0');

  // Lock pesimista: nadie más puede tocar este ítem hasta que la transacción cierre.
  const [item] = await tx.$queryRaw`
    SELECT id, "stockActual", activo FROM "InventoryItem"
    WHERE id = ${itemId} FOR UPDATE`;

  if (!item) throw new NotFound('El ítem no existe');
  if (!item.activo) throw new Conflict('El ítem está inactivo');

  const saldoDespues = item.stockActual + cantidad;
  if (saldoDespues < 0) {
    throw new Conflict(
      `Existencias insuficientes: hay ${item.stockActual}, se requieren ${-cantidad}`,
    );
  }

  await tx.inventoryItem.update({
    where: { id: itemId },
    data: { stockActual: saldoDespues },
  });

  return tx.movimientoStock.create({
    data: { itemId, cantidad, tipo, motivo, refTipo, refId, saldoDespues, usuarioId },
  });
}
```

---

## 4. Lógica de la venta (el caso crítico)

### 4.1 Flujo

```
POST /api/v1/ventas
Idempotency-Key: 3f1c...
{
  "alumnoId": "ck...",              // opcional
  "compradorNombre": "María López", // si no hay alumnoId
  "metodoPago": "EFECTIVO",
  "descuentoCentavos": 0,
  "lineas": [
    { "itemId": "item_polo_m", "cantidad": 2 },
    { "itemId": "item_bolsa_3prim_2026", "cantidad": 1 }
  ]
}
```

Dentro de **una sola transacción**:

1. Validar el payload (Zod): al menos una línea, `cantidad >= 1`, sin `itemId` repetido
   (dos líneas del mismo ítem se consolidan antes; consolidar es más amable que rechazar).
2. Verificar `Idempotency-Key` (§4.2).
3. **Ordenar los `itemId` ascendentemente** y recorrerlos en ese orden. Esto es lo que evita
   deadlocks: dos cajas vendiendo polo M y pantalón 32 al mismo tiempo toman los locks en el
   mismo orden, así que una espera en vez de trabarse mutuamente.
4. Por cada línea: cargar el ítem con `FOR UPDATE`, verificar `activo`, **leer el precio de
   la base de datos, nunca del cliente** (si el frontend manda el precio, cualquiera puede
   comprarse un uniforme a Q1), y construir la línea con el snapshot de precio y descripción.
5. Calcular `subtotal`, aplicar descuento (validar `descuento <= subtotal`), obtener `total`.
6. Crear `Venta` + `VentaLinea[]`.
7. Por cada línea, `registrarMovimiento` con `cantidad: -cantidad`, `tipo: 'VENTA'`,
   `refTipo: 'VENTA'`, `refId: venta.id`.
8. Commit. Si algo falla en cualquier paso, rollback completo: **no existe venta a medias.**

`correlativo` sale de una secuencia de PostgreSQL (`CREATE SEQUENCE venta_correlativo_seq`),
no de `MAX(correlativo) + 1`, que bajo concurrencia produce duplicados.

> **Nota sobre huecos en el correlativo:** una transacción que falla consume el número de la
> secuencia y deja un hueco. Para control interno no importa. Si el colegio exige
> correlativos sin huecos (requisito contable), el número se asigna al final de la
> transacción con un lock sobre una tabla de contador; cuesta concurrencia y conviene
> decidirlo antes de construir, no después.

### 4.2 Idempotencia (no es opcional)

El frontend es un React corriendo en la compu de secretaría con el WiFi del colegio. El
doble clic en "Cobrar" y el reintento tras un timeout son **hechos**, no hipótesis.

El cliente genera un UUID por intento de venta y lo manda en el header `Idempotency-Key`.
El backend lo guarda en `Venta.idempotencyKey`, que tiene índice único:

- Si la clave ya existe → devolver **la venta existente** con `200`, sin tocar inventario.
- Si no existe → procesar normal y devolver `201`.

Esto se le comunica explícitamente a quien haga el frontend: **la misma clave mientras sea
el mismo intento**; clave nueva solo cuando el usuario empieza una venta nueva.

### 4.3 Anulación — nunca borrar

`POST /api/v1/ventas/:id/anular { motivo }`:

1. Validar `estado === 'PAGADA'` (anular dos veces devolvería stock de más).
2. Marcar `estado = ANULADA` y guardar `anuladaEn`, `anuladaPorId`, `motivoAnulacion`.
3. Por cada línea, movimiento `ANULACION_VENTA` con cantidad **positiva**, referenciando la
   venta.
4. Registrar en `AuditLog`.

La venta sigue existiendo y el ledger muestra la salida y su reversa.

**Solo `ADMIN` anula** (§7). Una maestra que cobró mal llama a la administradora. El mismo
criterio aplica al cambio de talla de §4.4: son operaciones que mueven inventario hacia
atrás, y es justo donde un descuadre se vuelve invisible si cualquiera puede deshacer.

### 4.4 Cambio de talla

Caso real y frecuente: compraron M y no le queda; quieren L.

`POST /api/v1/ventas/:id/cambio { lineaId, nuevoItemId }`, en una transacción: devolución de
la talla original (`DEVOLUCION`, +1) más salida de la nueva (`VENTA`, -1), y registro de la
diferencia de precio si las tallas no cuestan igual. Atómico: nunca puede quedar la
devolución hecha y la entrega no.

Se puede diferir a una fase posterior; el modelo ya lo soporta sin cambios.

---

## 5. Reglas de negocio, en una lista

**Catálogo**

1. No se elimina nada que tenga movimientos o ventas; se desactiva (`activo = false`).
   Borrar un polo borraría historia contable.
2. Un ítem inactivo no se puede vender, pero sí aparece en reportes históricos.
3. Cambiar el precio no altera ventas pasadas (snapshot) y queda en `HistorialPrecio`.
4. `(prenda, talla)` es único. `(grado, ciclo, version)` es único.

**Uniformes**

5. Toda talla es un `InventoryItem` con su propio precio y existencia.
6. Las tallas se devuelven ordenadas por `ordenTalla`, no alfabéticamente.
7. Una talla con stock 0 **se sigue mostrando** en la pantalla de venta, marcada como
   agotada (`disponible: false`): la vendedora necesita ver que esa talla existe y que hay
   que pedirla, no que desaparezca de la lista. El intento de venta se rechaza con `409`.

**Bolsas de útiles**

8. Una bolsa pertenece a **un grado y un ciclo**. "Bolsa de 3ro Primaria" sin año no existe.
9. El stock de la bolsa se ingresa y se vende en **bolsas enteras** (`cantidad` entero ≥ 1).
   No hay medias bolsas ni venta de un útil suelto.
10. El contenido es **opcional** (puede estar vacío) y es informativo: editarlo **no** cambia
    el stock ni el precio.
11. El contenido se edita como reemplazo completo (`PUT` con el arreglo entero), no línea por
    línea: así se reordena y se corrige en una sola operación, que es como lo usa el usuario.
12. Editar el contenido de una bolsa de un ciclo **cerrado** se rechaza; para eso se duplica
    con nueva versión.
13. Armar o recibir bolsas = `ENTRADA` con motivo. Es la operación "tengo 25 bolsas de 4to
    primaria".

**Inventario**

14. El stock nunca se asigna; solo se mueve (§3).
15. Todo movimiento lleva `usuarioId`. Sin usuario no hay movimiento.
16. Los ajustes exigen `motivo` no vacío. Un ajuste sin explicación es un descuadre futuro.
17. `stockActual <= stockMinimo` dispara la alerta de reposición.

**Ventas**

18. El precio lo pone el servidor, siempre.
19. Venta sin líneas → `400`.
20. Descuento mayor al subtotal → `400`.
21. Las ventas no se editan: se anulan y se vuelven a hacer.
22. Una maestra (`VENDEDOR`) solo puede **crear** ventas y consultar **las suyas**. Anular,
    cambiar tallas y ver las ventas de otra están prohibidos en el backend (§7).
23. Toda venta guarda el `usuarioId` de quien la hizo, y ese dato no es editable nunca: es la
    base del corte de caja por maestra.

**Ciclo escolar**

24. Solo un `CicloEscolar.activo = true` a la vez. Activar uno desactiva el anterior en la
    misma transacción.
25. Al cerrar un ciclo, las bolsas no vendidas **no se borran**: quedan con su stock, y la
    administradora decide si las liquida (venta), las desarma (ajuste con motivo) o las
    arrastra al nuevo ciclo.

---

## 6. Contrato de API (lo que necesita el frontend)

Prefijo `/api/v1`. REST, JSON. Autenticación por **cookie de sesión `httpOnly`** (§0.2): el
frontend no maneja tokens, solo manda `credentials: 'include'` en cada `fetch`.

### 6.1 Convenciones

Lista paginada:

```json
{
  "data": [],
  "meta": { "page": 1, "perPage": 20, "total": 134, "totalPages": 7 }
}
```

Error — uno solo, idéntico en todos los endpoints:

```json
{
  "error": {
    "code": "STOCK_INSUFICIENTE",
    "message": "Existencias insuficientes: hay 1, se requieren 2",
    "details": { "itemId": "ck...", "disponible": 1 }
  }
}
```

Códigos HTTP: `400` validación, `401` sin token, `403` sin permiso, `404` no existe,
`409` conflicto de negocio (stock insuficiente, ítem inactivo, venta ya anulada),
`422` payload semánticamente inválido, `500` error no previsto.

El catálogo de `code` es cerrado y documentado (`STOCK_INSUFICIENTE`, `ITEM_INACTIVO`,
`VENTA_YA_ANULADA`, `CICLO_CERRADO`, `SKU_DUPLICADO`, ...) para que el frontend reaccione
por código y no parseando el mensaje.

### 6.2 Endpoints

**Auth**

```
POST   /auth/login            { usuario, password } -> { usuario }  + Set-Cookie: sid=...
POST   /auth/logout           # borra la sesión en la BD y la cookie
GET    /auth/me               # -> { usuario } o 401. El frontend pinta el menú según usuario.rol
```

`GET /auth/me` al cargar la app es todo el manejo de sesión que necesita React: si responde
`200` hay sesión, si responde `401` se muestra el login. No hay token que guardar ni expirar
en el cliente.

**Usuarios** (solo `ADMIN`)

```
GET    /usuarios
POST   /usuarios              { usuario, nombre, rol, password }  # alta de una maestra
PATCH  /usuarios/:id          { nombre, rol, activo }            # desactivar, no borrar
POST   /usuarios/:id/password # reseteo por la administradora
```

**Uniformes**

```
GET    /uniformes/categorias
GET    /uniformes/prendas?categoria=DIARIO&incluirInactivas=false
GET    /uniformes/prendas/:id            # prenda + variantes + fotos
POST   /uniformes/prendas
PATCH  /uniformes/prendas/:id
DELETE /uniformes/prendas/:id            # desactiva
POST   /uniformes/prendas/:id/variantes  # crea talla + su InventoryItem
PATCH  /uniformes/variantes/:id          # precio, stockMinimo, activo (NO stock)
POST   /uniformes/prendas/:id/fotos      # multipart
PATCH  /uniformes/fotos/:id              # orden, esPrincipal, alt
DELETE /uniformes/fotos/:id
```

Respuesta de `GET /uniformes/prendas/:id` — esta forma es la que consume la pantalla de
venta, así que se define de una vez:

```json
{
  "id": "ck...",
  "nombre": "Polo institucional",
  "categoria": { "codigo": "DIARIO", "nombre": "Uniforme de diario" },
  "tipoTalla": "LETRA",
  "fotos": [
    { "id": "ck...", "url": "https://inventario.ccsf2.edu.gt/foto.1.jpg", "esPrincipal": true }
  ],
  "variantes": [
    { "id": "ck...", "itemId": "ck...", "talla": "XS", "precioCentavos": 8500,
      "stockActual": 12, "disponible": true },
    { "id": "ck...", "itemId": "ck...", "talla": "S", "precioCentavos": 8500,
      "stockActual": 0, "disponible": false }
  ]
}
```

El frontend vende con `itemId`, nunca con `varianteId`: el ítem es la unidad de inventario.

**Bolsas de útiles**

```
GET    /bolsas?ciclo=2026&gradoId=&nivelId=
GET    /bolsas/:id                       # + contenido + costo estimado
POST   /bolsas                           # grado + ciclo + precio -> crea InventoryItem
PATCH  /bolsas/:id                       # nombre, notas, precio, stockMinimo
PUT    /bolsas/:id/contenido             # reemplaza la lista completa
POST   /bolsas/:id/duplicar              { cicloId } -> nueva bolsa, stock 0
GET    /bolsas/:id/lista                 # lista para imprimir / entregar al papá
DELETE /bolsas/:id                       # desactiva
```

**Catálogo escolar**

```
GET    /niveles
GET    /grados?nivelId=
GET    /ciclos          POST /ciclos          POST /ciclos/:id/activar

# --- Fase 6, solo si se decide mantener el padrón de alumnos (§11) ---
GET    /alumnos?q=&gradoId=&cicloId=
POST   /alumnos         PATCH /alumnos/:id
GET    /alumnos/:id/compras    # ¿ya compró su bolsa? ¿qué tallas lleva?
```

Niveles, grados y ciclos son de `ADMIN` para escribir y de cualquiera autenticado para leer:
la maestra necesita los grados para encontrar la bolsa que está vendiendo.

**Inventario**

```
GET    /inventario?tipo=&q=&bajoStock=true&page=      # vista unificada uniformes + bolsas
GET    /inventario/:itemId
POST   /inventario/:itemId/movimientos   { cantidad, tipo, motivo }
POST   /inventario/entradas              # lote: varias líneas en una transacción
GET    /inventario/:itemId/kardex?desde=&hasta=
POST   /inventario/conteos               # conteo físico -> genera los ajustes
GET    /inventario/alertas               # stockActual <= stockMinimo
```

**Todo `/inventario/*` es exclusivo de `ADMIN`.** La maestra ve existencias a través del
catálogo (`/uniformes/prendas`, `/bolsas`), que es lo que necesita para vender; el kardex y
los ajustes no le aparecen.

`POST /inventario/entradas` es la pantalla principal de la administradora, y su forma refleja
cómo habla: *"entraron 25 bolsas de 4to primaria y 12 polos M"*.

```json
{
  "motivo": "Compra a proveedor, factura 1182",
  "lineas": [
    { "itemId": "item_bolsa_4prim_2026", "cantidad": 25 },
    { "itemId": "item_polo_m",           "cantidad": 12 }
  ]
}
```

Una transacción, un movimiento `ENTRADA` por línea, todos con el mismo motivo. Al montar el
sistema por primera vez se usa el mismo endpoint con `tipo: APERTURA`, y eso **es** la carga
inicial del inventario: no hace falta un importador aparte.

**Ventas**

```
POST   /ventas                           # header Idempotency-Key obligatorio. ADMIN y VENDEDOR
GET    /ventas?desde=&hasta=&estado=&usuarioId=&page=   # VENDEDOR: forzado a sus propias ventas
GET    /ventas/:id                       # VENDEDOR: 404 si no es suya
POST   /ventas/:id/anular                { motivo }     # solo ADMIN
POST   /ventas/:id/cambio                { lineaId, nuevoItemId }   # solo ADMIN
GET    /ventas/:id/recibo                # JSON para imprimir (PDF opcional después)
```

Para un `VENDEDOR`, una venta ajena responde **`404`, no `403`**: un `403` confirmaría que la
venta existe. No es paranoia de seguridad mal puesta, es que no cuesta nada.

**Reportes**

```
GET    /reportes/ventas?desde=&hasta=&agrupar=dia|grado|tipo|usuario
GET    /reportes/existencias-valorizadas          # SUM(stockActual * costoCentavos)
GET    /reportes/tallas-mas-vendidas?desde=&hasta=
GET    /reportes/bolsas-por-grado?cicloId=        # cuántas se vendieron de cada grado
GET    /reportes/corte-caja?fecha=&usuarioId=     # por maestra y por método de pago
```

Todos los reportes son de `ADMIN`, con una excepción: `corte-caja` sin `usuarioId` para una
maestra devuelve **su** corte del día. Es lo que necesita para cuadrar lo que entrega, y es
el único reporte que ve.

La comparación "bolsas vendidas vs. alumnos inscritos por grado" queda pendiente del padrón
de alumnos (Fase 6); sin padrón, el reporte dice cuántas se vendieron, que ya es lo que se
pregunta en la práctica.

### 6.3 Desbloquear al frontend desde el día uno

- **OpenAPI generado del código**, no escrito a mano (`fastify-swagger` más los esquemas Zod
  vía `zod-to-json-schema`). Documentación que no puede quedar desactualizada.
- `openapi-typescript` para que React tenga **los tipos del backend** sin copiarlos a mano.
  Esto solo elimina toda una clase de bugs de integración.
- Datos semilla realistas (`prisma/seed.ts`) tomados de `uniformes-ccsf2.md`: 2 categorías,
  3 prendas por categoría con todas sus tallas, algunos grados con su bolsa, y usuarios: un
  admin y dos maestras. El frontend arranca con datos que se parecen a los de producción.
- Con los dos roles sembrados, quien haga el React puede ver **las dos interfaces reales**
  desde el primer día: la pantalla completa de la admin y la pantalla mínima de la maestra,
  que en el fondo es una sola cosa — buscar, agregar al total, cobrar.

---

## 7. Autenticación, roles y permisos

La asimetría es el punto: **la maestra tiene exactamente una operación de escritura en todo
el sistema, `POST /ventas`.** Todo lo demás es de la administradora. Diseñarlo así hace el
permiso trivial de verificar y casi imposible de equivocar.

| Acción | ADMIN | VENDEDOR (maestra) |
|---|---|---|
| Ver catálogo con precios y existencias | sí | sí (lo necesita para vender) |
| Registrar una venta | sí | **sí — su única escritura** |
| Ver ventas | todas | solo las suyas |
| Reimprimir el recibo de una venta | todas | solo las suyas |
| Su propio corte de caja | sí | sí |
| Anular una venta | sí | no |
| Ingresar existencias (entradas) | sí | no |
| Ajustes, mermas, conteo físico | sí | no |
| Crear/editar prendas, bolsas, precios | sí | no |
| Kardex, reportes, inventario valorizado | sí | no |
| Crear y desactivar usuarios | sí | no |

**Tres decisiones que vale la pena hacer explícitas:**

1. **La maestra no anula.** Si cobró mal, llama a la administradora. Es más molesto en el
   momento, pero una anulación es un movimiento de inventario y dinero hacia atrás: la forma
   más fácil de que un descuadre se vuelva invisible es que cualquiera pueda deshacer ventas.
   Si en la práctica resulta insoportable, la variante acotada es "puede anular **su propia**
   venta, del **mismo día**, y queda en `AuditLog`" — un `if` adicional, no un rediseño.
2. **Las maestras no se ven entre ellas.** `GET /ventas` no es un endpoint distinto para cada
   rol: es el mismo, y el backend **fuerza** `usuarioId = usuario.id` cuando el rol es
   `VENDEDOR`, ignorando lo que venga en el query. Filtrar por lo que mande el cliente es
   justamente el bug que permite leer las ventas de otra cambiando un parámetro en la URL.
3. **La administradora administra las maestras.** Como son varias y rotan, `ADMIN` crea y
   **desactiva** (`activo = false`, nunca borra: sus ventas y movimientos deben seguir
   atribuidos) y puede resetear contraseñas.

### 7.1 ¿Cuenta propia para cada maestra, o solo su nombre en la venta?

**Decisión: cuenta propia.** Cada maestra entra con su usuario y su contraseña, y el sistema
toma la identidad **de la sesión**, nunca de un campo que se teclea.

La razón de fondo es que un nombre escrito a mano no es una identidad, es una etiqueta:

- Nada impide escribir "Ana" cuando vendió Lucía, dejarlo vacío porque había cola, o
  escribirlo distinto cada vez ("Ana", "ana", "Ana M.", "Anita"). Al mes el reporte por
  maestra es inservible, y justo deja de ser confiable **cuando falta dinero**, que es el
  único momento en que alguien lo va a leer en serio.
- Tu requisito "solo pueden descontar lo que vendieron" no se puede cumplir sin cuentas: para
  mostrarle a cada una solo lo suyo, el sistema tiene que saber quién es. Con una cuenta
  compartida, todas ven todo.
- Con contraseña compartida, cuando una maestra deja el colegio hay que cambiársela a todas.
  Con cuentas, se desactiva una y se le borran las sesiones (§7).

El costo real es bajo: son unas pocas cuentas que la administradora crea desde `/usuarios`,
el login es un **usuario corto** (`lucia.m`), no un correo — no todas las maestras tienen
email institucional y no hace falta, porque el reseteo de contraseña lo hace la admin — y con
sesión de 12 h la contraseña se teclea una vez al día.

**Si de todas formas se quiere evitar los logins**, la alternativa honesta no es texto libre
sino un **catálogo de vendedoras**: una cuenta compartida más una lista cerrada de nombres que
la admin mantiene, y la venta obliga a elegir de esa lista. Se gana reportes limpios por
nombre; se pierde que el dato es autodeclarado (cualquiera puede elegir a otra) y se pierde
"cada una ve solo lo suyo". Es un paso intermedio, no un equivalente: si se va a mantener una
lista de maestras de todos modos, mantener cuentas cuesta casi lo mismo y sirve para más.

**Implementación.** Middleware declarativo por ruta (`requiereRol('ADMIN')`), nunca `if`
sueltos en los controladores: lo que es fácil de olvidar es el `if` que no se escribió. La
propiedad del recurso (sus ventas y nada más) se resuelve en el servicio, que es el único que
sabe qué significa "suyo".

**Credenciales y sesión.** Contraseñas con **argon2id** (o bcrypt cost 12). Sesión en cookie
`httpOnly; Secure; SameSite=Lax` respaldada por la tabla `Sesion` (§0.2 explica por qué no un
JWT en `localStorage`).

- **Duración:** 12 h de inactividad, renovada en cada petición. Obligar a re-login cada 15
  minutos a una maestra entre clase y clase termina con la contraseña en un papel pegado al
  monitor; 12 h con revocación inmediata es el trueque correcto. Como es web y se abre desde
  cualquier navegador del colegio, el `logout` tiene que funcionar de verdad — y funciona,
  porque borra la fila.
- **Rate limit** en `/auth/login`: 5 intentos / 15 min por IP + usuario. Al estar en un
  servidor público esto deja de ser opcional.
- Nunca revelar si el usuario existe (mismo mensaje y mismo tiempo de respuesta).
- Al desactivar una maestra, **borrar sus sesiones** en la misma transacción. Si no, sigue
  dentro hasta que la cookie expire.

**`AuditLog`** para todo lo sensible: cambios de precio, ajustes, anulaciones, alta y baja de
usuarios, reseteo de contraseñas.

---

## 8. Estructura del proyecto

```
src/
  app.ts                  # armado del servidor, plugins, manejo de errores
  server.ts               # arranque
  config/env.ts           # validación de variables de entorno con Zod
  modules/
    auth/        { routes, controller, service, schemas }
    uniformes/   { routes, controller, service, schemas }
    bolsas/      { routes, controller, service, schemas }
    inventario/  { routes, controller, service, schemas }   # registrarMovimiento vive aquí
    ventas/      { routes, controller, service, schemas }
    alumnos/
    reportes/
  shared/
    errors.ts             # AppError, BadRequest, NotFound, Conflict + códigos
    prisma.ts
    money.ts              # centavos <-> presentación, redondeos
    pagination.ts
    middleware/           { auth, requiereRol, errorHandler, idempotencia }
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  unit/                   # servicios
  integration/            # endpoints contra un Postgres de prueba
```

`config/env.ts` valida el entorno al arrancar: si falta `SESSION_SECRET`, el proceso no levanta.
Es mejor fallar en el arranque que a medianoche en la primera venta.

Reglas de capas, que es lo que mantiene el proyecto sano cuando crece:

- **Controller**: traduce HTTP ↔ dominio. Valida con Zod, llama al servicio, formatea la
  respuesta. Cero lógica de negocio.
- **Service**: la lógica y **el dueño de las transacciones**. No conoce `req` / `res`.
- **Prisma**: acceso a datos. Sin reglas de negocio en las consultas.

Un servicio que no sabe nada de HTTP se puede probar sin levantar el servidor y reusar desde
un script o una tarea programada.

---

## 9. Fotos de los uniformes

> **No está en el camino crítico.** Las fotos existían para que los papás vieran el uniforme;
> quien vende ya lo conoce. La tabla `Media` se queda en el esquema desde la Fase 1 (cuesta
> nada y evita una migración incómoda después), pero la subida de archivos se construye en la
> Fase 6, o cuando los papás tengan acceso. Lo de abajo es la decisión ya tomada para cuando
> toque.

Las notas existentes dicen que el sitio original usa rutas relativas (`foto.1.jpg`).
Decisión: guardar en `Media.path` **solo la ruta relativa** y construir la URL absoluta al
responder, con `MEDIA_BASE_URL` del entorno.

Por qué: si mañana las fotos se mueven a S3, Cloudflare R2 u otro dominio, se cambia una
variable de entorno y no 300 filas de la base de datos. El frontend **siempre recibe URL
absolutas** y no concatena nada.

- Script de migración único que baja las fotos del sitio viejo a `storage/uniformes/`.
- Subida: multipart, validar el MIME real (no la extensión), límite ~5 MB, renombrar a
  `{uuid}.{ext}` (nunca confiar en el nombre que manda el cliente) y generar una miniatura
  (`sharp`), porque la pantalla de venta carga muchas imágenes a la vez.
- Una sola foto `esPrincipal` por prenda: al marcar una, desmarcar las otras en la misma
  transacción.

---

## 10. Plan de construcción por fases

Cada fase deja algo que **funciona y se puede probar**, no una capa horizontal a medias.
Las duraciones son de referencia para una persona.

**Fase 0 — Cimientos — LISTO**
TypeScript, Fastify, Prisma, Docker Compose con Postgres, validación de entorno, manejo
global de errores, `GET /health` y `/health/db`, CI con typecheck y pruebas.
*Queda fuera: ESLint (hoy solo hay `npm run typecheck`).*
*Antes de esto hay que confirmar qué permite el servidor (§15, pregunta 1): es lo único que
puede obligar a cambiar de stack, y cuesta mucho menos averiguarlo ahora.*

**Fase 1 — Catálogo — LISTO**
`InventoryItem`, categorías, prendas, variantes, niveles, grados, ciclos, bolsas y su
contenido. CRUD más el seed desde `uniformes-ccsf2.md`. El esquema completo (ventas,
usuarios, sesiones, ledger) ya está en la base, aunque sus endpoints lleguen después.
*El frontend ya puede pintar el catálogo completo; los endpoints están en el README.*

**Fase 2 — Inventario y movimientos — LISTO**
`registrarMovimiento`, entradas en lote, ajustes, mermas, conteo físico, kardex con saldos,
alertas de stock bajo, vista unificada de inventario, el `CHECK` de stock no negativo y el
endpoint de verificación de integridad.
*Decisión tomada aquí: no existe tabla `Conteo`. Los ajustes de un mismo conteo comparten
`refId`, y el índice `(refTipo, refId)` permite reconstruirlo desde el ledger — una entidad
más no agregaba nada que el ledger no responda ya.*
*Decisión tomada aquí: la API recibe la cantidad como magnitud positiva y el tipo de
movimiento define el signo. Elimina por construcción el `AJUSTE_POS` de −5.*

**Fase 3 — Auth, usuarios y permisos — LISTO**
Login con cookie `httpOnly` firmada y sesión en base de datos, argon2id, los dos roles,
middleware `requiereRol` por módulo, alta/baja/reseteo de maestras, auditoría y bloqueo por
intentos fallidos.
*Dos desvíos conscientes respecto a lo escrito arriba:*
*— El bloqueo cuenta solo los intentos **fallidos**, en lugar de limitar todas las peticiones
a `/auth/login`. El ataque es adivinar contraseñas, que produce fallos; contar los aciertos
solo castiga a quien sí se acuerda de la suya. El límite por peticiones queda como techo
anti-inundación, más holgado.*
*— Los movimientos de inventario **no** se duplican en `AuditLog`: el ledger ya guarda quién,
cuándo, cuánto y por qué. La bitácora cubre precios, usuarios, contraseñas y
desactivaciones de catálogo.*
*— En la base se guarda el **sha256** del token de sesión, no el token: si la base se filtra,
nadie puede resumir una sesión con lo que hay ahí.*

**Fase 4 — Ventas (2–3 días)**
Venta transaccional con locks ordenados, idempotencia, correlativo por secuencia, atribución
al usuario, alcance "solo mis ventas", anulación con reversa restringida a `ADMIN`, recibo.
*El corazón del sistema. Test obligatorio: dos maestras vendiendo la última unidad a la vez.*

**Fase 5 — Reportes, corte de caja y puesta en el servidor (2–3 días)**
Reportes, **corte de caja por maestra** (lo que cada una debe entregar), exportación a
CSV/Excel, OpenAPI publicado y tipos generados para React. Y el despliegue de §13: nginx con
HTTPS, Postgres solo en localhost, servicio que se reinicia solo, backup diario probado.
*El despliegue conviene ensayarlo una vez en la Fase 1, con el catálogo apenas funcionando:
descubrir en la última semana que el servidor no corre Node es el peor momento posible.*

**Fase 6 — Lo que se pospuso a propósito**
Alumnos, fotos de uniformes, cambio de talla, PDF del recibo y de la lista de útiles,
apartados, acceso de lectura para papás, pagos en cuotas, varias bodegas.

---

## 11. Decisiones deliberadamente postergadas

Se dejan fuera **a propósito**, con el modelo preparado para recibirlas:

- **Reservas / apartados.** Cuando el papá aparta una talla que no hay. Requiere una tabla
  `Reserva` y cambiar la disponibilidad a `disponible = stockActual - reservado`. Se agrega
  sin tocar el ledger, pero complica cada lectura de stock. Solo si el colegio lo necesita.
- **Varias bodegas.** Hoy el stock vive en `InventoryItem`. Con múltiples ubicaciones pasaría
  a `StockPorUbicacion(itemId, ubicacionId)` y los movimientos llevarían ubicación. Es un
  cambio real; no se paga por adelantado si hay una sola sede.
- **Armado de bolsas con descuento de componentes.** Es justo lo que el requerimiento pide
  **no** hacer. Si algún día se quiere ("¿cuántas bolsas puedo armar con los cuadernos que
  hay?"), los componentes se vuelven `InventoryItem` y la bolsa adquiere una receta. Es una
  decisión grande: no se toma por adelantado.
- **Facturación electrónica (FEL / SAT).** Si el colegio debe facturar, se integra un
  certificador. El modelo ya tiene lo necesario (correlativo, líneas, snapshots, anulación);
  faltaría el NIT del comprador y el estado ante SAT.
- **Pagos parciales / cuotas.** Hoy una venta se paga completa. Las cuotas requieren una
  tabla `Pago` y saldo por venta.
- **Acceso de lectura para los papás.** Cuando toque, son endpoints públicos de solo lectura
  sobre el catálogo (prendas con tallas y precios, lista de útiles por grado) y la decisión
  de mostrar u ocultar existencias. No rediseña nada: el catálogo ya está separado de la
  escritura de stock. Lo que sí haría falta es rate limit serio y caché, porque sería lo
  único expuesto a internet abierto.
- **Padrón de alumnos.** Hoy la venta guarda `compradorNombre` y ya. Con alumnos cargados se
  puede responder "¿qué grados ya compraron su bolsa?" y "¿a este alumno qué le falta?", que
  es útil pero exige mantener el padrón al día cada año — trabajo real para la
  administradora, no solo código.
- **Segundo factor y "cerrar sesión en todos los dispositivos".** La sesión en base de datos
  (§0.2) ya da revocación inmediata, que es el 90% del valor. Un 2FA real y una pantalla de
  "mis sesiones activas" solo valen la pena si el sistema crece en usuarios.

---

## 12. Pruebas: dónde vale la pena el esfuerzo

No cobertura por cobertura. Lo que de verdad protege:

1. **No sobreventa bajo concurrencia.** Dos `POST /ventas` en paralelo sobre un ítem con
   stock 1: exactamente una responde `201`, la otra `409`, y el stock final es 0. Si este
   test pasa de verdad, el núcleo está bien.
2. **El invariante del ledger.** Tras una secuencia aleatoria de entradas, ventas, ajustes y
   anulaciones: `stockActual == SUM(movimientos)` para todo ítem.
3. **Idempotencia.** La misma `Idempotency-Key` dos veces crea **una** venta y descuenta
   **una** vez.
4. **Atomicidad.** Una venta de 3 líneas donde la tercera no tiene stock no deja movimiento
   ni venta.
5. **Anulación.** Devuelve exactamente lo vendido; anular dos veces da `409`.
6. **Snapshots.** Cambiar el precio del polo no altera el total de una venta anterior.
7. **Permisos, y son cinco pruebas baratas.** Una maestra no puede: anular (`403`), cambiar
   precios (`403`), ingresar existencias (`403`), ver la venta de otra maestra (`404`), ni
   listar ventas ajenas pasando `usuarioId=` de otra en el query (debe devolver solo las
   suyas, ignorando el parámetro). La última es la que de verdad se escapa en código.

Integración contra un Postgres real, no SQLite ni mocks: `FOR UPDATE`, los `CHECK` y las
secuencias son justamente lo que se está probando.

---

## 13. Despliegue y operación

**Topología en el servidor:**

```
Internet
   │  HTTPS (443)
   ▼
nginx / Caddy  ──  /            -> build de React (estáticos)
   │               /api/v1/*    -> proxy a Node (127.0.0.1:3000)
   ▼
Node (systemd o Docker)  ──>  PostgreSQL  (127.0.0.1:5432, NO expuesto a internet)
```

Tres cosas de esa figura importan: **Postgres escucha solo en localhost** (una base de datos
accesible desde internet es la forma más rápida de perder todo), **Node tampoco se expone
directo** (nginx maneja TLS, compresión y archivos estáticos mucho mejor), y **un solo
dominio** elimina CORS (§0.2).

- **HTTPS obligatorio**, certificado de Let's Encrypt con renovación automática. Redirección
  de HTTP a HTTPS y cabecera `HSTS`. Sin HTTPS, la cookie `Secure` no viaja y la contraseña
  de la administradora cruza la red en claro.
- `.env` validado al arrancar: `DATABASE_URL`, `SESSION_SECRET`, `MEDIA_BASE_URL`, `PORT`,
  `NODE_ENV`, `TZ=America/Guatemala`. **Fuera del repositorio**, permisos `600`.
- `helmet` para cabeceras de seguridad, rate limit global además del de login, límite de
  tamaño de body.
- Logs estructurados (`pino`) con request-id; **nunca** loguear contraseñas, cookies ni
  cuerpos de login.
- **Backup diario de Postgres, fuera del servidor**, con restauración probada. Un backup que
  vive en el mismo disco que la base no protege contra lo que de verdad pasa (el disco, el
  hosting, un `DROP` a mano), y un backup que nunca se restauró no es un backup. Aquí vive el
  inventario y el dinero del colegio.
- Migraciones versionadas (`prisma migrate deploy`) como parte del despliegue; nunca cambios
  manuales en producción.
- Un proceso de Node basta: son unas pocas usuarias concurrentes. `systemd` con `Restart=always`
  (o `docker compose` con `restart: unless-stopped`) y listo; no hace falta PM2 ni cluster.
- Tarea diaria que borre las sesiones expiradas (`DELETE FROM "Sesion" WHERE "expiraEn" < now()`).

---

## 14. Resumen en siete líneas

1. Una sola tabla de ítem vendible con stock; la talla de uniforme y la bolsa de útiles son
   sus dos formas.
2. La bolsa es la unidad de inventario; su contenido es una lista informativa, sin
   existencias.
3. El stock no se edita: se deriva de un ledger de movimientos firmados y auditables.
4. Las ventas congelan precio y descripción, son idempotentes y atómicas, y se anulan en vez
   de borrarse.
5. La concurrencia se resuelve con locks en orden determinista más un `CHECK` en la base de
   datos como red final; con varias maestras vendiendo a la vez, eso es necesario, no lujo.
6. Dos roles asimétricos: la administradora hace todo; la maestra tiene una sola operación de
   escritura, `POST /ventas`, y solo ve lo suyo.
7. Es una app web en un servidor: un solo dominio para API y frontend, HTTPS, y sesión en
   cookie `httpOnly` en lugar de un token en `localStorage`.

---

## 15. Preguntas abiertas para el colegio

Seis respuestas que cambian el alcance. La primera conviene resolverla **antes de escribir
una línea**, porque es la única que puede invalidar el stack; las dos siguientes, antes de
construir las ventas (Fase 4).

1. **¿Qué es exactamente ese servidor?** Es la pregunta que bloquea la Fase 0. El sitio
   anterior vive en `inventario.ccsf2.edu.gt`, y si eso es **hosting compartido tipo cPanel**
   puede que no corra Node ni PostgreSQL, y que solo haya PHP y MySQL. Hay tres caminos y
   conviene saber cuál antes de empezar:
   - **VPS o servidor propio** (root, cualquier cosa): el plan aplica tal cual.
   - **Hosting compartido con Node** (Passenger / "Setup Node.js App") y MySQL en vez de
     Postgres: el plan aplica, con dos cambios — Prisma sobre MySQL y el `FOR UPDATE` de §3
     y §4 funciona igual en InnoDB, pero se pierden algunos detalles de Postgres (secuencias
     se vuelven `AUTO_INCREMENT`, `Json` se comporta distinto).
   - **Hosting compartido solo PHP/MySQL:** el modelo de datos, las reglas de negocio y el
     contrato de API de este documento se mantienen completos, pero la implementación sería
     Laravel en vez de Node. Las transacciones, locks y el ledger son los mismos conceptos.
2. **¿Cada maestra entrega su propio efectivo?** Si sí, el corte de caja por maestra es
   funcionalidad central y no un reporte más. Si todo el efectivo va a una sola caja, el
   corte por usuario pasa a ser solo informativo.
3. **¿La maestra puede anular su propia venta del mismo día?** Hoy el plan dice que no, y que
   llame a la administradora (§7). Es la decisión más fácil de cambiar y la más molesta de
   descubrir tarde.
4. ¿Las bolsas de útiles se entregan **al contado**, o se pagan en cuotas / se cargan a la
   colegiatura?
5. ¿Se necesita **factura** (FEL) o basta un recibo interno con correlativo?
6. ¿Hay **una sola bodega**, o uniformes y útiles se guardan y se cuentan por separado?
