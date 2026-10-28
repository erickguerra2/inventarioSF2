import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { NOMBRE_COOKIE, requiereAuth, usuarioActual } from '../../shared/middleware/auth.js';
import { HORAS_DE_SESION, cerrarSesion, iniciarSesion } from './auth.service.js';
import { loginBodySchema } from './auth.schemas.js';

/**
 * La sesion viaja en una cookie httpOnly firmada, no en un token que el
 * JavaScript de la pagina pueda leer: un XSS no se la puede llevar, y cerrar
 * sesion tiene efecto inmediato porque se borra la fila en la base.
 *
 * Para el frontend esto es MENOS trabajo: no hay token que guardar ni renovar,
 * solo `credentials: 'include'` en cada fetch.
 */
function opcionesCookie(): CookieSerializeOptions {
  // Con el frontend en otro dominio no hay alternativa a SameSite=None, y los
  // navegadores solo aceptan esa combinacion sobre HTTPS.
  const entreDominios = env.COOKIE_SAMESITE === 'none';

  return {
    httpOnly: true, // el JavaScript de la pagina no la puede leer
    secure: env.esProduccion || entreDominios,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    signed: true,
    maxAge: HORAS_DE_SESION * 60 * 60,
  };
}

export const rutasAuth: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    {
      // Techo anti-inundacion por IP. El freno fino contra adivinar contrasenas
      // es el bloqueo por intentos fallidos del servicio, por IP + usuario.
      config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const credenciales = loginBodySchema.parse(request.body);

      const { token, usuario } = await iniciarSesion(credenciales, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.setCookie(NOMBRE_COOKIE, token, opcionesCookie());
      return { data: { usuario } };
    },
  );

  app.post('/logout', { preHandler: requiereAuth }, async (request, reply) => {
    if (request.sesionToken) await cerrarSesion(request.sesionToken);
    reply.clearCookie(NOMBRE_COOKIE, { path: '/' });
    return { data: { ok: true } };
  });

  // El frontend llama esto al cargar: 200 hay sesion, 401 muestra el login.
  app.get('/me', { preHandler: requiereAuth }, async (request) => ({
    data: { usuario: usuarioActual(request) },
  }));
};
