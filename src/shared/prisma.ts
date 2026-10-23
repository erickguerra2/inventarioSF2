import { type Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  log: env.esDesarrollo ? ['warn', 'error'] : ['error'],
});

/**
 * El cliente que se recibe dentro de prisma.$transaction(). Los servicios que
 * escriben inventario reciben SIEMPRE uno de estos, nunca el cliente global:
 * asi es imposible registrar un movimiento fuera de una transaccion.
 */
export type Tx = Prisma.TransactionClient;
