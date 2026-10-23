import { z } from 'zod';
import { booleanoDeQuery, centavos, idSchema, textoCorto } from '../../shared/validacion.js';

const fechaDesde = z
  .string()
  .transform((valor) => new Date(valor.includes('T') ? valor : `${valor}T00:00:00`))
  .refine((fecha) => !Number.isNaN(fecha.getTime()), { message: 'fecha invalida' });

const fechaHasta = z
  .string()
  .transform((valor) => new Date(valor.includes('T') ? valor : `${valor}T23:59:59.999`))
  .refine((fecha) => !Number.isNaN(fecha.getTime()), { message: 'fecha invalida' });

export const crearVentaBodySchema = z.object({
  // El frontend manda itemId, NO el id de la variante ni el de la bolsa: el item
  // es la unidad de inventario, y sirve igual para una talla que para una bolsa.
  lineas: z
    .array(
      z.object({
        itemId: idSchema,
        cantidad: z.number().int().min(1, 'debe ser al menos 1').max(1000),
      }),
    )
    .min(1, 'una venta sin lineas no es una venta'),
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA']),
  // Ambos opcionales: en la ventanilla a veces solo se cobra, y el recibo con su
  // correlativo es el comprobante. El padron de alumnos es Fase 6.
  alumnoId: idSchema.optional(),
  compradorNombre: textoCorto.optional(),
  referenciaPago: textoCorto.optional(), // no. de boleta o transferencia
  descuentoCentavos: centavos.optional(),
  // El precio NO se recibe del cliente: lo pone el servidor. Si el frontend
  // pudiera mandarlo, cualquiera se compraria un uniforme a Q1.
});

export const anularVentaBodySchema = z.object({
  motivo: textoCorto,
});

export const listarVentasQuerySchema = z.object({
  desde: fechaDesde.optional(),
  hasta: fechaHasta.optional(),
  estado: z.enum(['PAGADA', 'ANULADA']).optional(),
  // Para una maestra este filtro se ignora: el backend lo fuerza a su propio id.
  usuarioId: idSchema.optional(),
  alumnoId: idSchema.optional(),
  soloConDescuento: booleanoDeQuery.optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const paramsIdSchema = z.object({ id: idSchema });

/**
 * El doble clic en "Cobrar" y el reintento tras un timeout son hechos, no
 * hipotesis: la clave de idempotencia es obligatoria para que el segundo intento
 * no cobre dos veces.
 */
export const idempotencyKeySchema = z
  .string({ required_error: 'Falta la cabecera Idempotency-Key' })
  .trim()
  .min(8, 'la Idempotency-Key debe tener al menos 8 caracteres')
  .max(200);

export type CrearVentaBody = z.infer<typeof crearVentaBodySchema>;
export type ListarVentasQuery = z.infer<typeof listarVentasQuerySchema>;
