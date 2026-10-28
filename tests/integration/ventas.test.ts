/**
 * Fase 4: ventas.
 *
 * Las pruebas que de verdad importan aqui son tres: que dos maestras no puedan
 * vender la misma ultima unidad, que el doble clic no cobre dos veces, y que una
 * venta que falla a medias no deje rastro.
 *
 * Todo se hace sobre una prenda de prueba creada aqui y borrada al final.
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

let prendaId: string;
let itemM: string; // con existencias de sobra
let itemL: string; // con UNA sola unidad, para la prueba de concurrencia
let precioM: number;

const PRECIO_M = 9900; // Q99.00
const PRECIO_L = 10500; // Q105.00

/** app.inject con la cabecera de idempotencia, que es obligatoria al vender. */
function vender(cliente: 'admin' | 'maestra', payload: unknown, clave: string = randomUUID()) {
  const cookie = cliente === 'admin' ? cookieAdmin : cookieMaestra;
  return app.inject({
    method: 'POST',
    url: '/api/v1/ventas',
    payload: payload as never,
    headers: { cookie, 'idempotency-key': clave },
  });
}

let cookieAdmin: string;
let cookieMaestra: string;

/**
 * Vende y exige que haya salido bien. Sin esto, una venta que falla se ve como
 * "cannot read properties of undefined" diez lineas despues, en vez de decir que
 * la venta devolvio 409.
 */
async function venderOk(cliente: 'admin' | 'maestra', payload: unknown, clave?: string) {
  const respuesta = await vender(cliente, payload, clave);
  expect(respuesta.statusCode, `la venta de apoyo fallo: ${respuesta.payload}`).toBe(201);
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
    nombre: 'ZZ Prenda de venta',
    tipoTalla: 'LETRA',
    variantes: [
      { talla: 'M', precioCentavos: PRECIO_M, stockMinimo: 0 },
      { talla: 'L', precioCentavos: PRECIO_L, stockMinimo: 0 },
    ],
  });
  expect(creada.statusCode).toBe(201);

  const prenda = creada.json().data;
  prendaId = prenda.id;
  itemM = prenda.variantes.find((v: { talla: string }) => v.talla === 'M').itemId;
  itemL = prenda.variantes.find((v: { talla: string }) => v.talla === 'L').itemId;
  precioM = PRECIO_M;

  const entrada = await admin.post('/api/v1/inventario/entradas', {
    motivo: 'Existencias para las pruebas de venta',
    lineas: [
      // De sobra: estas pruebas venden muchas veces sobre el mismo item.
      { itemId: itemM, cantidad: 60 },
      { itemId: itemL, cantidad: 1 }, // una sola: la ultima unidad
    ],
  });
  expect(entrada.statusCode).toBe(201);
});

afterAll(async () => {
  const items = [itemM, itemL];

  const ventas = await prisma.venta.findMany({
    where: { lineas: { some: { itemId: { in: items } } } },
    select: { id: true },
  });
  const ventaIds = ventas.map((venta) => venta.id);

  await prisma.auditLog.deleteMany({ where: { entidadId: { in: [...ventaIds, ...items, prendaId] } } });
  await prisma.ventaLinea.deleteMany({ where: { ventaId: { in: ventaIds } } });
  await prisma.venta.deleteMany({ where: { id: { in: ventaIds } } });
  await prisma.movimientoStock.deleteMany({ where: { itemId: { in: items } } });
  await prisma.historialPrecio.deleteMany({ where: { itemId: { in: items } } });
  await prisma.uniformeVariante.deleteMany({ where: { itemId: { in: items } } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: items } } });
  await prisma.prenda.deleteMany({ where: { id: prendaId } });

  await app.close();
  await prisma.$disconnect();
});

async function stockDe(itemId: string) {
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  return item.stockActual;
}

describe('registrar una venta', () => {
  it('cobra, descuenta el inventario y queda firmada por quien vendio', async () => {
    const antes = await stockDe(itemM);

    const respuesta = await vender('maestra', {
      metodoPago: 'EFECTIVO',
      compradorNombre: 'María López',
      lineas: [{ itemId: itemM, cantidad: 2 }],
    });

    expect(respuesta.statusCode).toBe(201);
    const venta = respuesta.json().data;

    expect(venta.correlativo).toBeGreaterThan(0);
    expect(venta.estado).toBe('PAGADA');
    expect(venta.subtotalCentavos).toBe(precioM * 2);
    expect(venta.totalCentavos).toBe(precioM * 2);
    expect(venta.comprador.nombre).toBe('María López');
    expect(venta.vendidoPor.usuario).toBe('lucia.m');
    expect(venta.lineas[0].descripcion).toContain('ZZ Prenda de venta');

    expect(await stockDe(itemM)).toBe(antes - 2);

    // El movimiento queda amarrado a la venta.
    const movimiento = await prisma.movimientoStock.findFirstOrThrow({
      where: { refTipo: 'VENTA', refId: venta.id },
    });
    expect(movimiento.tipo).toBe('VENTA');
    expect(movimiento.cantidad).toBe(-2);
    expect(movimiento.usuarioId).toBe(venta.vendidoPor.id);
  });

  it('el precio lo pone el servidor, aunque el cliente mande otro', async () => {
    const respuesta = await vender('maestra', {
      metodoPago: 'EFECTIVO',
      lineas: [{ itemId: itemM, cantidad: 1, precioUnitCentavos: 1, totalCentavos: 1 }],
    });

    expect(respuesta.statusCode).toBe(201);
    const venta = respuesta.json().data;

    // Nadie se compra un uniforme a Q0.01.
    expect(venta.lineas[0].precioUnitCentavos).toBe(precioM);
    expect(venta.totalCentavos).toBe(precioM);
  });

  it('consolida dos lineas del mismo item', async () => {
    const respuesta = await vender('maestra', {
      metodoPago: 'EFECTIVO',
      lineas: [
        { itemId: itemM, cantidad: 1 },
        { itemId: itemM, cantidad: 1 },
      ],
    });

    expect(respuesta.statusCode).toBe(201);
    const venta = respuesta.json().data;
    expect(venta.lineas).toHaveLength(1);
    expect(venta.lineas[0].cantidad).toBe(2);
  });

  it('aplica el descuento y rechaza el que es mayor que el subtotal', async () => {
    const conDescuento = await vender('admin', {
      metodoPago: 'EFECTIVO',
      descuentoCentavos: 900,
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });
    expect(conDescuento.statusCode).toBe(201);
    expect(conDescuento.json().data.totalCentavos).toBe(precioM - 900);

    const imposible = await vender('admin', {
      metodoPago: 'EFECTIVO',
      descuentoCentavos: precioM * 5,
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });
    expect(imposible.statusCode).toBe(400);
  });

  it('exige la cabecera Idempotency-Key', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/ventas',
      payload: { metodoPago: 'EFECTIVO', lineas: [{ itemId: itemM, cantidad: 1 }] },
      headers: { cookie: cookieMaestra },
    });

    expect(respuesta.statusCode).toBe(400);
    expect(JSON.stringify(respuesta.json())).toMatch(/Idempotency-Key/i);
  });

  it('una venta sin lineas no es una venta', async () => {
    const respuesta = await vender('maestra', { metodoPago: 'EFECTIVO', lineas: [] });
    expect(respuesta.statusCode).toBe(400);
  });
});

describe('idempotencia: el doble clic en Cobrar', () => {
  it('con la misma clave cobra una sola vez', async () => {
    const clave = randomUUID();
    const antes = await stockDe(itemM);
    const cuerpo = {
      metodoPago: 'EFECTIVO' as const,
      lineas: [{ itemId: itemM, cantidad: 1 }],
    };

    const primera = await vender('maestra', cuerpo, clave);
    const segunda = await vender('maestra', cuerpo, clave);

    expect(primera.statusCode).toBe(201);
    // 200, no 201: no se creo nada nuevo.
    expect(segunda.statusCode).toBe(200);

    expect(segunda.json().data.id).toBe(primera.json().data.id);
    expect(segunda.json().data.correlativo).toBe(primera.json().data.correlativo);

    // Y el inventario se movio UNA vez.
    expect(await stockDe(itemM)).toBe(antes - 1);
  });

  it('aguanta los dos clics al mismo tiempo, no solo uno despues del otro', async () => {
    const clave = randomUUID();
    const antes = await stockDe(itemM);
    const cuerpo = {
      metodoPago: 'EFECTIVO' as const,
      lineas: [{ itemId: itemM, cantidad: 1 }],
    };

    const [a, b] = await Promise.all([
      vender('maestra', cuerpo, clave),
      vender('maestra', cuerpo, clave),
    ]);

    // Una crea y la otra devuelve la misma venta; en cualquier orden.
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().data.id).toBe(b.json().data.id);
    expect(await stockDe(itemM)).toBe(antes - 1);
  });
});

describe('concurrencia: dos maestras y la ultima unidad', () => {
  it('solo una vende, la otra recibe 409, y el stock queda en 0', async () => {
    expect(await stockDe(itemL)).toBe(1);

    const cuerpo = {
      metodoPago: 'EFECTIVO' as const,
      lineas: [{ itemId: itemL, cantidad: 1 }],
    };

    // Claves de idempotencia DISTINTAS: son dos intentos de venta distintos,
    // al mismo tiempo, sobre la misma unica unidad.
    const [a, b] = await Promise.all([
      vender('maestra', cuerpo, randomUUID()),
      vender('admin', cuerpo, randomUUID()),
    ]);

    const codigos = [a.statusCode, b.statusCode].sort();
    expect(codigos).toEqual([201, 409]);

    const fallida = a.statusCode === 409 ? a : b;
    expect(fallida.json().error.code).toBe('STOCK_INSUFICIENTE');

    expect(await stockDe(itemL)).toBe(0);

    // Y existe UNA sola venta de esa talla.
    const ventas = await prisma.ventaLinea.count({ where: { itemId: itemL } });
    expect(ventas).toBe(1);
  });

  it('cuando ya no hay, la venta se rechaza con un mensaje que dice cuanto hay', async () => {
    const respuesta = await vender('maestra', {
      metodoPago: 'EFECTIVO',
      lineas: [{ itemId: itemL, cantidad: 1 }],
    });

    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().error.message).toMatch(/insuficientes/i);
    expect(respuesta.json().error.details.disponible).toBe(0);
  });
});

describe('atomicidad: no existe la venta a medias', () => {
  it('si una linea falla, no queda venta ni movimiento de las otras', async () => {
    const antes = await stockDe(itemM);
    const ventasAntes = await prisma.venta.count();

    const respuesta = await vender('maestra', {
      metodoPago: 'EFECTIVO',
      lineas: [
        { itemId: itemM, cantidad: 1 }, // esta si se puede
        { itemId: itemL, cantidad: 5 }, // esta no: ya no hay
      ],
    });

    expect(respuesta.statusCode).toBe(409);

    // La transaccion se revirtio completa.
    expect(await stockDe(itemM)).toBe(antes);
    expect(await prisma.venta.count()).toBe(ventasAntes);
  });
});

describe('anulacion', () => {
  it('devuelve exactamente lo vendido y queda registrada', async () => {
    const venta = await venderOk('maestra', {
        metodoPago: 'EFECTIVO',
        lineas: [{ itemId: itemM, cantidad: 2 }],
      });

    const stockDespuesDeVender = await stockDe(itemM);

    const anulada = await admin.post(`/api/v1/ventas/${venta.id}/anular`, {
      motivo: 'La maestra cobro de mas',
    });

    expect(anulada.statusCode).toBe(200);
    const datos = anulada.json().data;
    expect(datos.estado).toBe('ANULADA');
    expect(datos.anulacion.motivo).toBe('La maestra cobro de mas');
    expect(datos.anulacion.por).toBeTruthy();

    // El stock regresa.
    expect(await stockDe(itemM)).toBe(stockDespuesDeVender + 2);

    // Y en el ledger quedan la salida y su reversa, no un borrado.
    const movimientos = await prisma.movimientoStock.findMany({
      where: { refTipo: 'VENTA', refId: venta.id },
      orderBy: { creadoEn: 'asc' },
    });
    expect(movimientos.map((movimiento) => movimiento.tipo)).toEqual([
      'VENTA',
      'ANULACION_VENTA',
    ]);
    expect(movimientos[1]?.cantidad).toBe(2);

    // La venta sigue existiendo: no se borro.
    const sigue = await admin.get(`/api/v1/ventas/${venta.id}`);
    expect(sigue.statusCode).toBe(200);

    const bitacora = await prisma.auditLog.findFirst({
      where: { entidad: 'Venta', entidadId: venta.id, accion: 'venta.anular' },
    });
    expect(bitacora).not.toBeNull();
  });

  it('no se puede anular dos veces', async () => {
    const venta = await venderOk('maestra', {
        metodoPago: 'EFECTIVO',
        lineas: [{ itemId: itemM, cantidad: 1 }],
      });

    const primera = await admin.post(`/api/v1/ventas/${venta.id}/anular`, { motivo: 'Error' });
    expect(primera.statusCode).toBe(200);

    const segunda = await admin.post(`/api/v1/ventas/${venta.id}/anular`, { motivo: 'Otra vez' });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().error.code).toBe('VENTA_YA_ANULADA');
  });

  it('una maestra no puede anular', async () => {
    const venta = await venderOk('maestra', {
        metodoPago: 'EFECTIVO',
        lineas: [{ itemId: itemM, cantidad: 1 }],
      });

    const intento = await maestra.post(`/api/v1/ventas/${venta.id}/anular`, {
      motivo: 'Me equivoque',
    });

    expect(intento.statusCode).toBe(403);
    expect(intento.json().error.code).toBe('SIN_PERMISO');

    // Sigue pagada: el 403 no dejo nada a medias.
    const sigue = await admin.get(`/api/v1/ventas/${venta.id}`);
    expect(sigue.json().data.estado).toBe('PAGADA');
  });

  it('se puede anular la venta de una prenda que ya se descontinuo', async () => {
    const venta = await venderOk('admin', {
        metodoPago: 'EFECTIVO',
        lineas: [{ itemId: itemM, cantidad: 1 }],
      });

    // La prenda sale del catalogo DESPUES de la venta.
    const baja = await admin.delete(`/api/v1/uniformes/prendas/${prendaId}`);
    expect(baja.statusCode).toBe(200);

    // Vender ya no se puede...
    const ventaImposible = await vender('admin', {
      metodoPago: 'EFECTIVO',
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });
    expect(ventaImposible.statusCode).toBe(409);
    expect(ventaImposible.json().error.code).toBe('ITEM_INACTIVO');

    // ...pero anular lo ya vendido SI: es justo cuando hay que poder.
    const anulada = await admin.post(`/api/v1/ventas/${venta.id}/anular`, {
      motivo: 'Devolucion de una prenda descontinuada',
    });
    expect(anulada.statusCode).toBe(200);
    expect(anulada.json().data.estado).toBe('ANULADA');

    // Se reactiva para no dejar la prenda de prueba inactiva.
    await admin.patch(`/api/v1/uniformes/prendas/${prendaId}`, { activo: true });
  });
});

describe('cada maestra ve solo lo suyo', () => {
  it('el listado de una maestra ignora el usuarioId que mande en la URL', async () => {
    const adminId = (await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'admin' } })).id;
    const maestraId = (await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'lucia.m' } }))
      .id;

    // Intenta pedir las ventas de la administradora.
    const respuesta = await maestra.get(`/api/v1/ventas?usuarioId=${adminId}&perPage=100`);
    expect(respuesta.statusCode).toBe(200);

    const cuerpo = respuesta.json();
    expect(cuerpo.data.length).toBeGreaterThan(0);
    // Le llegan las suyas, no las que pidio: el filtro se fuerza en el backend.
    for (const venta of cuerpo.data) {
      expect(venta.vendidoPor.id).toBe(maestraId);
    }
    expect(cuerpo.resumen.incluyeSoloSusVentas).toBe(true);
  });

  it('una venta ajena responde 404, no 403', async () => {
    const ventaDelAdmin = await venderOk('admin', {
        metodoPago: 'EFECTIVO',
        lineas: [{ itemId: itemM, cantidad: 1 }],
      });

    // 403 le confirmaria que la venta existe; 404 no dice nada.
    const detalle = await maestra.get(`/api/v1/ventas/${ventaDelAdmin.id}`);
    expect(detalle.statusCode).toBe(404);

    const recibo = await maestra.get(`/api/v1/ventas/${ventaDelAdmin.id}/recibo`);
    expect(recibo.statusCode).toBe(404);

    // La administradora si las ve todas.
    expect((await admin.get(`/api/v1/ventas/${ventaDelAdmin.id}`)).statusCode).toBe(200);
  });
});

describe('recibo', () => {
  it('trae lo que se imprime, y el total cuadra con las lineas', async () => {
    const venta = await venderOk('maestra', {
        metodoPago: 'TRANSFERENCIA',
        referenciaPago: 'Boleta 00123',
        compradorNombre: 'Carlos Pérez',
        lineas: [{ itemId: itemM, cantidad: 2 }],
      });

    const respuesta = await maestra.get(`/api/v1/ventas/${venta.id}/recibo`);
    expect(respuesta.statusCode).toBe(200);

    const recibo = respuesta.json().data;
    expect(recibo.correlativo).toBe(venta.correlativo);
    expect(recibo.comprador).toBe('Carlos Pérez');
    expect(recibo.atendidoPor).toBeTruthy();
    expect(recibo.metodoPago).toBe('TRANSFERENCIA');
    expect(recibo.referenciaPago).toBe('Boleta 00123');

    const sumaLineas = recibo.lineas.reduce(
      (suma: number, linea: { totalCentavos: number }) => suma + linea.totalCentavos,
      0,
    );
    expect(sumaLineas - recibo.descuentoCentavos).toBe(recibo.totalCentavos);
  });

  it('cambiar el precio hoy no altera una venta de ayer', async () => {
    const venta = await venderOk('admin', {
        metodoPago: 'EFECTIVO',
        lineas: [{ itemId: itemM, cantidad: 1 }],
      });

    const variante = await prisma.uniformeVariante.findFirstOrThrow({ where: { itemId: itemM } });
    const cambio = await admin.patch(`/api/v1/uniformes/variantes/${variante.id}`, {
      precioCentavos: precioM + 5000,
    });
    expect(cambio.statusCode).toBe(200);

    // El recibo sigue diciendo lo que se cobro, porque la linea guarda su snapshot.
    const recibo = (await admin.get(`/api/v1/ventas/${venta.id}/recibo`)).json().data;
    expect(recibo.lineas[0].precioUnitCentavos).toBe(precioM);
    expect(recibo.totalCentavos).toBe(precioM);

    await admin.patch(`/api/v1/uniformes/variantes/${variante.id}`, {
      precioCentavos: precioM,
    });
  });
});

/**
 * El NIT existe para una sola cosa: que la directora pueda emitir la factura en
 * el portal de la SAT al final del dia. De ahi las dos reglas que se prueban
 * aqui: que llegue al recibo, y que NINGUN NIT impida cobrar.
 */
describe('NIT del comprador', () => {
  it('guarda el NIT normalizado y lo pone en el recibo', async () => {
    const venta = await venderOk('maestra', {
      metodoPago: 'EFECTIVO',
      compradorNombre: 'Ana López',
      compradorNit: '3602978-5', // clasico, con guion
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });

    // Se guarda sin guion: una sola forma del dato en la base.
    expect(venta.compradorNit).toBe('36029785');
    expect(venta.nitPorRevisar).toBe(false);

    const recibo = (await maestra.get(`/api/v1/ventas/${venta.id}/recibo`)).json().data;
    expect(recibo.nit).toBe('36029785');
  });

  it('acepta el NIT que sale del DPI, de 13 digitos', async () => {
    const venta = await venderOk('maestra', {
      metodoPago: 'EFECTIVO',
      compradorNit: '2510 86345 0101',
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });

    expect(venta.compradorNit).toBe('2510863450101');
    // No se opina del verificador del CUI: el RENAP no publica el algoritmo.
    expect(venta.nitPorRevisar).toBe(false);
  });

  it.each(['', 'CF', 'C/F'])('trata %s como consumidor final, y el recibo dice C/F', async (dado) => {
    const venta = await venderOk('maestra', {
      metodoPago: 'EFECTIVO',
      compradorNit: dado,
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });

    expect(venta.compradorNit).toBeNull();

    const recibo = (await maestra.get(`/api/v1/ventas/${venta.id}/recibo`)).json().data;
    expect(recibo.nit).toBe('C/F');
  });

  it('sin NIT el recibo tambien dice C/F', async () => {
    const venta = await venderOk('maestra', {
      metodoPago: 'EFECTIVO',
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });

    expect(venta.compradorNit).toBeNull();
    expect((await maestra.get(`/api/v1/ventas/${venta.id}/recibo`)).json().data.nit).toBe('C/F');
  });

  /**
   * Esta es la prueba que importa de verdad. Un verificador que no cuadra se
   * COBRA igual y se marca, porque rechazarlo seria dejar a la maestra sin poder
   * vender con el papa enfrente, y el recibo -no la factura- es el comprobante.
   */
  it('cobra igual con un verificador que no cuadra, y lo marca', async () => {
    const venta = await venderOk('maestra', {
      metodoPago: 'EFECTIVO',
      compradorNit: '42932-6', // el correcto termina en 5
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });

    expect(venta.compradorNit).toBe('429326');
    expect(venta.nitPorRevisar).toBe(true);

    const recibo = (await maestra.get(`/api/v1/ventas/${venta.id}/recibo`)).json().data;
    expect(recibo.nit).toBe('429326');
    expect(recibo.nitPorRevisar).toBe(true);
  });

  it.each(['abc', '1234567A', '12345678901234'])(
    'rechaza %s, que no se parece a un NIT',
    async (valor) => {
      const respuesta = await vender('maestra', {
        metodoPago: 'EFECTIVO',
        compradorNit: valor,
        lineas: [{ itemId: itemM, cantidad: 1 }],
      });

      expect(respuesta.statusCode).toBe(400);
    },
  );

  it('rechaza un departamento que no existe en un DPI de 13', async () => {
    const respuesta = await vender('maestra', {
      metodoPago: 'EFECTIVO',
      compradorNit: '2510863459901', // departamento 99
      lineas: [{ itemId: itemM, cantidad: 1 }],
    });

    expect(respuesta.statusCode).toBe(400);

    // El motivo concreto va por campo, que es lo que el formulario pinta al lado
    // del input. El `message` de arriba es el generico de toda validacion.
    const campos = respuesta.json().error.details.campos as Array<{
      campo: string;
      mensaje: string;
    }>;
    const problema = campos.find((campo) => campo.campo === 'compradorNit');
    expect(problema?.mensaje).toMatch(/departamento/i);
  });
});

describe('el invariante sigue en pie despues de todo esto', () => {
  it('stockActual == SUM(movimientos) para todos los items', async () => {
    const respuesta = await admin.get('/api/v1/admin/verificar-integridad');
    expect(respuesta.json().data.ok).toBe(true);
    expect(respuesta.json().data.inconsistentes).toEqual([]);
  });
});
