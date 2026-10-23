/**
 * Borra las sesiones vencidas. Pensado para una tarea diaria en el servidor:
 *
 *   0 3 * * *  cd /ruta/al/proyecto && npm run sesiones:limpiar
 *
 * No es urgente para el funcionamiento (una sesion vencida no sirve para entrar),
 * pero evita que la tabla crezca para siempre.
 */
import 'dotenv/config';
import { limpiarSesionesExpiradas } from '../src/modules/auth/auth.service.js';
import { prisma } from '../src/shared/prisma.js';

try {
  const borradas = await limpiarSesionesExpiradas();
  console.log(`Sesiones expiradas borradas: ${borradas}`);
} catch (error) {
  console.error('No se pudieron limpiar las sesiones:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
