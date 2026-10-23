import type { FastifyPluginAsync } from 'fastify';
import { requiereRol, usuarioActual } from '../../shared/middleware/auth.js';
import * as servicio from './inventario.service.js';
import {
  conteoBodySchema,
  entradasBodySchema,
  kardexQuerySchema,
  listarInventarioQuerySchema,
  movimientoManualBodySchema,
  paramsItemIdSchema,
} from './inventario.schemas.js';

/**
 * TODO el inventario es de la administradora: un hook para el modulo entero, no
 * un permiso por ruta que se pueda olvidar en la siguiente que se agregue.
 *
 * Quien vende ve existencias a traves del catalogo (/uniformes, /bolsas), que es
 * lo que necesita; el kardex y los ajustes no le aparecen.
 */
export const rutasInventario: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereRol('ADMIN'));

  // Vista unificada: uniformes y bolsas en la misma lista.
  app.get('/', async (request) => {
    const filtros = listarInventarioQuerySchema.parse(request.query);
    return servicio.listarInventario(filtros);
  });

  // Antes de /:itemId para que "alertas" no se lea como un id.
  app.get('/alertas', async () => servicio.alertasDeStock());

  // "Entraron 25 bolsas de 4to primaria y 12 polos M": una transaccion.
  app.post('/entradas', async (request, reply) => {
    const datos = entradasBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return reply.status(201).send({ data: await servicio.registrarEntradas(datos, actor.id) });
  });

  // Conteo fisico: la diferencia se registra como ajuste, no se "corrige" el stock.
  app.post('/conteos', async (request, reply) => {
    const datos = conteoBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return reply.status(201).send({ data: await servicio.registrarConteo(datos, actor.id) });
  });

  app.get('/:itemId', async (request) => {
    const { itemId } = paramsItemIdSchema.parse(request.params);
    return { data: await servicio.obtenerItem(itemId) };
  });

  app.post('/:itemId/movimientos', async (request, reply) => {
    const { itemId } = paramsItemIdSchema.parse(request.params);
    const datos = movimientoManualBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return reply
      .status(201)
      .send({ data: await servicio.registrarMovimientoManual(itemId, datos, actor.id) });
  });

  app.get('/:itemId/kardex', async (request) => {
    const { itemId } = paramsItemIdSchema.parse(request.params);
    const filtros = kardexQuerySchema.parse(request.query);
    return servicio.kardex(itemId, filtros);
  });
};

export const rutasAdmin: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereRol('ADMIN'));

  // Comprueba que stockActual == SUM(movimientos) para todos los items.
  app.get('/verificar-integridad', async () => ({ data: await servicio.verificarIntegridad() }));
};
