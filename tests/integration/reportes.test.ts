/**
 * Fase 5: reportes, corte de caja y exportacion.
 *
 * Las afirmaciones son por DIFERENCIA (antes/despues), no por totales absolutos:
 * el corte de caja es global y otras pruebas pueden dejar ventas del mismo dia.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { prisma } from '../../src/shared/prisma.js';
import { clienteConSesion, iniciarSesion, type ClienteApi } from '../helpers/auth.js';

let app: FastifyInstance;
let admin: ClienteApi;
let maestra: ClienteApi;
let cookieAdmin: string;
let cookieMaestra: string;

let prendaId: string;
let itemId: string;
const PRECIO = 5000; // Q50.00

function vender(cliente: 'admin' | 'maestra', payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/ventas',
    payload: payload as never,
    headers: {
      cookie: cliente === 'admin' ? cookieAdmin : cookieMaestra,
      'idempotency-key': randomUUID(),
    },
  });
}

async function corteDeHoy(cliente: ClienteApi) {
  const respuesta = await cliente.get('/api/v1/reportes/corte-caja');
  expect(respuesta.statusCode).toBe(200);
  return respuesta.json().data;
}

beforeAll(async () => {
  app = await construirApp();
  await app.ready();

  cookieAdmin = (await iniciarSesion(app, 'admin')).cookie;
  cookieMaestra = (await iniciarSesion(app, 'lucia.m')).cookie;
  admin = clienteConSesion(app, cookieAdmin);
  maestra = clienteConSesion(app, cookieMaestra);

  const categoria = await prisma.categoriaUniforme.findFirstOrThrow({
    where: { codigo: 'DIARIO' },
  });

  const creada = await admin.post('/api/v1/uniformes/prendas', {
    categoriaId: categoria.id,
    nombre: 'ZZ Prenda de reportes',
    tipoTalla: 'LETRA',
    variantes: [{ talla: 'M', precioCentavos: PRECIO, stockMinimo: 0 }],
  });
  expect(creada.statusCode).toBe(201);

  prendaId = creada.json().data.id;
  itemId = creada.json().data.variantes[0].itemId;

  const entrada = await admin.post('/api/v1/inventario/entradas', {
    motivo: 'Existencias para las pruebas de reportes',
    lineas: [{ itemId, cantidad: 30 }],
  });
  expect(entrada.statusCode).toBe(201);
});

afterAll(async () => {
  const ventas = await prisma.venta.findMany({
    where: { lineas: { some: { itemId } } },
    select: { id: true },
  });
  const ventaIds = ventas.map((venta) => venta.id);

  await prisma.auditLog.deleteMany({ where: { entidadId: { in: [...ventaIds, itemId, prendaId] } } });
  await prisma.ventaLinea.deleteMany({ where: { ventaId: { in: ventaIds } } });
  await prisma.venta.deleteMany({ where: { id: { in: ventaIds } } });
  await prisma.movimientoStock.deleteMany({ where: { itemId } });
  await prisma.historialPrecio.deleteMany({ where: { itemId } });
  await prisma.uniformeVariante.deleteMany({ where: { itemId } });
  await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
  await prisma.prenda.deleteMany({ where: { id: prendaId } });

  await app.close();
  await prisma.$disconnect();
});

describe('corte de caja', () => {
  it('separa por maestra y por metodo de pago, y dice cuanto efectivo entregar', async () => {
    const antes = await corteDeHoy(admin);
    const maestraId = (await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'lucia.m' } }))
      .id;

    const efectivoAntes =
      antes.porMaestra.find((fila: { usuarioId: string }) => fila.usuarioId === maestraId)
        ?.porMetodo?.EFECTIVO ?? 0;

    // La maestra cobra 2 en efectivo y 1 por transferencia.
    expect(
      (await vender('maestra', { metodoPago: 'EFECTIVO', lineas: [{ itemId, cantidad: 2 }] }))
        .statusCode,
    ).toBe(201);
    expect(
      (
        await vender('maestra', {
          metodoPago: 'TRANSFERENCIA',
          referenciaPago: 'Boleta 999',
          lineas: [{ itemId, cantidad: 1 }],
        })
      ).statusCode,
    ).toBe(201);

    const despues = await corteDeHoy(admin);
    const fila = despues.porMaestra.find(
      (candidata: { usuarioId: string }) => candidata.usuarioId === maestraId,
    );

    expect(fila).toBeDefined();
    expect(fila.porMetodo.EFECTIVO - efectivoAntes).toBe(PRECIO * 2);
    expect(fila.porMetodo.TRANSFERENCIA).toBeGreaterThanOrEqual(PRECIO);

    // Lo que tiene que entregar en mano es solo el efectivo, no la transferencia.
    expect(fila.aEntregarEnEfectivoCentavos).toBe(fila.porMetodo.EFECTIVO);

    expect(despues.totales.cobradoCentavos - antes.totales.cobradoCentavos).toBe(PRECIO * 3);
    expect(despues.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(despues.zona).toBe('America/Guatemala');
  });

  it('una venta anulada no suma al cobrado, y se reporta aparte', async () => {
    const antes = await corteDeHoy(admin);

    const venta = (
      await vender('maestra', { metodoPago: 'EFECTIVO', lineas: [{ itemId, cantidad: 1 }] })
    ).json().data;

    const anulada = await admin.post(`/api/v1/ventas/${venta.id}/anular`, {
      motivo: 'Prueba de corte',
    });
    expect(anulada.statusCode).toBe(200);

    const despues = await corteDeHoy(admin);

    // No cambio el cobrado...
    expect(despues.totales.cobradoCentavos).toBe(antes.totales.cobradoCentavos);
    // ...pero la anulada se ve, para que los numeros se puedan explicar.
    expect(despues.totales.anuladas - antes.totales.anuladas).toBe(1);
    expect(despues.totales.anuladoCentavos - antes.totales.anuladoCentavos).toBe(PRECIO);
  });

  it('una maestra solo ve su propio corte', async () => {
    const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'admin' } })).id;

    // Aunque pida el de la administradora.
    const respuesta = await maestra.get(`/api/v1/reportes/corte-caja?usuarioId=${adminId}`);
    expect(respuesta.statusCode).toBe(200);

    const corte = respuesta.json().data;
    expect(corte.alcance).toBe('SOLO_MIS_VENTAS');
    for (const fila of corte.porMaestra) {
      expect(fila.usuario).toBe('lucia.m');
    }
  });

  it('exporta a CSV listo para abrir en Excel', async () => {
    const respuesta = await admin.get('/api/v1/reportes/corte-caja?formato=csv');

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['content-type']).toContain('text/csv');
    expect(String(respuesta.headers['content-disposition'])).toContain('corte-caja');

    const csv = respuesta.payload;
    // BOM: sin el, Excel en Windows abre "Lucía" como "LucÃ­a".
    expect(csv.startsWith('﻿')).toBe(true);
    // Punto y coma: con coma, Excel en configuracion regional de GT mete todo en una celda.
    expect(csv).toContain('Maestra;Usuario;Ventas;');
    expect(csv).toContain('A entregar en efectivo (Q)');
    // Los montos salen con dos decimales, no en centavos.
    expect(csv).toMatch(/;\d+\.\d{2}/);
  });
});

describe('reportes de ventas', () => {
  it('agrupa por maestra', async () => {
    const respuesta = await admin.get('/api/v1/reportes/ventas?agrupar=usuario');
    expect(respuesta.statusCode).toBe(200);

    const reporte = respuesta.json().data;
    expect(reporte.agrupadoPor).toBe('usuario');

    const nombres = reporte.data.map((fila: { etiqueta: string }) => fila.etiqueta);
    expect(nombres).toContain('Lucía Méndez');
  });

  it('agrupa por tipo y avisa que los totales son antes de descuento', async () => {
    const respuesta = await admin.get('/api/v1/reportes/ventas?agrupar=tipo');
    const reporte = respuesta.json().data;

    const claves = reporte.data.map((fila: { clave: string }) => fila.clave);
    expect(claves).toContain('UNIFORME_TALLA');

    // El descuento es de la venta completa, no de una linea: decirlo evita que
    // alguien cuadre este reporte contra el corte de caja y no le de.
    expect(reporte.notas.join(' ')).toMatch(/antes de descuento/i);
  });

  it('agrupa por dia sin inflar el total al unir con las lineas', async () => {
    const respuesta = await admin.get('/api/v1/reportes/ventas?agrupar=dia');
    const reporte = respuesta.json().data;

    expect(reporte.data.length).toBeGreaterThan(0);
    expect(reporte.data[0].clave).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Si el LEFT JOIN con las lineas inflara los montos, la suma de los dias
    // saldria mayor que el total real de lo cobrado.
    const real = await prisma.venta.aggregate({
      where: { estado: 'PAGADA' },
      _sum: { totalCentavos: true },
    });
    const sumaDeDias = reporte.data.reduce(
      (suma: number, fila: { totalCentavos: number }) => suma + fila.totalCentavos,
      0,
    );
    expect(sumaDeDias).toBe(real._sum.totalCentavos ?? 0);
  });

  it('una venta de la noche cae en el dia de Guatemala, no en el de UTC', async () => {
    // Regresion de un bug real: las columnas de fecha eran TIMESTAMP sin zona y
    // la conversion de zona iba al reves, asi que una venta de las 23:30 se
    // reportaba al dia siguiente y descuadraba los dos cortes de caja.
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'admin' } });
    const correlativo = 900_000 + Math.floor(Math.random() * 90_000);

    // 2026-03-10 23:30 en Guatemala == 2026-03-11 05:30 en UTC.
    const venta = await prisma.venta.create({
      data: {
        correlativo,
        metodoPago: 'EFECTIVO',
        subtotalCentavos: 1000,
        descuentoCentavos: 0,
        totalCentavos: 1000,
        usuarioId: usuario.id,
        idempotencyKey: `prueba-zona-${randomUUID()}`,
        creadoEn: new Date('2026-03-11T05:30:00.000Z'),
      },
    });

    try {
      const porDia = await admin.get(
        '/api/v1/reportes/ventas?agrupar=dia&desde=2026-03-01&hasta=2026-03-31',
      );
      const claves = porDia.json().data.data.map((fila: { clave: string }) => fila.clave);

      expect(claves).toContain('2026-03-10');
      expect(claves).not.toContain('2026-03-11');

      // Y el corte de caja de ese dia la incluye.
      const corte = await admin.get('/api/v1/reportes/corte-caja?fecha=2026-03-10');
      expect(corte.json().data.totales.cobradoCentavos).toBe(1000);

      const corteDelDiaSiguiente = await admin.get(
        '/api/v1/reportes/corte-caja?fecha=2026-03-11',
      );
      expect(corteDelDiaSiguiente.json().data.totales.cobradoCentavos).toBe(0);
    } finally {
      await prisma.venta.delete({ where: { id: venta.id } });
    }
  });

  it('dice que tallas pedir', async () => {
    const respuesta = await admin.get('/api/v1/reportes/tallas-mas-vendidas?limite=50');
    expect(respuesta.statusCode).toBe(200);

    const fila = respuesta
      .json()
      .data.data.find((candidata: { itemId: string }) => candidata.itemId === itemId);

    expect(fila).toBeDefined();
    expect(fila.talla).toBe('M');
    expect(fila.prenda).toBe('ZZ Prenda de reportes');
    expect(fila.unidades).toBeGreaterThanOrEqual(3);
  });

  it('una maestra no puede ver los reportes de la administradora', async () => {
    for (const url of [
      '/api/v1/reportes/ventas',
      '/api/v1/reportes/tallas-mas-vendidas',
      '/api/v1/reportes/existencias-valorizadas',
      '/api/v1/reportes/bolsas-por-grado',
    ]) {
      const respuesta = await maestra.get(url);
      expect(respuesta.statusCode, url).toBe(403);
    }
  });
});

describe('existencias valorizadas', () => {
  it('avisa cuando hay items sin costo, porque el total seria enganoso', async () => {
    const respuesta = await admin.get('/api/v1/reportes/existencias-valorizadas');
    expect(respuesta.statusCode).toBe(200);

    const reporte = respuesta.json().data;
    expect(reporte.data.length).toBeGreaterThan(0);

    // En el seed las tallas de uniforme no tienen costo registrado: el valor del
    // inventario es un piso, no el real, y el reporte lo dice en lugar de callarlo.
    expect(reporte.totales.itemsSinCosto).toBeGreaterThan(0);
    expect(reporte.advertencia).toMatch(/no tienen costo/i);

    const bolsas = reporte.data.find((fila: { tipo: string }) => fila.tipo === 'BOLSA_UTILES');
    expect(bolsas.valorCentavos).toBeGreaterThan(0);
  });
});

describe('bolsas por grado', () => {
  it('lista las bolsas del ciclo con vendidas y existencia', async () => {
    const respuesta = await admin.get('/api/v1/reportes/bolsas-por-grado?ciclo=2026');
    expect(respuesta.statusCode).toBe(200);

    const reporte = respuesta.json().data;
    expect(reporte.data.length).toBeGreaterThanOrEqual(6);

    for (const fila of reporte.data) {
      expect(fila.grado).toBeTruthy();
      expect(fila.nivel).toBeTruthy();
      expect(fila.anio).toBe(2026);
      expect(fila.vendidas).toBeGreaterThanOrEqual(0);
    }

    expect(reporte.nota).toMatch(/alumnos/i);
  });
});
