# Inventario CCSF2

Backend del inventario de **uniformes** y **bolsas de útiles** del colegio.

- El diseño completo, las reglas de negocio y el contrato de API están en
  [docs/plan-backend.md](docs/plan-backend.md). Si algo de este README y el plan se
  contradicen, el plan manda.
- Los datos de uniformes del sitio anterior están en
  [uniformes-ccsf2.md](uniformes-ccsf2.md).

## Lo que hay que entender antes de tocar el código

1. **Una sola tabla de cosa vendible con existencias** (`InventoryItem`). Una talla de
   uniforme apunta a una; una bolsa de útiles apunta a una. Por eso hay un solo ledger,
   una sola lógica de stock y un solo reporte de existencias.
2. **Los útiles se manejan por bolsa completa.** Lo que se ingresa es "tengo 25 bolsas de
   4to primaria", nunca "tantos lápices". La lista de útiles (`BolsaItem`) es **opcional** y
   solo se imprime: no tiene existencias ni precio.
3. **El stock no se edita: se deriva de los movimientos.** No existe ningún endpoint que
   escriba `stockActual`. Todo pasa por `registrarMovimiento()`, y se cumple siempre que
   `stockActual == SUM(movimientos.cantidad)`.
4. **El dinero va en centavos enteros.** `Q 125.50` se guarda y se transmite como `12550`.
   El formateo a quetzales es del frontend.

## Arranque

Requisitos: Node 20+ y Docker.

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run db:up            # levanta Postgres en el puerto 5433
npm run migrate:deploy   # crea las tablas
npm run seed             # datos iniciales
npm run dev              # http://127.0.0.1:3000
```

Verificación rápida:

```bash
curl http://127.0.0.1:3000/health/db
```

> El `.env` no se sube al repositorio. Antes de usar el sistema de verdad hay que generar
> un `SESSION_SECRET` propio (el comando está en `.env.example`).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm run build` / `npm start` | Compila a `dist/` y corre lo compilado |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Pruebas (las de integración necesitan la base levantada y sembrada) |
| `npm run migrate` | Nueva migración en desarrollo |
| `npm run migrate:deploy` | Aplica migraciones pendientes (es lo que corre en el servidor) |
| `npm run seed` | Datos iniciales. Es idempotente: se puede repetir |
| `npm run studio` | Prisma Studio, para ver la base a mano |
| `npm run db:up` / `npm run db:down` | Postgres en Docker |
| `npm run db:reset` | Borra y reconstruye la base. **Destructivo** |

## Endpoints disponibles hoy (Fase 1)

Todo bajo `/api/v1`. Respuestas: `{ "data": ... }`. Errores:
`{ "error": { "code": "...", "message": "...", "details": {...} } }` — el frontend reacciona
por `code`, no por el mensaje.

```
GET    /health                         GET  /health/db

GET    /niveles                        POST /niveles
GET    /grados?nivelId=                POST /grados
GET    /ciclos                         POST /ciclos
POST   /ciclos/:id/activar

GET    /uniformes/categorias
GET    /uniformes/prendas?categoria=DIARIO&incluirInactivas=false
GET    /uniformes/prendas/:id
POST   /uniformes/prendas              # acepta sus tallas en el mismo cuerpo
PATCH  /uniformes/prendas/:id
DELETE /uniformes/prendas/:id          # desactiva (y desactiva sus tallas)
POST   /uniformes/prendas/:id/variantes
PATCH  /uniformes/variantes/:id        # precio, costo, stockMinimo, activo
DELETE /uniformes/variantes/:id        # solo si no tiene movimientos ni ventas

GET    /bolsas?ciclo=2026&gradoId=&nivelId=
GET    /bolsas/:id
POST   /bolsas
PATCH  /bolsas/:id
PUT    /bolsas/:id/contenido           # reemplaza la lista completa
POST   /bolsas/:id/duplicar            # a otro ciclo (o nueva versión en el mismo)
GET    /bolsas/:id/lista               # para imprimir
DELETE /bolsas/:id                     # desactiva
```

Nota para el frontend: **se vende con `itemId`**, no con el id de la variante ni el de la
bolsa. El `itemId` es la unidad de inventario, y es lo que recibirá `POST /ventas` en la
Fase 4.

## Estructura

```
src/
  app.ts                  armado del servidor (plugins, errores, rutas)
  server.ts               arranque y cierre ordenado
  config/env.ts           valida el entorno AL ARRANCAR; si falta algo, no levanta
  modules/
    escolar/              niveles, grados, ciclos
    uniformes/            categorías, prendas, tallas
    bolsas/               bolsas de útiles y su contenido
    inventario/           registrarMovimiento(): el único lugar que escribe stock
  shared/                 errores, paginación, dinero, sku, media, prisma
prisma/
  schema.prisma           esquema completo (incluye lo de fases siguientes)
  migrations/             incluye los CHECK de la base, escritos a mano
  seed.ts                 datos de uniformes-ccsf2.md
tests/
  unit/                   lógica pura
  integration/            endpoints y reglas, contra Postgres real
```

Capas: **routes** traducen HTTP ↔ dominio (validan con Zod y llaman al servicio, cero
lógica), **services** tienen la lógica y son dueños de las transacciones, **Prisma** solo
accede a datos.

## Estado por fases

| Fase | Estado |
|---|---|
| 0 — Cimientos (TS, Fastify, Prisma, Docker, errores, health) | **Listo** |
| 1 — Catálogo (uniformes, bolsas, estructura escolar, seed) | **Listo** |
| 2 — Inventario: entradas, ajustes, conteo, kardex, alertas | Pendiente (`registrarMovimiento` ya existe) |
| 3 — Auth, usuarios y permisos | Pendiente |
| 4 — Ventas | Pendiente |
| 5 — Reportes, corte de caja y despliegue | Pendiente |

Dos cosas que conviene saber mientras tanto:

- **Todavía no hay autenticación**, así que los endpoints están abiertos: no exponer esto a
  internet antes de la Fase 3. Las acciones que necesitan un usuario (cambiar un precio,
  mover inventario) se atribuyen al `admin` del seed mediante `src/shared/actor.ts`, que es
  temporal y se reemplaza por la sesión real en la Fase 3.
- **Los precios del seed son de ejemplo.** `uniformes-ccsf2.md` dice que los del sitio
  anterior eran valores de prueba (Q1.00) y que hay que definir los reales; los del seed son
  inventados para poder probar con números distinguibles. Se corrigen con
  `PATCH /uniformes/variantes/:id` y `PATCH /bolsas/:id`.
