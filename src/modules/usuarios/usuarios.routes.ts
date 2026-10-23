import type { FastifyPluginAsync } from 'fastify';
import { requiereRol, usuarioActual } from '../../shared/middleware/auth.js';
import * as servicio from './usuarios.service.js';
import {
  actualizarUsuarioBodySchema,
  cambiarPasswordBodySchema,
  crearUsuarioBodySchema,
  listarUsuariosQuerySchema,
  paramsIdSchema,
} from './usuarios.schemas.js';

/** Administrar usuarios es solo de la administradora. Un hook para todo el modulo. */
export const rutasUsuarios: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereRol('ADMIN'));

  app.get('/', async (request) => {
    const filtros = listarUsuariosQuerySchema.parse(request.query);
    return { data: await servicio.listarUsuarios(filtros) };
  });

  app.get('/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    return { data: await servicio.obtenerUsuario(id) };
  });

  app.post('/', async (request, reply) => {
    const datos = crearUsuarioBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return reply.status(201).send({ data: await servicio.crearUsuario(datos, actor.id) });
  });

  app.patch('/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const datos = actualizarUsuarioBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return { data: await servicio.actualizarUsuario(id, datos, actor.id) };
  });

  app.post('/:id/password', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const { password } = cambiarPasswordBodySchema.parse(request.body);
    const actor = usuarioActual(request);
    return { data: await servicio.cambiarPassword(id, password, actor.id) };
  });
};
