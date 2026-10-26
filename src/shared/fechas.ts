import { env } from '../config/env.js';

/**
 * El dia de HOY en la zona del colegio, como YYYY-MM-DD.
 *
 * NO usar `new Date().toISOString().slice(0, 10)` para esto: eso da la fecha
 * UTC, y a las once de la noche en Guatemala ya es el dia siguiente en UTC.
 *
 * Esa confusion aparecio tres veces en este proyecto —el agrupado por dia de los
 * reportes, el nombre del archivo CSV y el motivo automatico de un conteo—, asi
 * que la forma correcta vive en un solo lugar y se usa desde ahi.
 *
 * Ojo: para los limites de un dia en una consulta SQL no basta con esto; los
 * calcula Postgres con AT TIME ZONE (ver reportes.service.ts).
 */
export function diaLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: env.TZ });
}
