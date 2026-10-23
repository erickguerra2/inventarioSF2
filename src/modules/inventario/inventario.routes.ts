import type { FastifyPluginAsync } from 'fastify';
import { resolverActor } from '../../shared/actor.js';
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
 * Inventario: todo esto es de la administradora (a partir de la Fase 3 llevara
 * requiereRol('ADMIN')). Quien vende ve existencias por el catalogo, no por aqui.
 */
export const rutasInventario: FastifyPluginAsync = async (app) => {
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
    const usuarioId = await resolverActor(request);
    return reply.status(201).send({ data: await servicio.registrarEntradas(datos, usuarioId) });
  });

  // Conteo fisico: la diferencia se registra como ajuste, no se "corrige" el stock.
  app.post('/conteos', async (request, reply) => {
    const datos = conteoBodySchema.parse(request.body);
    const usuarioId = await resolverActor(request);
    return reply.status(201).send({ data: await servicio.registrarConteo(datos, usuarioId) });
  });

  app.get('/:itemId', async (request) => {
    const { itemId } = paramsItemIdSchema.parse(request.params);
    return { data: await servicio.obtenerItem(itemId) };
  });

  app.post('/:itemId/movimientos', async (request, reply) => {
    const { itemId } = paramsItemIdSchema.parse(request.params);
    const datos = movimientoManualBodySchema.parse(request.body);
    const usuarioId = await resolverActor(request);
    return reply
      .status(201)
      .send({ data: await servicio.registrarMovimientoManual(itemId, datos, usuarioId) });
  });

  app.get('/:itemId/kardex', async (request) => {
    const { itemId } = paramsItemIdSchema.parse(request.params);
    const filtros = kardexQuerySchema.parse(request.query);
    return servicio.kardex(itemId, filtros);
  });
};

export const rutasAdmin: FastifyPluginAsync = async (app) => {
  // Comprueba que stockActual == SUM(movimientos) para todos los items.
  app.get('/verificar-integridad', async () => ({ data: await servicio.verificarIntegridad() }));
};
