import type { FastifyRequest } from 'fastify';
import { AppError } from './errors.js';
import { prisma } from './prisma.js';

/**
 * TEMPORAL (Fase 1). Todo movimiento y todo cambio de precio tiene que quedar
 * atribuido a un usuario — esa regla no se relaja ni para arrancar. Como la
 * autenticacion es la Fase 3, mientras tanto se resuelve al ADMIN del seed.
 *
 * En la Fase 3 el cuerpo de esta funcion pasa a ser `request.usuario.id` y nada
 * mas cambia: los servicios ya reciben el usuarioId como parametro.
 */
export async function resolverActor(request: FastifyRequest): Promise<string> {
  const admin = await prisma.usuario.findFirst({
    where: { rol: 'ADMIN', activo: true },
    orderBy: { creadoEn: 'asc' },
    select: { id: true },
  });

  if (!admin) {
    throw new AppError(
      503,
      'ERROR_INTERNO',
      'No hay un usuario ADMIN en la base de datos. Corra: npm run seed',
    );
  }

  request.log.warn('Fase 1: accion atribuida al ADMIN del seed (todavia no hay sesion)');
  return admin.id;
}
