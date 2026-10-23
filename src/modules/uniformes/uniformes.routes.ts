import type { FastifyPluginAsync } from 'fastify';
import { resolverActor } from '../../shared/actor.js';
import * as servicio from './uniformes.service.js';
import {
  actualizarPrendaBodySchema,
  actualizarVarianteBodySchema,
  crearPrendaBodySchema,
  listarPrendasQuerySchema,
  paramsIdSchema,
  varianteNuevaSchema,
} from './uniformes.schemas.js';

/**
 * Los controladores solo traducen HTTP <-> dominio: validan con Zod, llaman al
 * servicio y devuelven. Cero logica de negocio aqui.
 */
export const rutasUniformes: FastifyPluginAsync = async (app) => {
  app.get('/categorias', async () => ({ data: await servicio.listarCategorias() }));

  app.get('/prendas', async (request) => {
    const filtros = listarPrendasQuerySchema.parse(request.query);
    return { data: await servicio.listarPrendas(filtros) };
  });

  app.get('/prendas/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.obtenerPrenda(id) };
  });

  app.post('/prendas', async (request, reply) => {
    const datos = crearPrendaBodySchema.parse(request.body);
    const prenda = await servicio.crearPrenda(datos);
    return reply.status(201).send({ data: prenda });
  });

  app.patch('/prendas/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = actualizarPrendaBodySchema.parse(request.body);
    return { data: await servicio.actualizarPrenda(id, datos) };
  });

  // Baja logica: nunca se borra una prenda con historia.
  app.delete('/prendas/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.desactivarPrenda(id) };
  });

  app.post('/prendas/:id/variantes', async (request, reply) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = varianteNuevaSchema.parse(request.body);
    const prenda = await servicio.crearVariante(id, datos);
    return reply.status(201).send({ data: prenda });
  });

  app.patch('/variantes/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = actualizarVarianteBodySchema.parse(request.body);
    const usuarioId = await resolverActor(request);
    return { data: await servicio.actualizarVariante(id, datos, usuarioId) };
  });

  app.delete('/variantes/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.eliminarVariante(id) };
  });
};
