import type { TipoMovimiento } from '@prisma/client';
import { BadRequest, Conflict, NotFound } from '../../shared/errors.js';
import { prisma, type Tx } from '../../shared/prisma.js';

export type MovimientoInput = {
  itemId: string;
  /** FIRMADO: positivo entra, negativo sale. Nunca 0. */
  cantidad: number;
  tipo: TipoMovimiento;
  usuarioId: string;
  motivo?: string | null;
  refTipo?: string | null;
  refId?: string | null;
};

/**
 * LA UNICA funcion que escribe existencias en todo el sistema.
 *
 * Invariante que sostiene: stockActual == SUM(movimientos.cantidad) para cada item.
 * `stockActual` es solo un cache del ledger; si algun otro lugar del codigo escribe
 * ese campo, el diseno ya se rompio (ver docs/plan-backend.md seccion 3).
 *
 * Recibe el cliente de transaccion, no el global: asi es imposible llamarla sin
 * transaccion, y la venta puede mover varios items de forma atomica.
 */
export async function registrarMovimiento(tx: Tx, entrada: MovimientoInput) {
  const { itemId, cantidad, tipo, usuarioId, motivo, refTipo, refId } = entrada;

  if (!Number.isInteger(cantidad) || cantidad === 0) {
    throw new BadRequest(
      'La cantidad del movimiento debe ser un entero distinto de cero',
      { cantidad },
      'MOVIMIENTO_INVALIDO',
    );
  }

  // Lock pesimista: nadie mas puede tocar este item hasta que la transaccion
  // cierre. Quien mueva varios items debe hacerlo en orden ascendente de id para
  // no provocar deadlocks (ver seccion 4.1 del plan).
  const filas = await tx.$queryRaw<Array<{ id: string; stockActual: number; activo: boolean }>>`
    SELECT id, "stockActual", activo
    FROM "InventoryItem"
    WHERE id = ${itemId}
    FOR UPDATE
  `;

  const item = filas[0];
  if (!item) {
    throw new NotFound('El item de inventario no existe', { itemId });
  }
  if (!item.activo) {
    throw new Conflict('ITEM_INACTIVO', 'El item esta inactivo y no admite movimientos', {
      itemId,
    });
  }

  const saldoDespues = item.stockActual + cantidad;
  if (saldoDespues < 0) {
    throw new Conflict(
      'STOCK_INSUFICIENTE',
      `Existencias insuficientes: hay ${item.stockActual}, se requieren ${-cantidad}`,
      { itemId, disponible: item.stockActual, solicitado: -cantidad },
    );
  }

  await tx.inventoryItem.update({
    where: { id: itemId },
    data: { stockActual: saldoDespues },
  });

  return tx.movimientoStock.create({
    data: {
      itemId,
      cantidad,
      tipo,
      motivo: motivo ?? null,
      refTipo: refTipo ?? null,
      refId: refId ?? null,
      saldoDespues,
      usuarioId,
    },
  });
}

/**
 * Verifica el invariante del ledger. Devuelve los items donde el cache no coincide
 * con la suma de sus movimientos; si devuelve vacio, el inventario esta sano.
 * Util despues de una migracion, de un bug, o como prueba de regresion.
 */
export async function itemsConStockInconsistente(): Promise<
  Array<{ id: string; sku: string; stockActual: number; sumaMovimientos: number }>
> {
  return prisma.$queryRaw<
    Array<{ id: string; sku: string; stockActual: number; sumaMovimientos: number }>
  >`
    SELECT i.id,
           i.sku,
           i."stockActual",
           COALESCE(SUM(m.cantidad), 0)::int AS "sumaMovimientos"
    FROM "InventoryItem" i
    LEFT JOIN "MovimientoStock" m ON m."itemId" = i.id
    GROUP BY i.id, i.sku, i."stockActual"
    HAVING i."stockActual" <> COALESCE(SUM(m.cantidad), 0)
  `;
}
