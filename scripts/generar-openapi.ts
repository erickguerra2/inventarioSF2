/**
 * Vuelca la especificacion OpenAPI a un archivo, sin levantar el servidor ni
 * tocar la base de datos. Es lo que se le pasa a quien hace el frontend:
 *
 *   npm run openapi
 *   npx openapi-typescript openapi.json -o src/tipos-api.ts   # del lado del React
 */
import { writeFileSync } from 'node:fs';
import { construirEspecificacion } from '../src/docs/openapi.js';

const destino = process.argv[2] ?? 'openapi.json';
const especificacion = construirEspecificacion();

writeFileSync(destino, `${JSON.stringify(especificacion, null, 2)}\n`, 'utf8');

const rutas = Object.values(especificacion.paths).reduce(
  (suma, operaciones) => suma + Object.keys(operaciones).length,
  0,
);
console.log(`${destino}: ${Object.keys(especificacion.paths).length} rutas, ${rutas} operaciones`);
