import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { rutasAuth } from './modules/auth/auth.routes.js';
import { rutasBolsas } from './modules/bolsas/bolsas.routes.js';
import { rutasEscolar } from './modules/escolar/escolar.routes.js';
import { rutasAdmin, rutasInventario } from './modules/inventario/inventario.routes.js';
import { rutasUniformes } from './modules/uniformes/uniformes.routes.js';
import { rutasUsuarios } from './modules/usuarios/usuarios.routes.js';
import { rutasVentas } from './modules/ventas/ventas.routes.js';
import { cargarSesion } from './shared/middleware/auth.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { prisma } from './shared/prisma.js';

export async function construirApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.esProduccion ? 'info' : 'debug',
      // Nunca loguear cookies, cabeceras de autorizacion ni cuerpos de login.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 1_000_000, // 1 MB: ninguna peticion de este sistema necesita mas
    trustProxy: env.esProduccion, // detras de nginx, para que request.ip sea la real
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  // En produccion el frontend va en el MISMO dominio y no hace falta CORS.
  // En desarrollo, el puerto de Vite.
  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
    credentials: true, // la sesion viaja en cookie
  });

  await app.register(cookie, { secret: env.SESSION_SECRET });

  await app.register(rateLimit, {
    global: false, // solo las rutas que lo piden (hoy: /auth/login)
    hook: 'preHandler', // despues de parsear el body
    errorResponseBuilder: (_request, contexto) => ({
      error: {
        code: 'DEMASIADOS_INTENTOS',
        message: `Demasiadas peticiones. Intente de nuevo en ${Math.ceil(contexto.ttl / 1000)} segundos.`,
      },
    }),
  });

  // Varias rutas son POST sin cuerpo (/auth/logout, /ciclos/:id/activar). Si el
  // cliente manda Content-Type: application/json con el cuerpo vacio —cosa que
  // hacen varias librerias del navegador— Fastify responderia 400 por no poder
  // parsearlo. Un POST sin cuerpo es valido aqui.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, cuerpo, listo) => {
      const texto = (cuerpo as string).trim();
      if (texto === '') return listo(null, undefined);
      try {
        listo(null, JSON.parse(texto));
      } catch (error) {
        listo(error as Error, undefined);
      }
    },
  );

  // Carga la sesion si viene cookie. No rechaza: cada ruta declara lo que exige.
  app.addHook('onRequest', cargarSesion);

  app.setErrorHandler(errorHandler);

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NO_ENCONTRADO',
        message: `No existe la ruta ${request.method} ${request.url}`,
      },
    });
  });

  // Publicas: para monitoreo y para saber si el servicio esta vivo.
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

  await app.register(rutasAuth, { prefix: '/api/v1/auth' });
  await app.register(rutasUsuarios, { prefix: '/api/v1/usuarios' });
  await app.register(rutasEscolar, { prefix: '/api/v1' });
  await app.register(rutasUniformes, { prefix: '/api/v1/uniformes' });
  await app.register(rutasBolsas, { prefix: '/api/v1/bolsas' });
  await app.register(rutasVentas, { prefix: '/api/v1/ventas' });
  await app.register(rutasInventario, { prefix: '/api/v1/inventario' });
  await app.register(rutasAdmin, { prefix: '/api/v1/admin' });

  return app;
}
