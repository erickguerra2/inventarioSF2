import { z } from 'zod';
import { idSchema } from '../../shared/validacion.js';

const soloFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'el formato es YYYY-MM-DD')
  .optional();

const fechaDesde = z
  .string()
  .transform((valor) => new Date(valor.includes('T') ? valor : `${valor}T00:00:00`))
  .refine((fecha) => !Number.isNaN(fecha.getTime()), { message: 'fecha invalida' });

const fechaHasta = z
  .string()
  .transform((valor) => new Date(valor.includes('T') ? valor : `${valor}T23:59:59.999`))
  .refine((fecha) => !Number.isNaN(fecha.getTime()), { message: 'fecha invalida' });

export const formatoSchema = z.enum(['json', 'csv']).default('json');

export const corteCajaQuerySchema = z.object({
  /** Dia a cortar, YYYY-MM-DD en hora de Guatemala. Por omision, hoy. */
  fecha: soloFecha,
  /** Para una maestra se ignora: el backend lo fuerza a su propio id. */
  usuarioId: idSchema.optional(),
  formato: formatoSchema,
});

export const ventasQuerySchema = z.object({
  desde: fechaDesde.optional(),
  hasta: fechaHasta.optional(),
  agrupar: z.enum(['dia', 'usuario', 'tipo', 'grado']).default('dia'),
  formato: formatoSchema,
});

export const tallasQuerySchema = z.object({
  desde: fechaDesde.optional(),
  hasta: fechaHasta.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  formato: formatoSchema,
});

export const existenciasQuerySchema = z.object({
  formato: formatoSchema,
});

export const bolsasPorGradoQuerySchema = z.object({
  cicloId: idSchema.optional(),
  ciclo: z.coerce.number().int().min(2000).max(2100).optional(),
  formato: formatoSchema,
});

export type CorteCajaQuery = z.infer<typeof corteCajaQuerySchema>;
export type VentasQuery = z.infer<typeof ventasQuerySchema>;
export type TallasQuery = z.infer<typeof tallasQuerySchema>;
export type BolsasPorGradoQuery = z.infer<typeof bolsasPorGradoQuerySchema>;
