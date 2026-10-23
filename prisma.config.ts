// Configuracion del CLI de Prisma. Reemplaza al bloque "prisma" de package.json,
// que queda deprecado en Prisma 7.
//
// Con un prisma.config.ts, Prisma ya no carga el .env por su cuenta: el import de
// dotenv de abajo es lo que hace que DATABASE_URL llegue a los comandos del CLI.
import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
