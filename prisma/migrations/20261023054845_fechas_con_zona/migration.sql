-- Las columnas de fecha pasan de TIMESTAMP (sin zona) a TIMESTAMPTZ.
--
-- Por que: el valor guardado siempre fue UTC, pero al no llevar zona, cualquier
-- consulta que haga aritmetica de zonas tiene que acordarse de eso. Asi se
-- escribio mal el agrupado por dia de los reportes: `creadoEn AT TIME ZONE
-- 'America/Guatemala'` sobre una columna sin zona hace lo CONTRARIO de lo que
-- parece (interpreta el valor como hora de Guatemala en lugar de convertirlo a
-- ella), y las ventas de la noche caian en el dia siguiente.
--
-- El USING es deliberado y no se puede omitir: sin el, Postgres convierte usando
-- la zona de la SESION. En este contenedor es UTC y saldria bien por casualidad,
-- pero en un servidor con `timezone` configurado a otra cosa, esta migracion
-- correria todas las fechas en silencio. Decir 'UTC' explicitamente lo vuelve
-- correcto en cualquier servidor.

ALTER TABLE "AuditLog"
  ALTER COLUMN "creadoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "HistorialPrecio"
  ALTER COLUMN "creadoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "InventoryItem"
  ALTER COLUMN "creadoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC',
  ALTER COLUMN "actualizadoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "actualizadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "MovimientoStock"
  ALTER COLUMN "creadoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "Sesion"
  ALTER COLUMN "expiraEn" SET DATA TYPE TIMESTAMPTZ(3) USING "expiraEn" AT TIME ZONE 'UTC',
  ALTER COLUMN "ultimoUsoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "ultimoUsoEn" AT TIME ZONE 'UTC';

ALTER TABLE "Usuario"
  ALTER COLUMN "creadoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC';

ALTER TABLE "Venta"
  ALTER COLUMN "creadoEn" SET DATA TYPE TIMESTAMPTZ(3) USING "creadoEn" AT TIME ZONE 'UTC',
  ALTER COLUMN "anuladaEn" SET DATA TYPE TIMESTAMPTZ(3) USING "anuladaEn" AT TIME ZONE 'UTC';
