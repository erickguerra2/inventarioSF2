import { z } from 'zod';
import {
  booleanoDeQuery,
  cantidadEntera,
  centavos,
  idSchema,
  textoCorto,
  textoLargo,
} from '../../shared/validacion.js';

/**
 * Una linea del contenido de la bolsa. Es informativa: se imprime y se entrega.
 * No tiene existencias ni precio — la unidad de inventario es la bolsa completa.
 */
export const lineaContenidoSchema = z.object({
  descripcion: textoCorto,
  cantidad: cantidadEntera,
  unidad: z.string().trim().max(30).optional(),
});

export const listarBolsasQuerySchema = z.object({
  ciclo: z.coerce.number().int().min(2000).max(2100).optional(), // por anio: ?ciclo=2026
  cicloId: idSchema.optional(),
  gradoId: idSchema.optional(),
  nivelId: idSchema.optional(),
  incluirInactivas: booleanoDeQuery.optional(),
});

export const crearBolsaBodySchema = z.object({
  gradoId: idSchema,
  cicloId: idSchema,
  precioCentavos: centavos,
  costoCentavos: centavos.optional(),
  stockMinimo: z.number().int().min(0).optional(),
  nombre: textoCorto.optional(), // por defecto: "Bolsa de utiles - <grado> - <anio>"
  notas: textoLargo.optional(),
  contenido: z.array(lineaContenidoSchema).max(200).optional(),
});

export const actualizarBolsaBodySchema = z
  .object({
    nombre: textoCorto.optional(),
    notas: textoLargo.nullable().optional(),
    precioCentavos: centavos.optional(),
    costoCentavos: centavos.nullable().optional(),
    stockMinimo: z.number().int().min(0).optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

/** Reemplazo COMPLETO de la lista: asi se reordena y se corrige en una sola operacion. */
export const reemplazarContenidoBodySchema = z.object({
  contenido: z.array(lineaContenidoSchema).max(200),
});

export const duplicarBolsaBodySchema = z.object({
  cicloId: idSchema,
});

export const paramsIdSchema = z.object({ id: idSchema });

export type LineaContenido = z.infer<typeof lineaContenidoSchema>;
export type CrearBolsaBody = z.infer<typeof crearBolsaBodySchema>;
export type ActualizarBolsaBody = z.infer<typeof actualizarBolsaBodySchema>;
