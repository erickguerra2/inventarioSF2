/**
 * Pruebas contra un Postgres real (el de docker-compose) con el seed aplicado.
 * No se usa SQLite ni mocks a proposito: lo que se esta probando son el FOR UPDATE,
 * los CHECK y el comportamiento real de las transacciones.
 *
 *   npm run db:up && npm run migrate:deploy && npm run seed && npm test
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import {
  itemsConStockInconsistente,
  registrarMovimiento,
} from '../../src/modules/inventario/inventario.service.js';
import { prisma } from '../../src/shared/prisma.js';
import { comoAdmin, type ClienteApi } from '../helpers/auth.js';

let app: FastifyInstance;
let api: ClienteApi;

beforeAll(async () => {
  app = await construirApp();
  await app.ready();
  api = await comoAdmin(app);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('salud y errores', () => {
  it('responde /health sin sesion y sin tocar la base', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/health' });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json().ok).toBe(true);
  });

  it('una ruta que no existe devuelve el sobre de error estandar', async () => {
    const respuesta = await api.get('/api/v1/no-existe');
    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json().error.code).toBe('NO_ENCONTRADO');
  });

  it('un body invalido devuelve 400 con el detalle de los campos', async () => {
    const respuesta = await api.post('/api/v1/bolsas', {
      gradoId: '',
      cicloId: '',
      precioCentavos: 12.5,
    });

    expect(respuesta.statusCode).toBe(400);
    const cuerpo = respuesta.json();
    expect(cuerpo.error.code).toBe('VALIDACION');
    expect(cuerpo.error.details.campos.length).toBeGreaterThan(0);
  });
});

describe('catalogo de uniformes', () => {
  it('devuelve las dos categorias', async () => {
    const respuesta = await api.get('/api/v1/uniformes/categorias');
    const codigos = respuesta.json().data.map((categoria: { codigo: string }) => categoria.codigo);
    expect(codigos).toEqual(['DIARIO', 'FISICA']);
  });

  it('devuelve 3 prendas por categoria con sus tallas ordenadas', async () => {
    const respuesta = await api.get('/api/v1/uniformes/prendas?categoria=DIARIO');
    expect(respuesta.statusCode).toBe(200);

    const prendas = respuesta.json().data;
    expect(prendas).toHaveLength(3);

    const polo = prendas.find((prenda: { nombre: string }) => prenda.nombre === 'Polo institucional');
    expect(polo.variantes.map((variante: { talla: string }) => variante.talla)).toEqual([
      'XS',
      'S',
      'M',
      'L',
      'XL',
    ]);

    const pantalon = prendas.find((prenda: { nombre: string }) =>
      prenda.nombre.startsWith('Pantalón'),
    );
    expect(pantalon.variantes.map((variante: { talla: string }) => variante.talla)).toEqual([
      '28',
      '30',
      '32',
      '34',
      '36',
      '38',
    ]);
  });

  it('una talla agotada se muestra, pero marcada como no disponible', async () => {
    const respuesta = await api.get('/api/v1/uniformes/prendas');
    const variantes = respuesta
      .json()
      .data.flatMap((prenda: { variantes: unknown[] }) => prenda.variantes);

    // La regla, no un dato del seed: disponible == (activo && hay existencias).
    for (const variante of variantes as Array<{
      activo: boolean;
      stockActual: number;
      disponible: boolean;
    }>) {
      expect(variante.disponible).toBe(variante.activo && variante.stockActual > 0);
    }

    // Y las agotadas siguen apareciendo en la lista: la vendedora necesita verlas.
    const agotadas = (variantes as Array<{ stockActual: number }>).filter(
      (variante) => variante.stockActual === 0,
    );
    expect(agotadas.length).toBeGreaterThan(0);
  });

  it('arma la URL absoluta de las fotos', async () => {
    const respuesta = await api.get('/api/v1/uniformes/prendas');
    const prenda = respuesta.json().data[0];
    expect(prenda.fotos[0].url).toMatch(/^https?:\/\/.+\/foto\./);
  });
});

describe('bolsas de utiles', () => {
  it('lista las bolsas del ciclo con su stock en bolsas enteras', async () => {
    const respuesta = await api.get('/api/v1/bolsas?ciclo=2026');
    expect(respuesta.statusCode).toBe(200);

    const bolsas = respuesta.json().data;
    expect(bolsas.length).toBeGreaterThanOrEqual(6);

    const cuarto = bolsas.find((bolsa: { grado: { nombre: string } }) =>
      bolsa.grado.nombre.startsWith('4to Primaria'),
    );
    expect(cuarto.sku).toBe('BOL-4TO-PRIMARIA-2026');
    // Stock en bolsas enteras. No se afirma un numero exacto a proposito: en
    // cuanto el sistema se use, el del seed deja de ser el actual.
    expect(Number.isInteger(cuarto.stockActual)).toBe(true);
    expect(cuarto.stockActual).toBeGreaterThanOrEqual(0);
  });

  it('el contenido es opcional: una bolsa sin lista funciona igual', async () => {
    const respuesta = await api.get('/api/v1/bolsas?ciclo=2026');
    const bolsas = respuesta.json().data;

    const conLista = bolsas.filter(
      (bolsa: { totalLineasContenido: number }) => bolsa.totalLineasContenido > 0,
    );
    const sinLista = bolsas.filter(
      (bolsa: { totalLineasContenido: number }) => bolsa.totalLineasContenido === 0,
    );

    expect(conLista.length).toBeGreaterThan(0);
    expect(sinLista.length).toBeGreaterThan(0);
    // Las que no tienen lista igual tienen precio y existencias.
    expect(sinLista[0].precioCentavos).toBeGreaterThan(0);
  });

  it('entrega la lista para imprimir', async () => {
    const lista = await api.get('/api/v1/bolsas?ciclo=2026');
    const conLista = lista
      .json()
      .data.find((bolsa: { totalLineasContenido: number }) => bolsa.totalLineasContenido > 0);

    const respuesta = await api.get(`/api/v1/bolsas/${conLista.id}/lista`);
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json().data.items.length).toBeGreaterThan(0);
  });
});

describe('la regla que sostiene el inventario', () => {
  it('no deja sacar mas de lo que hay, y no cambia el stock al fallar', async () => {
    const item = await prisma.inventoryItem.findFirstOrThrow({
      where: { sku: 'BOL-4TO-PRIMARIA-2026' },
    });
    const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } });

    await expect(
      prisma.$transaction((tx) =>
        registrarMovimiento(tx, {
          itemId: item.id,
          cantidad: -(item.stockActual + 1),
          tipo: 'VENTA',
          usuarioId: admin.id,
        }),
      ),
    ).rejects.toThrowError(/insuficientes/i);

    const despues = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(despues.stockActual).toBe(item.stockActual);
  });

  it('el stock de cada item coincide con la suma de sus movimientos', async () => {
    const inconsistentes = await itemsConStockInconsistente();
    expect(inconsistentes).toEqual([]);
  });

  it('las existencias no se pueden editar por el endpoint de la talla', async () => {
    const variante = await prisma.uniformeVariante.findFirstOrThrow({ include: { item: true } });

    const respuesta = await api.patch(`/api/v1/uniformes/variantes/${variante.id}`, {
      stockActual: 999,
    });

    // El campo no existe en el schema de entrada: la peticion no tiene nada valido.
    expect(respuesta.statusCode).toBe(400);

    const despues = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: variante.itemId },
    });
    expect(despues.stockActual).toBe(variante.item.stockActual);
  });
});
