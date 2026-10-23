import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, type CodigoError } from '../errors.js';

type CuerpoError = {
  error: {
    code: CodigoError;
    message: string;
    details?: Record<string, unknown>;
  };
};

function cuerpo(
  code: CodigoError,
  message: string,
  details?: Record<string, unknown>,
): CuerpoError {
  return details ? { error: { code, message, details } } : { error: { code, message } };
}

/**
 * Un solo formato de error para toda la API (ver docs/plan-backend.md 6.1).
 * Nada de mensajes internos hacia afuera: lo que no se reconoce es un 500 generico
 * y el detalle queda en el log del servidor.
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send(cuerpo(error.codigo, error.message, error.detalles));
    return;
  }

  if (error instanceof ZodError) {
    const campos = error.issues.map((problema) => ({
      campo: problema.path.join('.') || '(raiz)',
      mensaje: problema.message,
    }));
    reply.status(400).send(cuerpo('VALIDACION', 'Los datos enviados no son validos', { campos }));
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique violation. Es el SKU repetido, la talla repetida, la bolsa
    // repetida de (grado, ciclo, version)...
    if (error.code === 'P2002') {
      const objetivo = error.meta?.['target'];
      const esSku = Array.isArray(objetivo) && objetivo.some((c) => String(c).includes('sku'));
      reply
        .status(409)
        .send(
          cuerpo(
            esSku ? 'SKU_DUPLICADO' : 'RECURSO_DUPLICADO',
            'Ya existe un registro con esos datos',
            objetivo ? { campos: objetivo } : undefined,
          ),
        );
      return;
    }

    // P2025: el registro que se queria actualizar o borrar no existe.
    if (error.code === 'P2025') {
      reply.status(404).send(cuerpo('NO_ENCONTRADO', 'El registro no existe'));
      return;
    }

    // P2003: llave foranea. Se intento apuntar a algo que no existe, o borrar algo
    // que tiene historia colgando (que es justo lo que queremos impedir).
    if (error.code === 'P2003') {
      reply
        .status(409)
        .send(
          cuerpo(
            'RESTRICCION_BD',
            'La operacion rompe una relacion con otros registros. Desactive en lugar de borrar.',
          ),
        );
      return;
    }
  }

  // Violacion de un CHECK de la base de datos: la ultima red de seguridad.
  // Llegar aqui significa que un servicio no valido algo que debia validar, asi
  // que se registra como error, no como un 409 silencioso.
  const mensaje = error.message ?? '';
  if (mensaje.includes('violates check constraint') || mensaje.includes('23514')) {
    request.log.error(
      { err: error },
      'CHECK de la base de datos rechazo la operacion: falta una validacion en el servicio',
    );
    const esStock = mensaje.includes('stock_actual_no_negativo');
    reply
      .status(409)
      .send(
        cuerpo(
          esStock ? 'STOCK_INSUFICIENTE' : 'RESTRICCION_BD',
          esStock
            ? 'La operacion dejaria las existencias en negativo'
            : 'La operacion viola una restriccion de la base de datos',
        ),
      );
    return;
  }

  // Errores de Fastify con statusCode propio (body mal formado, payload grande...).
  const statusFastify = (error as FastifyError).statusCode;
  if (typeof statusFastify === 'number' && statusFastify >= 400 && statusFastify < 500) {
    reply.status(statusFastify).send(cuerpo('VALIDACION', error.message));
    return;
  }

  request.log.error({ err: error }, 'Error no manejado');
  reply.status(500).send(cuerpo('ERROR_INTERNO', 'Ocurrio un error inesperado'));
}
