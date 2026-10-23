import type { FastifyPluginAsync } from 'fastify';
import { requiereAuth, requiereRol, usuarioActual } from '../../shared/middleware/auth.js';
import * as servicio from './bolsas.service.js';
import {
  actualizarBolsaBodySchema,
  crearBolsaBodySchema,
  duplicarBolsaBodySchema,
  listarBolsasQuerySchema,
  paramsIdSchema,
  reemplazarContenidoBodySchema,
} from './bolsas.schemas.js';

/** Leer las bolsas lo necesita quien vende; crearlas y editarlas es de la admin. */
const soloAdmin = { preHandler: requiereRol('ADMIN') };

export const rutasBolsas: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereAuth);

  app.get('/', async (request) => {
    const filtros = listarBolsasQuerySchema.parse(request.query);
    return { data: await servicio.listarBolsas(filtros) };
  });

  app.get('/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.obtenerBolsa(id) };
  });

  // La lista para imprimir y entregarle al papá: quien vende tambien la ocupa.
  app.get('/:id/lista', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.listaParaImprimir(id) };
  });

  app.post('/', soloAdmin, async (request, reply) => {
    const datos = crearBolsaBodySchema.parse(request.body);
    return reply.status(201).send({ data: await servicio.crearBolsa(datos) });
  });

  app.patch('/:id', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = actualizarBolsaBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return { data: await servicio.actualizarBolsa(id, datos, actor.id) };
  });

  // Reemplazo completo de la lista de utiles.
  app.put('/:id/contenido', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const { contenido } = reemplazarContenidoBodySchema.parse(request.body);
    return { data: await servicio.reemplazarContenido(id, contenido) };
  });

  app.post('/:id/duplicar', soloAdmin, async (request, reply) => {
    const { id } = paramsIdSchema.parse(request.params);
    const { cicloId } = duplicarBolsaBodySchema.parse(request.body);
    return reply.status(201).send({ data: await servicio.duplicarBolsa(id, cicloId) });
  });

  app.delete('/:id', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const actor = usuarioActual(request);
    return { data: await servicio.desactivarBolsa(id, actor.id) };
  });
};
