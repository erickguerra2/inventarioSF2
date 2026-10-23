import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { rutasBolsas } from './modules/bolsas/bolsas.routes.js';
import { rutasEscolar } from './modules/escolar/escolar.routes.js';
import { rutasAdmin, rutasInventario } from './modules/inventario/inventario.routes.js';
import { rutasUniformes } from './modules/uniformes/uniformes.routes.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { prisma } from './shared/prisma.js';

export async function construirApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.esProduccion ? 'info' : 'debug',
      // Nunca loguear cuerpos de login, cookies ni contrasenas.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 1_000_000, // 1 MB: ninguna peticion de catalogo necesita mas
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  // En produccion el frontend va en el MISMO dominio y no hace falta CORS.
  // En desarrollo, el puerto de Vite.
  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
    credentials: true,
  });

  app.setErrorHandler(errorHandler);

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NO_ENCONTRADO',
        message: `No existe la ruta ${request.method} ${request.url}`,
      },
    });
  });

  app.get('/health', async () => ({
    ok: true,
    servicio: 'inventario-ccsf2',
    ambiente: env.NODE_ENV,
    hora: new Date().toISOString(),
  }));

  app.get('/health/db', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, db: 'conectada' };
  });

  await app.register(rutasEscolar, { prefix: '/api/v1' });
  await app.register(rutasUniformes, { prefix: '/api/v1/uniformes' });
  await app.register(rutasBolsas, { prefix: '/api/v1/bolsas' });
  await app.register(rutasInventario, { prefix: '/api/v1/inventario' });
  await app.register(rutasAdmin, { prefix: '/api/v1/admin' });

  return app;
}
