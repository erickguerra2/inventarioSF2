import type { FastifyPluginAsync } from 'fastify';
import { requiereAuth, requiereRol, usuarioActual } from '../../shared/middleware/auth.js';
import * as servicio from './ventas.service.js';
import {
  anularVentaBodySchema,
  crearVentaBodySchema,
  idempotencyKeySchema,
  listarVentasQuerySchema,
  paramsIdSchema,
} from './ventas.schemas.js';

/**
 * Vender es la UNICA operacion de escritura que tiene una maestra. Consultar y
 * reimprimir, solo lo suyo. Anular es de la administradora.
 */
export const rutasVentas: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requiereAuth);

  app.post('/', async (request, reply) => {
    const idempotencyKey = idempotencyKeySchema.parse(request.headers['idempotency-key']);
    const datos = crearVentaBodySchema.parse(request.body);
    const usuario = usuarioActual(request);

    const { venta, yaExistia } = await servicio.registrarVenta(datos, idempotencyKey, usuario);

    // 200 y no 201 cuando la clave ya se habia usado: no se creo nada nuevo.
    return reply.status(yaExistia ? 200 : 201).send({ data: venta });
  });

  app.get('/', async (request) => {
    const filtros = listarVentasQuerySchema.parse(request.query);
    const usuario = usuarioActual(request);
    return servicio.listarVentas(filtros, usuario);
  });

  app.get('/:id', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const usuario = usuarioActual(request);
    return { data: await servicio.obtenerVenta(id, usuario) };
  });

  app.get('/:id/recibo', async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const usuario = usuarioActual(request);
    return { data: await servicio.recibo(id, usuario) };
  });

  app.post('/:id/anular', { preHandler: requiereRol('ADMIN') }, async (request) => {
    const { id } = paramsIdSchema.parse(request.params);
    const { motivo } = anularVentaBodySchema.parse(request.body);
    const usuario = usuarioActual(request);
    return { data: await servicio.anularVenta(id, motivo, usuario) };
  });
};
