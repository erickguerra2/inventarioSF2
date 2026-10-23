import { z } from 'zod';
import { booleanoDeQuery, idSchema, textoCorto } from '../../shared/validacion.js';
import { passwordSchema } from '../auth/auth.schemas.js';

const nombreDeUsuario = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'debe tener al menos 3 caracteres')
  .max(50)
  .regex(/^[a-z0-9._-]+$/, 'solo letras, numeros, punto, guion y guion bajo (p. ej. lucia.m)');

export const listarUsuariosQuerySchema = z.object({
  incluirInactivos: booleanoDeQuery.optional(),
});

export const crearUsuarioBodySchema = z.object({
  usuario: nombreDeUsuario,
  nombre: textoCorto, // el nombre completo: es lo que sale en los reportes
  email: z.string().trim().email('no es un correo valido').optional(),
  rol: z.enum(['ADMIN', 'VENDEDOR']),
  password: passwordSchema,
});

export const actualizarUsuarioBodySchema = z
  .object({
    nombre: textoCorto.optional(),
    email: z.string().trim().email().nullable().optional(),
    rol: z.enum(['ADMIN', 'VENDEDOR']).optional(),
    activo: z.boolean().optional(),
    // El usuario (login) no se cambia: es la identidad con la que quedaron
    // firmadas sus ventas y sus movimientos.
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

export const cambiarPasswordBodySchema = z.object({
  password: passwordSchema,
});

export const paramsIdSchema = z.object({ id: idSchema });

export type CrearUsuarioBody = z.infer<typeof crearUsuarioBodySchema>;
export type ActualizarUsuarioBody = z.infer<typeof actualizarUsuarioBodySchema>;
