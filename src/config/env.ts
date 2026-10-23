// Validacion del entorno al arrancar: es mejor fallar ahora que a medianoche en
// la primera venta. Si falta algo, el proceso no levanta.
import 'dotenv/config';
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.string().default('America/Guatemala'),
  DATABASE_URL: z.string().min(1, 'es obligatoria'),
  SESSION_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  MEDIA_BASE_URL: z.string().url('debe ser una URL absoluta, p. ej. https://inventario.ccsf2.edu.gt'),
  // Separados por coma. En produccion el frontend va en el mismo dominio y esto
  // queda vacio; en desarrollo es el puerto de Vite.
  CORS_ORIGINS: z.string().default(''),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error('\nVariables de entorno invalidas (ver .env.example):');
  for (const problema of resultado.error.issues) {
    console.error(`  - ${problema.path.join('.') || '(raiz)'}: ${problema.message}`);
  }
  console.error('');
  process.exit(1);
}

const datos = resultado.data;

export const env = {
  ...datos,
  corsOrigins: datos.CORS_ORIGINS.split(',')
    .map((origen) => origen.trim())
    .filter(Boolean),
  esProduccion: datos.NODE_ENV === 'production',
  esDesarrollo: datos.NODE_ENV === 'development',
};
