import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';

/** La misma que usa el seed. */
export const PASSWORD_SEED = process.env['SEED_ADMIN_PASSWORD'] ?? 'inventario-dev-2026';

/**
 * Hace login y devuelve la cookie tal como la reenviaria un navegador (incluida
 * la firma), para poder mandarla en las siguientes peticiones.
 */
export async function iniciarSesion(
  app: FastifyInstance,
  usuario: string,
  password: string = PASSWORD_SEED,
) {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { usuario, password },
  });

  expect(respuesta.statusCode).toBe(200);

  const cabecera = respuesta.headers['set-cookie'];
  const cruda = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  if (!cruda) throw new Error('El login no devolvio la cookie de sesion');

  return {
    cookie: cruda.split(';')[0] as string,
    usuario: respuesta.json().data.usuario as { id: string; usuario: string; rol: string },
  };
}

/** Cliente con la sesion puesta, para no repetir headers en cada peticion. */
export function clienteConSesion(app: FastifyInstance, cookie: string) {
  const headers = { cookie };
  return {
    get: (url: string) => app.inject({ method: 'GET', url, headers }),
    post: (url: string, payload?: unknown) =>
      app.inject({ method: 'POST', url, payload: payload as never, headers }),
    patch: (url: string, payload?: unknown) =>
      app.inject({ method: 'PATCH', url, payload: payload as never, headers }),
    put: (url: string, payload?: unknown) =>
      app.inject({ method: 'PUT', url, payload: payload as never, headers }),
    delete: (url: string) => app.inject({ method: 'DELETE', url, headers }),
  };
}

export type ClienteApi = ReturnType<typeof clienteConSesion>;

export async function comoAdmin(app: FastifyInstance): Promise<ClienteApi> {
  const { cookie } = await iniciarSesion(app, 'admin');
  return clienteConSesion(app, cookie);
}

export async function comoMaestra(app: FastifyInstance): Promise<ClienteApi> {
  const { cookie } = await iniciarSesion(app, 'lucia.m');
  return clienteConSesion(app, cookie);
}
