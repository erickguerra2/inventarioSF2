import { z } from 'zod';

export const loginBodySchema = z.object({
  usuario: z.string().trim().min(1, 'hay que indicar el usuario').max(50),
  password: z.string().min(1, 'hay que indicar la contrasena').max(200),
});

/**
 * Minimo 8 caracteres. No se exigen mayusculas ni simbolos: con pocas cuentas
 * internas, esas reglas producen contrasenas apuntadas en un papel, no mas
 * seguridad. El freno real contra adivinarlas es el bloqueo por intentos.
 */
export const passwordSchema = z
  .string()
  .min(8, 'debe tener al menos 8 caracteres')
  .max(200, 'es demasiado larga');

export type LoginBody = z.infer<typeof loginBodySchema>;
