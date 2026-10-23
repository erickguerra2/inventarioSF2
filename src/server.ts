import { construirApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './shared/prisma.js';

const app = await construirApp();

// En produccion escucha en todas las interfaces porque nginx le hace proxy.
// En desarrollo, solo local.
const host = env.esProduccion ? '0.0.0.0' : '127.0.0.1';

try {
  await app.listen({ port: env.PORT, host });
} catch (error) {
  app.log.error({ err: error }, 'No se pudo iniciar el servidor');
  await prisma.$disconnect();
  process.exit(1);
}

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void (async () => {
      app.log.info(`${senal} recibido, cerrando`);
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    })();
  });
}
