import type { FastifyPluginAsync } from 'fastify';
import { requiereAuth, requiereRol, usuarioActual } from '../../shared/middleware/auth.js';
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
 *
 * Permisos: leer el catalogo lo necesita cualquiera que venda; editarlo es solo
 * de la administradora.
 */
const soloAdmin = { preHandler: requiereRol('ADMIN') };

export const rutasUniformes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereAuth);

  app.get('/categorias', async () => ({ data: await servicio.listarCategorias() }));

  app.get('/prendas', async (request) => {
    const filtros = listarPrendasQuerySchema.parse(request.query);
    return { data: await servicio.listarPrendas(filtros) };
  });

  app.get('/prendas/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.obtenerPrenda(id) };
  });

  app.post('/prendas', soloAdmin, async (request, reply) => {
    const datos = crearPrendaBodySchema.parse(request.body);
    const prenda = await servicio.crearPrenda(datos);
    return reply.status(201).send({ data: prenda });
  });

  app.patch('/prendas/:id', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = actualizarPrendaBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return { data: await servicio.actualizarPrenda(id, datos, actor.id) };
  });

  // Baja logica: nunca se borra una prenda con historia.
  app.delete('/prendas/:id', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const actor = usuarioActual(request);
    return { data: await servicio.desactivarPrenda(id, actor.id) };
  });

  app.post('/prendas/:id/variantes', soloAdmin, async (request, reply) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = varianteNuevaSchema.parse(request.body);
    const prenda = await servicio.crearVariante(id, datos);
    return reply.status(201).send({ data: prenda });
  });

  app.patch('/variantes/:id', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = actualizarVarianteBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return { data: await servicio.actualizarVariante(id, datos, actor.id) };
  });

  app.delete('/variantes/:id', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.eliminarVariante(id) };
  });
};
