import { z } from 'zod';
import { booleanoDeQuery, centavos, idSchema, textoCorto, textoLargo } from '../../shared/validacion.js';

const tallaSchema = z.string().trim().min(1, 'la talla no puede estar vacia').max(10);
const stockMinimoSchema = z.number().int().min(0).optional();

export const varianteNuevaSchema = z.object({
  talla: tallaSchema,
  precioCentavos: centavos,
  costoCentavos: centavos.optional(),
  stockMinimo: stockMinimoSchema,
});

export const listarPrendasQuerySchema = z.object({
  categoria: z.string().trim().min(1).optional(),
  incluirInactivas: booleanoDeQuery.optional(),
});

export const crearPrendaBodySchema = z.object({
  categoriaId: idSchema,
  nombre: textoCorto,
  descripcion: textoLargo.optional(),
  tipoTalla: z.enum(['LETRA', 'NUMERO']),
  // Opcional: se puede crear la prenda con todas sus tallas de una sola vez.
  variantes: z.array(varianteNuevaSchema).optional(),
});

export const actualizarPrendaBodySchema = z
  .object({
    nombre: textoCorto.optional(),
    descripcion: textoLargo.nullable().optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

export const actualizarVarianteBodySchema = z
  .object({
    precioCentavos: centavos.optional(),
    costoCentavos: centavos.nullable().optional(),
    stockMinimo: stockMinimoSchema,
    activo: z.boolean().optional(),
    // Nota: stockActual NO esta aqui a proposito. Las existencias solo se mueven
    // con un movimiento de inventario (ver docs/plan-backend.md seccion 3).
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

export const paramsIdSchema = z.object({ id: idSchema });

export type VarianteNueva = z.infer<typeof varianteNuevaSchema>;
export type CrearPrendaBody = z.infer<typeof crearPrendaBodySchema>;
export type ActualizarPrendaBody = z.infer<typeof actualizarPrendaBodySchema>;
export type ActualizarVarianteBody = z.infer<typeof actualizarVarianteBodySchema>;
