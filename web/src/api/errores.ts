import { ErrorApi } from './cliente.ts';

/**
 * Mensajes por `code`, no por el texto del backend. El catalogo de codigos es
 * cerrado y esta en docs/plan-backend.md; si aparece uno que no esta aqui, se
 * muestra el mensaje del servidor, que siempre viene en espanol.
 */
const MENSAJES: Record<string, string> = {
  NO_AUTENTICADO: 'Su sesión terminó. Vuelva a iniciar sesión.',
  SIN_PERMISO: 'Esta acción es solo de la administradora.',
  NO_ENCONTRADO: 'No se encontró lo que buscaba.',
  STOCK_INSUFICIENTE: 'No hay suficientes existencias.',
  ITEM_INACTIVO: 'Ese producto ya no está disponible.',
  VENTA_YA_ANULADA: 'Esta venta ya estaba anulada.',
  RECURSO_DUPLICADO: 'Ya existe un registro con esos datos.',
  SKU_DUPLICADO: 'Ya existe un producto con ese código.',
  CICLO_CERRADO: 'Ese ciclo escolar ya cerró.',
  RESTRICCION_BD: 'La operación choca con otros registros.',
  ERROR_INTERNO: 'Ocurrió un error inesperado. Intente de nuevo.',
};

export function mensajeDeError(error: unknown): string {
  if (!(error instanceof ErrorApi)) {
    // Ni ErrorApi ni nada reconocible: casi siempre es que el backend no esta
    // corriendo (fetch falla sin respuesta).
    return 'No se pudo conectar con el servidor. ¿Está corriendo el backend?';
  }

  if (error.code === 'STOCK_INSUFICIENTE') {
    const disponible = error.details?.['disponible'];
    if (typeof disponible === 'number') {
      return disponible === 0 ? 'Ya no hay existencias de ese producto.' : `Solo quedan ${disponible}.`;
    }
  }

  if (error.code === 'DEMASIADOS_INTENTOS') {
    const segundos = error.details?.['segundosRestantes'];
    if (typeof segundos === 'number') {
      return `Demasiados intentos. Espere ${Math.ceil(segundos / 60)} minuto(s).`;
    }
  }

  /**
   * "Los datos enviados no son válidos" no le sirve a nadie: el motivo de
   * verdad viene por campo. Se juntan, porque casi siempre es uno solo y verlo
   * ahorra adivinar cual de los campos esta mal.
   */
  if (error.code === 'VALIDACION') {
    const motivos = Object.values(camposInvalidos(error));
    if (motivos.length > 0) return motivos.join('. ');
  }

  return MENSAJES[error.code] ?? error.message;
}

/** Los campos que el backend rechazo, para marcarlos en un formulario. */
export function camposInvalidos(error: unknown): Record<string, string> {
  if (!(error instanceof ErrorApi) || error.code !== 'VALIDACION') return {};

  const campos = error.details?.['campos'];
  if (!Array.isArray(campos)) return {};

  const resultado: Record<string, string> = {};
  for (const campo of campos as Array<{ campo?: string; mensaje?: string }>) {
    if (campo.campo) resultado[campo.campo] = campo.mensaje ?? 'Dato inválido';
  }
  return resultado;
}
