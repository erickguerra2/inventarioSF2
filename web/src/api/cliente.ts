/**
 * El unico lugar que habla con el backend.
 *
 * Dos cosas que no hay que quitar:
 *
 * - `credentials: 'include'`. La sesion va en una cookie httpOnly; sin esto,
 *   TODO responde 401 y cuesta una tarde descubrir por que.
 * - El sobre. El contenido de cada respuesta viene en `data`, y cuando `data` es
 *   una lista los metadatos (`meta`, `resumen`, `totales`, `notas`) vienen como
 *   hermanos. De ahi que haya dos funciones: `api` devuelve `data`, y
 *   `apiConMeta` devuelve el cuerpo completo.
 */

/**
 * De donde cuelga la API.
 *
 * - En desarrollo queda vacio: Vite hace proxy de /api al backend, asi que la
 *   peticion es del mismo origen y la cookie viaja sola.
 * - En produccion, si el backend vive en otro dominio (Render), se compila con
 *   VITE_API_URL apuntando ahi.
 */
const BASE = import.meta.env['VITE_API_URL']?.replace(/\/+$/, '') ?? '';

/** La URL completa de un endpoint. Para enlaces de descarga, que no pasan por fetch. */
export function urlApi(ruta: string): string {
  return `${BASE}/api/v1${ruta}`;
}

export class ErrorApi extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ErrorApi';
  }

  get esSesionVencida(): boolean {
    return this.status === 401;
  }
}

type Opciones = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Solo para POST /ventas: el mismo valor en todos los reintentos. */
  idempotencyKey?: string;
};

async function pedir(ruta: string, opciones: Opciones = {}): Promise<unknown> {
  const { body, idempotencyKey, headers, ...resto } = opciones;

  const respuesta = await fetch(urlApi(ruta), {
    ...resto,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
      ...headers,
    },
  });

  if (respuesta.status === 204) return undefined;

  const cuerpo = (await respuesta.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    | null;

  if (!respuesta.ok) {
    throw new ErrorApi(
      cuerpo?.error?.code ?? 'ERROR_INTERNO',
      cuerpo?.error?.message ?? 'Ocurrió un error inesperado',
      respuesta.status,
      cuerpo?.error?.details,
    );
  }

  return cuerpo;
}

/** Para un recurso o una lista sin metadatos: devuelve lo que viene en `data`. */
export async function api<T>(ruta: string, opciones?: Opciones): Promise<T> {
  const cuerpo = (await pedir(ruta, opciones)) as { data: T } | undefined;
  return cuerpo?.data as T;
}

/** Para una lista con metadatos: devuelve el cuerpo completo (`data` + hermanos). */
export async function apiConMeta<T>(ruta: string, opciones?: Opciones): Promise<T> {
  return (await pedir(ruta, opciones)) as T;
}

export type RespuestaPaginada<T> = {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
};
