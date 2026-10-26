import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErrorApi } from '../api/cliente.ts';
import type { UsuarioSesion } from '../api/modelos.ts';

const CLAVE = ['sesion'] as const;

type RespuestaSesion = { usuario: UsuarioSesion };

/**
 * Todo el manejo de sesion del lado del cliente es esto: una consulta a
 * /auth/me. Si responde 200 hay sesion, si responde 401 hay que mostrar el
 * login. No hay token que guardar, ni refrescar, ni decidir donde: la cookie
 * httpOnly la maneja el navegador.
 */
export function useSesion() {
  const consulta = useQuery({
    queryKey: CLAVE,
    queryFn: () => api<RespuestaSesion>('/auth/me'),
    retry: false, // un 401 no se reintenta: es la respuesta, no una falla
    staleTime: 5 * 60 * 1000,
  });

  const sinSesion = consulta.error instanceof ErrorApi && consulta.error.esSesionVencida;

  return {
    usuario: consulta.data?.usuario ?? null,
    cargando: consulta.isPending,
    /** Un error que NO es "no hay sesion": backend caido, por ejemplo. */
    errorInesperado: sinSesion ? null : consulta.error,
  };
}

export function useIniciarSesion() {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (credenciales: { usuario: string; password: string }) =>
      api<RespuestaSesion>('/auth/login', { method: 'POST', body: credenciales }),
    onSuccess: (datos) => {
      cliente.setQueryData(CLAVE, datos);
    },
  });
}

export function useCerrarSesion() {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: () => api<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Se limpia todo el cache: lo que vio esta persona no debe quedar
      // disponible para la siguiente que use la misma computadora.
      cliente.clear();
    },
  });
}

export function esAdmin(usuario: UsuarioSesion | null): boolean {
  return usuario?.rol === 'ADMIN';
}
