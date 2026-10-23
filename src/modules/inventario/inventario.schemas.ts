import { z } from 'zod';
import { booleanoDeQuery, idSchema, textoCorto } from '../../shared/validacion.js';

/**
 * Movimientos que la administradora puede registrar a mano. VENTA y
 * ANULACION_VENTA NO estan aqui: esos los genera el modulo de ventas, y
 * permitirlos por aqui ensuciaria el ledger de ventas con movimientos sin venta.
 */
export const tiposManuales = [
  'ENTRADA',
  'APERTURA',
  'DEVOLUCION',
  'AJUSTE_POS',
  'AJUSTE_NEG',
  'MERMA',
] as const;

/** Tipos que exigen explicar por que: un ajuste sin motivo es un descuadre futuro. */
export const tiposQueExigenMotivo = new Set(['AJUSTE_POS', 'AJUSTE_NEG', 'MERMA']);

/**
 * SIEMPRE positiva: es una magnitud, y el tipo de movimiento define si entra o
 * sale. Asi no existe la posibilidad de mandar un "AJUSTE_POS de -5".
 */
const magnitud = z
  .number({ invalid_type_error: 'debe ser un numero entero de unidades' })
  .int('debe ser un numero entero de unidades')
  .min(1, 'debe ser al menos 1')
  .max(100_000, 'parece un error: son demasiadas unidades');

const fechaDesde = z
  .string()
  .transform((valor) => new Date(valor.includes('T') ? valor : `${valor}T00:00:00`))
  .refine((fecha) => !Number.isNaN(fecha.getTime()), { message: 'fecha invalida' });

const fechaHasta = z
  .string()
  .transform((valor) => new Date(valor.includes('T') ? valor : `${valor}T23:59:59.999`))
  .refine((fecha) => !Number.isNaN(fecha.getTime()), { message: 'fecha invalida' });

export const listarInventarioQuerySchema = z.object({
  tipo: z.enum(['UNIFORME_TALLA', 'BOLSA_UTILES']).optional(),
  q: z.string().trim().min(1).max(100).optional(), // busca en sku y nombre
  bajoStock: booleanoDeQuery.optional(),
  incluirInactivos: booleanoDeQuery.optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const movimientoManualBodySchema = z
  .object({
    cantidad: magnitud,
    tipo: z.enum(tiposManuales),
    motivo: textoCorto.optional(),
  })
  .refine((datos) => !tiposQueExigenMotivo.has(datos.tipo) || Boolean(datos.motivo), {
    message: 'Los ajustes y las mermas exigen un motivo',
    path: ['motivo'],
  });

export const entradasBodySchema = z.object({
  motivo: textoCorto,
  // APERTURA solo para la carga inicial del inventario.
  tipo: z.enum(['ENTRADA', 'APERTURA']).default('ENTRADA'),
  lineas: z
    .array(z.object({ itemId: idSchema, cantidad: magnitud }))
    .min(1, 'hay que enviar al menos una linea'),
});

export const conteoBodySchema = z.object({
  motivo: textoCorto.optional(),
  lineas: z
    .array(
      z.object({
        itemId: idSchema,
        // Lo que se encontro fisicamente al contar. Puede ser 0.
        contado: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1, 'hay que enviar al menos una linea'),
});

export const kardexQuerySchema = z.object({
  desde: fechaDesde.optional(),
  hasta: fechaHasta.optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});

export const paramsItemIdSchema = z.object({ itemId: idSchema });

export type MovimientoManualBody = z.infer<typeof movimientoManualBodySchema>;
export type EntradasBody = z.infer<typeof entradasBodySchema>;
export type ConteoBody = z.infer<typeof conteoBodySchema>;
export type KardexQuery = z.infer<typeof kardexQuerySchema>;
export type ListarInventarioQuery = z.infer<typeof listarInventarioQuerySchema>;
