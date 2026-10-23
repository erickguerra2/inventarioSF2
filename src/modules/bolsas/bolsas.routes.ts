import type { FastifyPluginAsync } from 'fastify';
import { resolverActor } from '../../shared/actor.js';
import * as servicio from './bolsas.service.js';
import {
  actualizarBolsaBodySchema,
  crearBolsaBodySchema,
  duplicarBolsaBodySchema,
  listarBolsasQuerySchema,
  paramsIdSchema,
  reemplazarContenidoBodySchema,
} from './bolsas.schemas.js';

export const rutasBolsas: FastifyPluginAsync = async (app) => {
  app.get('/', async (request) => {
    const filtros = listarBolsasQuerySchema.parse(request.query);
    return { data: await servicio.listarBolsas(filtros) };
  });

  app.get('/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.obtenerBolsa(id) };
  });

  app.post('/', async (request, reply) => {
    const datos = crearBolsaBodySchema.parse(request.body);
    return reply.status(201).send({ data: await servicio.crearBolsa(datos) });
  });

  app.patch('/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = actualizarBolsaBodySchema.parse(request.body);
    const usuarioId = await resolverActor(request);
    return { data: await servicio.actualizarBolsa(id, datos, usuarioId) };
  });

  // Reemplazo completo de la lista de utiles.
  app.put('/:id/contenido', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const { contenido } = reemplazarContenidoBodySchema.parse(request.body);
    return { data: await servicio.reemplazarContenido(id, contenido) };
  });

  app.post('/:id/duplicar', async (request, reply) => {
    const { id } = paramsIdSchema.parse(request.params);
    const { cicloId } = duplicarBolsaBodySchema.parse(request.body);
    return reply.status(201).send({ data: await servicio.duplicarBolsa(id, cicloId) });
  });

  app.get('/:id/lista', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.listaParaImprimir(id) };
  });

  app.delete('/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const usuarioId = await resolverActor(request);
    return { data: await servicio.desactivarBolsa(id, usuarioId) };
  });
};
