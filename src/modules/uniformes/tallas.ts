import type { TipoTalla } from '@prisma/client';
import { BadRequest } from '../../shared/errors.js';

/**
 * El orden de las tallas es un dato del dominio, no algo que el frontend calcule:
 * ordenar alfabeticamente da L, M, S, XL, XS, que no le sirve a nadie.
 */
const ORDEN_LETRA: Record<string, number> = {
  XXS: 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  XXXL: 7,
};

export function normalizarTalla(talla: string, tipoTalla: TipoTalla): string {
  const limpia = talla.trim();
  if (tipoTalla === 'NUMERO') {
    const numero = Number(limpia);
    if (!Number.isInteger(numero) || numero <= 0) {
      throw new BadRequest(`La talla "${talla}" debe ser un numero entero positivo (28, 30, 32...)`);
    }
    return String(numero);
  }
  return limpia.toUpperCase();
}

export function ordenDeTalla(talla: string, tipoTalla: TipoTalla): number {
  const normalizada = normalizarTalla(talla, tipoTalla);

  if (tipoTalla === 'NUMERO') {
    return Number(normalizada);
  }

  const orden = ORDEN_LETRA[normalizada];
  if (orden === undefined) {
    throw new BadRequest(
      `La talla "${talla}" no esta reconocida. Validas: ${Object.keys(ORDEN_LETRA).join(', ')}`,
      { tallasValidas: Object.keys(ORDEN_LETRA) },
    );
  }
  return orden;
}
