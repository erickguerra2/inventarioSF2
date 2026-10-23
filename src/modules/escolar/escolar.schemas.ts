import { z } from 'zod';
import { idSchema, textoCorto } from '../../shared/validacion.js';

export const crearNivelBodySchema = z.object({
  nombre: textoCorto,
  orden: z.number().int().min(0),
});

export const crearGradoBodySchema = z.object({
  nivelId: idSchema,
  nombre: textoCorto,
  orden: z.number().int().min(0),
});

export const listarGradosQuerySchema = z.object({
  nivelId: idSchema.optional(),
});

export const crearCicloBodySchema = z.object({
  anio: z.number().int().min(2000).max(2100),
  activo: z.boolean().optional(),
});

export const paramsIdSchema = z.object({ id: idSchema });
