import { z } from 'zod';

/** Dinero: SIEMPRE entero en centavos de quetzal. Q125.50 -> 12550. */
export const centavos = z
  .number({ invalid_type_error: 'debe ser un entero en centavos (Q125.50 se manda como 12550)' })
  .int('debe ser un entero en centavos, sin decimales')
  .min(0, 'no puede ser negativo')
  .max(100_000_000, 'parece un error: supera Q1,000,000');

export const idSchema = z.string().min(1, 'id invalido');

export const textoCorto = z.string().trim().min(1, 'no puede estar vacio').max(200);
export const textoLargo = z.string().trim().max(2000);

export const cantidadEntera = z
  .number({ invalid_type_error: 'debe ser un numero entero' })
  .int('debe ser un numero entero')
  .min(1, 'debe ser al menos 1');

export const booleanoDeQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((valor) => valor === true || valor === 'true' || valor === '1');
