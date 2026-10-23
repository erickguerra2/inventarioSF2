import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { aCsv, nombreDeArchivo, type Columna } from '../../shared/csv.js';
import { aQuetzales } from '../../shared/dinero.js';
import { requiereAuth, requiereRol, usuarioActual } from '../../shared/middleware/auth.js';
import * as servicio from './reportes.service.js';
import {
  bolsasPorGradoQuerySchema,
  corteCajaQuerySchema,
  existenciasQuerySchema,
  tallasQuerySchema,
  ventasQuerySchema,
} from './reportes.schemas.js';

function enviarCsv<T>(
  reply: FastifyReply,
  filas: T[],
  columnas: Array<Columna<T>>,
  base: string,
  sufijo?: string,
) {
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${nombreDeArchivo(base, sufijo)}"`)
    .send(aCsv(filas, columnas));
}

const soloAdmin = { preHandler: requiereRol('ADMIN') };

/**
 * Forma de las respuestas (la misma que el resto de la API):
 *
 * - Un reporte con FILAS las pone en `data` y deja sus totales y notas como
 *   hermanos, igual que /ventas o /inventario: `{ data: [...], totales, notas }`.
 *   Los servicios ya devuelven exactamente eso, asi que la ruta no lo envuelve.
 * - El corte de caja NO es una lista: es un solo objeto (el corte del dia), asi
 *   que va envuelto como cualquier recurso: `{ data: corte }`.
 */

export const rutasReportes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereAuth);

  /**
   * El unico reporte que una maestra puede ver, y solo el suyo: es lo que
   * necesita para cuadrar lo que entrega al final del dia.
   */
  app.get('/corte-caja', async (request, reply) => {
    const filtros = corteCajaQuerySchema.parse(request.query);
    const usuario = usuarioActual(request);
    const reporte = await servicio.corteDeCaja(filtros, usuario);

    if (filtros.formato === 'csv') {
      return enviarCsv(
        reply,
        reporte.porMaestra,
        [
          { titulo: 'Maestra', valor: (fila) => fila.nombre },
          { titulo: 'Usuario', valor: (fila) => fila.usuario },
          { titulo: 'Ventas', valor: (fila) => fila.ventas },
          { titulo: 'Efectivo (Q)', valor: (fila) => aQuetzales(fila.porMetodo['EFECTIVO'] ?? 0) },
          {
            titulo: 'Transferencia (Q)',
            valor: (fila) => aQuetzales(fila.porMetodo['TRANSFERENCIA'] ?? 0),
          },
          { titulo: 'Deposito (Q)', valor: (fila) => aQuetzales(fila.porMetodo['DEPOSITO'] ?? 0) },
          { titulo: 'Tarjeta (Q)', valor: (fila) => aQuetzales(fila.porMetodo['TARJETA'] ?? 0) },
          { titulo: 'Total cobrado (Q)', valor: (fila) => aQuetzales(fila.cobradoCentavos) },
          {
            titulo: 'A entregar en efectivo (Q)',
            valor: (fila) => aQuetzales(fila.aEntregarEnEfectivoCentavos),
          },
        ],
        'corte-caja',
        reporte.fecha,
      );
    }

    return { data: reporte };
  });

  app.get('/ventas', soloAdmin, async (request, reply) => {
    const filtros = ventasQuerySchema.parse(request.query);
    const reporte = await servicio.ventasAgrupadas(filtros);

    if (filtros.formato === 'csv') {
      return enviarCsv(
        reply,
        reporte.data,
        [
          { titulo: 'Clave', valor: (fila) => fila.clave },
          { titulo: 'Detalle', valor: (fila) => fila.etiqueta },
          { titulo: 'Ventas', valor: (fila) => fila.ventas },
          { titulo: 'Unidades', valor: (fila) => fila.unidades },
          { titulo: 'Total (Q)', valor: (fila) => aQuetzales(fila.totalCentavos) },
        ],
        'ventas',
        filtros.agrupar,
      );
    }

    return reporte;
  });

  app.get('/tallas-mas-vendidas', soloAdmin, async (request, reply) => {
    const filtros = tallasQuerySchema.parse(request.query);
    const reporte = await servicio.tallasMasVendidas(filtros);

    if (filtros.formato === 'csv') {
      return enviarCsv(
        reply,
        reporte.data,
        [
          { titulo: 'SKU', valor: (fila) => fila.sku },
          { titulo: 'Prenda', valor: (fila) => fila.prenda },
          { titulo: 'Talla', valor: (fila) => fila.talla },
          { titulo: 'Unidades vendidas', valor: (fila) => fila.unidades },
          { titulo: 'Total (Q)', valor: (fila) => aQuetzales(fila.totalCentavos) },
          { titulo: 'Existencia hoy', valor: (fila) => fila.stockActual },
        ],
        'tallas-mas-vendidas',
      );
    }

    return reporte;
  });

  app.get('/existencias-valorizadas', soloAdmin, async (request, reply) => {
    const filtros = existenciasQuerySchema.parse(request.query);
    const reporte = await servicio.existenciasValorizadas();

    if (filtros.formato === 'csv') {
      return enviarCsv(
        reply,
        reporte.data,
        [
          { titulo: 'Tipo', valor: (fila) => fila.tipo },
          { titulo: 'Items', valor: (fila) => fila.items },
          { titulo: 'Unidades', valor: (fila) => fila.unidades },
          { titulo: 'Valor (Q)', valor: (fila) => aQuetzales(fila.valorCentavos) },
          { titulo: 'Items sin costo', valor: (fila) => fila.itemsSinCosto },
          { titulo: 'Unidades sin costo', valor: (fila) => fila.unidadesSinCosto },
        ],
        'existencias-valorizadas',
      );
    }

    return reporte;
  });

  app.get('/bolsas-por-grado', soloAdmin, async (request, reply) => {
    const filtros = bolsasPorGradoQuerySchema.parse(request.query);
    const reporte = await servicio.bolsasPorGrado(filtros);

    if (filtros.formato === 'csv') {
      return enviarCsv(
        reply,
        reporte.data,
        [
          { titulo: 'Ciclo', valor: (fila) => fila.anio },
          { titulo: 'Nivel', valor: (fila) => fila.nivel },
          { titulo: 'Grado', valor: (fila) => fila.grado },
          { titulo: 'SKU', valor: (fila) => fila.sku },
          { titulo: 'Precio (Q)', valor: (fila) => aQuetzales(fila.precioCentavos) },
          { titulo: 'Vendidas', valor: (fila) => fila.vendidas },
          { titulo: 'En existencia', valor: (fila) => fila.stockActual },
          { titulo: 'Total vendido (Q)', valor: (fila) => aQuetzales(fila.totalCentavos) },
        ],
        'bolsas-por-grado',
      );
    }

    return reporte;
  });
};
