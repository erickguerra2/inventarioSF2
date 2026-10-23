import type { FastifyPluginAsync } from 'fastify';
import { requiereAuth, requiereRol } from '../../shared/middleware/auth.js';
import * as servicio from './escolar.service.js';
import {
  crearCicloBodySchema,
  crearGradoBodySchema,
  crearNivelBodySchema,
  listarGradosQuerySchema,
  paramsIdSchema,
} from './escolar.schemas.js';

/**
 * Niveles, grados y ciclos. Leerlos lo necesita quien vende (para encontrar la
 * bolsa que esta vendiendo); crearlos es de la administradora.
 */
const soloAdmin = { preHandler: requiereRol('ADMIN') };

export const rutasEscolar: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereAuth);

  app.get('/niveles', async () => ({ data: await servicio.listarNiveles() }));

  app.post('/niveles', soloAdmin, async (request, reply) => {
    const datos = crearNivelBodySchema.parse(request.body);
    return reply.status(201).send({ data: await servicio.crearNivel(datos) });
  });

  app.get('/grados', async (request) => {
    const filtros = listarGradosQuerySchema.parse(request.query);
    return { data: await servicio.listarGrados(filtros) };
  });

  app.post('/grados', soloAdmin, async (request, reply) => {
    const datos = crearGradoBodySchema.parse(request.body);
    return reply.status(201).send({ data: await servicio.crearGrado(datos) });
  });

  app.get('/ciclos', async () => ({ data: await servicio.listarCiclos() }));

  app.post('/ciclos', soloAdmin, async (request, reply) => {
    const datos = crearCicloBodySchema.parse(request.body);
    return reply.status(201).send({ data: await servicio.crearCiclo(datos) });
  });

  app.post('/ciclos/:id/activar', soloAdmin, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.activarCiclo(id) };
  });
};
