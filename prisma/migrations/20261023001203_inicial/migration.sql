-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('UNIFORME_TALLA', 'BOLSA_UTILES');

-- CreateEnum
CREATE TYPE "TipoTalla" AS ENUM ('LETRA', 'NUMERO');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('APERTURA', 'ENTRADA', 'VENTA', 'DEVOLUCION', 'AJUSTE_POS', 'AJUSTE_NEG', 'MERMA', 'ANULACION_VENTA');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'VENDEDOR');

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tipo" "TipoItem" NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precioCentavos" INTEGER NOT NULL,
    "costoCentavos" INTEGER,
    "stockActual" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaUniforme" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "CategoriaUniforme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prenda" (
    "id" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoTalla" "TipoTalla" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Prenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniformeVariante" (
    "id" TEXT NOT NULL,
    "prendaId" TEXT NOT NULL,
    "talla" TEXT NOT NULL,
    "ordenTalla" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "UniformeVariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nivel" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Nivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grado" (
    "id" TEXT NOT NULL,
    "nivelId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Grado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CicloEscolar" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CicloEscolar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BolsaUtiles" (
    "id" TEXT NOT NULL,
    "gradoId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "nombre" TEXT NOT NULL,
    "notas" TEXT,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "BolsaUtiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BolsaItem" (
    "id" TEXT NOT NULL,
    "bolsaId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "unidad" TEXT,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "BolsaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoStock" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "motivo" TEXT,
    "refTipo" TEXT,
    "refId" TEXT,
    "saldoDespues" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "alumnoId" TEXT,
    "compradorNombre" TEXT,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'PAGADA',
    "metodoPago" "MetodoPago" NOT NULL,
    "referenciaPago" TEXT,
    "subtotalCentavos" INTEGER NOT NULL,
    "descuentoCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaLinea" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "descripcionSnapshot" TEXT NOT NULL,
    "precioUnitCentavos" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "totalCentavos" INTEGER NOT NULL,

    CONSTRAINT "VentaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "ultimoUsoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alumno" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "gradoId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Alumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "prendaId" TEXT,
    "bolsaId" TEXT,
    "path" TEXT NOT NULL,
    "alt" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialPrecio" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "precioAnterior" INTEGER NOT NULL,
    "precioNuevo" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "datos" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_tipo_activo_idx" ON "InventoryItem"("tipo", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaUniforme_codigo_key" ON "CategoriaUniforme"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Prenda_categoriaId_nombre_key" ON "Prenda"("categoriaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "UniformeVariante_itemId_key" ON "UniformeVariante"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "UniformeVariante_prendaId_talla_key" ON "UniformeVariante"("prendaId", "talla");

-- CreateIndex
CREATE UNIQUE INDEX "Nivel_nombre_key" ON "Nivel"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Grado_nivelId_nombre_key" ON "Grado"("nivelId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "CicloEscolar_anio_key" ON "CicloEscolar"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "BolsaUtiles_itemId_key" ON "BolsaUtiles"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "BolsaUtiles_gradoId_cicloId_version_key" ON "BolsaUtiles"("gradoId", "cicloId", "version");

-- CreateIndex
CREATE INDEX "BolsaItem_bolsaId_orden_idx" ON "BolsaItem"("bolsaId", "orden");

-- CreateIndex
CREATE INDEX "MovimientoStock_itemId_creadoEn_idx" ON "MovimientoStock"("itemId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoStock_refTipo_refId_idx" ON "MovimientoStock"("refTipo", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_correlativo_key" ON "Venta"("correlativo");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_idempotencyKey_key" ON "Venta"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Venta_creadoEn_idx" ON "Venta"("creadoEn");

-- CreateIndex
CREATE INDEX "Venta_alumnoId_idx" ON "Venta"("alumnoId");

-- CreateIndex
CREATE INDEX "Venta_usuarioId_creadoEn_idx" ON "Venta"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "VentaLinea_ventaId_idx" ON "VentaLinea"("ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");

-- CreateIndex
CREATE INDEX "Sesion_expiraEn_idx" ON "Sesion"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_codigo_key" ON "Alumno"("codigo");

-- CreateIndex
CREATE INDEX "Alumno_apellidos_nombres_idx" ON "Alumno"("apellidos", "nombres");

-- CreateIndex
CREATE INDEX "Media_prendaId_orden_idx" ON "Media"("prendaId", "orden");

-- CreateIndex
CREATE INDEX "Media_bolsaId_orden_idx" ON "Media"("bolsaId", "orden");

-- CreateIndex
CREATE INDEX "HistorialPrecio_itemId_creadoEn_idx" ON "HistorialPrecio"("itemId", "creadoEn");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_creadoEn_idx" ON "AuditLog"("creadoEn");

-- AddForeignKey
ALTER TABLE "Prenda" ADD CONSTRAINT "Prenda_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaUniforme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformeVariante" ADD CONSTRAINT "UniformeVariante_prendaId_fkey" FOREIGN KEY ("prendaId") REFERENCES "Prenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformeVariante" ADD CONSTRAINT "UniformeVariante_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grado" ADD CONSTRAINT "Grado_nivelId_fkey" FOREIGN KEY ("nivelId") REFERENCES "Nivel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BolsaUtiles" ADD CONSTRAINT "BolsaUtiles_gradoId_fkey" FOREIGN KEY ("gradoId") REFERENCES "Grado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BolsaUtiles" ADD CONSTRAINT "BolsaUtiles_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "CicloEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BolsaUtiles" ADD CONSTRAINT "BolsaUtiles_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BolsaItem" ADD CONSTRAINT "BolsaItem_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "BolsaUtiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_gradoId_fkey" FOREIGN KEY ("gradoId") REFERENCES "Grado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "CicloEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_prendaId_fkey" FOREIGN KEY ("prendaId") REFERENCES "Prenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "BolsaUtiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialPrecio" ADD CONSTRAINT "HistorialPrecio_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialPrecio" ADD CONSTRAINT "HistorialPrecio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes que NO se delegan al codigo de la aplicacion.
-- El CHECK de stock es la ultima red contra sobreventa: aunque haya un bug de
-- concurrencia en la app, la base de datos rechaza la transaccion.
-- Ver docs/plan-backend.md, secciones 2.1 y 3.
-- ---------------------------------------------------------------------------

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "stock_actual_no_negativo" CHECK ("stockActual" >= 0);

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "stock_minimo_no_negativo" CHECK ("stockMinimo" >= 0);

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "precio_no_negativo" CHECK ("precioCentavos" >= 0);

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "costo_no_negativo"
  CHECK ("costoCentavos" IS NULL OR "costoCentavos" >= 0);

-- Un movimiento de cantidad 0 no es un movimiento.
ALTER TABLE "MovimientoStock"
  ADD CONSTRAINT "movimiento_cantidad_no_cero" CHECK ("cantidad" <> 0);

ALTER TABLE "BolsaItem"
  ADD CONSTRAINT "bolsa_item_cantidad_positiva" CHECK ("cantidad" >= 1);

ALTER TABLE "VentaLinea"
  ADD CONSTRAINT "venta_linea_cantidad_positiva" CHECK ("cantidad" >= 1);

ALTER TABLE "VentaLinea"
  ADD CONSTRAINT "venta_linea_precio_no_negativo" CHECK ("precioUnitCentavos" >= 0);

ALTER TABLE "Venta"
  ADD CONSTRAINT "venta_descuento_valido"
  CHECK ("descuentoCentavos" >= 0 AND "descuentoCentavos" <= "subtotalCentavos");

ALTER TABLE "Venta"
  ADD CONSTRAINT "venta_total_coherente"
  CHECK ("totalCentavos" = "subtotalCentavos" - "descuentoCentavos");

-- Correlativo de ventas: secuencia de la base de datos, no MAX()+1, que bajo
-- concurrencia produce duplicados. Se usa a partir de la Fase 4.
CREATE SEQUENCE IF NOT EXISTS "venta_correlativo_seq" AS integer START 1;
