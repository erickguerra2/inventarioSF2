import type { Rol } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { sesionDesdeToken } from '../../modules/auth/auth.service.js';
import { NoAutenticado, SinPermiso } from '../errors.js';

export type UsuarioSesion = {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
};

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioSesion;
    sesionToken?: string;
  }
}

export const NOMBRE_COOKIE = 'sid';

/**
 * Hook global: si viene una cookie valida, deja el usuario en la peticion.
 * NO rechaza nada — de eso se encargan requiereAuth y requiereRol, para que cada
 * ruta diga explicitamente que necesita.
 */
export async function cargarSesion(request: FastifyRequest): Promise<void> {
  const cookieFirmada = request.cookies[NOMBRE_COOKIE];
  if (!cookieFirmada) return;

  const { valid, value } = request.unsignCookie(cookieFirmada);
  if (!valid || !value) return;

  const usuario = await sesionDesdeToken(value);
  if (usuario) {
    request.usuario = usuario;
    request.sesionToken = value;
  }
}

/** El usuario de la peticion. Lanza 401 si no hay sesion. */
export function usuarioActual(request: FastifyRequest): UsuarioSesion {
  if (!request.usuario) throw new NoAutenticado();
  return request.usuario;
}

export async function requiereAuth(request: FastifyRequest): Promise<void> {
  usuarioActual(request);
}

/**
 * Permiso declarativo por ruta. Lo que es facil de olvidar es el `if` que no se
 * escribio, asi que el permiso se declara junto a la ruta y no dentro del handler.
 */
export function requiereRol(...roles: Rol[]) {
  return async function verificarRol(request: FastifyRequest): Promise<void> {
    const usuario = usuarioActual(request);
    if (!roles.includes(usuario.rol)) {
      throw new SinPermiso(
        'Esta accion es solo para la administradora. Si necesita hacerla, pidasela a ella.',
      );
    }
  };
}
