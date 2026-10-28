import { z } from 'zod';
import { interpretarNit } from './nit.js';

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

/**
 * NIT del comprador, para la factura que se emite en el portal de la SAT.
 *
 * Devuelve el NIT ya normalizado, o `null` para consumidor final (campo vacio o
 * "C/F"). Solo rechaza lo que no se parece a un NIT; un digito verificador que
 * no cuadra se acepta y se marca, porque rechazarlo seria no poder cobrar.
 * Todo el porque esta en shared/nit.ts.
 */
export const nitDeComprador = z
  .string()
  .max(30, 'es demasiado largo para ser un NIT')
  .transform((valor, ctx) => {
    const resultado = interpretarNit(valor);
    if (!resultado.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: resultado.motivo });
      return z.NEVER;
    }
    return resultado.nit;
  });

export const booleanoDeQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((valor) => valor === true || valor === 'true' || valor === '1');
