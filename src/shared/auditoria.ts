import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from './prisma.js';

export type EntradaAuditoria = {
  usuarioId: string;
  /** Verbo con punto: "usuario.crear", "item.precio.cambiar", "prenda.desactivar". */
  accion: string;
  entidad: string;
  entidadId: string;
  detalle?: Record<string, unknown>;
};

/**
 * Bitacora de lo sensible: cambios de precio, alta y baja de usuarios, reseteo de
 * contrasenas, desactivaciones de catalogo.
 *
 * Los movimientos de inventario NO pasan por aqui: el ledger ya guarda quien,
 * cuando, cuanto y por que (ver docs/plan-backend.md seccion 2.4). Duplicarlos
 * seria llevar dos libros de lo mismo.
 */
export async function auditar(cliente: Tx | typeof prisma, entrada: EntradaAuditoria) {
  return cliente.auditLog.create({
    data: {
      usuarioId: entrada.usuarioId,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      datos: (entrada.detalle ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
