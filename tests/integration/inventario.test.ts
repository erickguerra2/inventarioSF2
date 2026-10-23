/**
 * Fase 2: entradas, ajustes, conteo fisico, kardex y alertas.
 *
 * Todo se hace sobre una prenda de prueba creada aqui y borrada al final, para no
 * tocar los datos del seed (de los que dependen las pruebas de catalogo).
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { registrarMovimientoManual } from '../../src/modules/inventario/inventario.service.js';
import { prisma } from '../../src/shared/prisma.js';
import { comoAdmin, type ClienteApi } from '../helpers/auth.js';

let app: FastifyInstance;
let api: ClienteApi;
let itemId: string;
let varianteId: string;
let prendaId: string;

const STOCK_MINIMO = 5;

beforeAll(async () => {
  app = await construirApp();
  await app.ready();
  api = await comoAdmin(app);

  const categoria = await prisma.categoriaUniforme.findFirstOrThrow({
    where: { codigo: 'DIARIO' },
  });

  const respuesta = await api.post('/api/v1/uniformes/prendas', {
    categoriaId: categoria.id,
    nombre: 'ZZ Prenda de prueba',
    tipoTalla: 'LETRA',
    variantes: [{ talla: 'M', precioCentavos: 1000, stockMinimo: STOCK_MINIMO }],
  });

  expect(respuesta.statusCode).toBe(201);
  const prenda = respuesta.json().data;
  prendaId = prenda.id;
  varianteId = prenda.variantes[0].id;
  itemId = prenda.variantes[0].itemId;

  // Una talla recien creada arranca en 0: las existencias entran con un movimiento.
  expect(prenda.variantes[0].stockActual).toBe(0);
});

afterAll(async () => {
  // Limpieza: en produccion esto nunca se borraria (se desactiva), pero es data de prueba.
  await prisma.auditLog.deleteMany({ where: { entidadId: { in: [itemId, prendaId] } } });
  await prisma.movimientoStock.deleteMany({ where: { itemId } });
  await prisma.historialPrecio.deleteMany({ where: { itemId } });
  await prisma.uniformeVariante.deleteMany({ where: { id: varianteId } });
  await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
  await prisma.prenda.deleteMany({ where: { id: prendaId } });

  await app.close();
  await prisma.$disconnect();
});

async function stockDe(id: string) {
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
  return item.stockActual;
}

describe('entradas en lote', () => {
  it('suma en una sola transaccion y consolida dos lineas del mismo item', async () => {
    const respuesta = await api.post('/api/v1/inventario/entradas', {
      motivo: 'Compra a proveedor, factura de prueba',
      lineas: [
        { itemId, cantidad: 3 },
        { itemId, cantidad: 2 }, // misma linea repetida: se consolida en 5
      ],
    });

    expect(respuesta.statusCode).toBe(201);
    const datos = respuesta.json().data;

    expect(datos.lineas).toHaveLength(1);
    expect(datos.lineas[0].ingresado).toBe(5);
    expect(datos.lineas[0].saldoDespues).toBe(5);
    expect(datos.totalUnidades).toBe(5);
    expect(await stockDe(itemId)).toBe(5);
  });

  it('una entrada con un item inexistente no deja nada a medias', async () => {
    const antes = await stockDe(itemId);

    const respuesta = await api.post('/api/v1/inventario/entradas', {
      motivo: 'Entrada con un id invalido',
      lineas: [
        { itemId, cantidad: 10 },
        { itemId: 'no-existe', cantidad: 1 },
      ],
    });

    expect(respuesta.statusCode).toBe(404);
    // La transaccion se revirtio completa: la primera linea tampoco entro.
    expect(await stockDe(itemId)).toBe(antes);
  });
});

describe('movimientos a mano', () => {
  it('una merma sin motivo se rechaza', async () => {
    const respuesta = await api.post(`/api/v1/inventario/${itemId}/movimientos`, {
      cantidad: 1,
      tipo: 'MERMA',
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().error.code).toBe('VALIDACION');
  });

  it('la merma resta aunque el cliente mande la cantidad en positivo', async () => {
    const respuesta = await api.post(`/api/v1/inventario/${itemId}/movimientos`, {
      cantidad: 2,
      tipo: 'MERMA',
      motivo: 'Dos polos manchados en bodega',
    });

    expect(respuesta.statusCode).toBe(201);
    const datos = respuesta.json().data;

    // El tipo define el signo: el ledger guarda -2.
    expect(datos.movimiento.cantidad).toBe(-2);
    expect(datos.movimiento.saldoDespues).toBe(3);
    expect(datos.item.stockActual).toBe(3);
  });

  it('no se puede sacar mas de lo que hay', async () => {
    const respuesta = await api.post(`/api/v1/inventario/${itemId}/movimientos`, {
      cantidad: 99,
      tipo: 'MERMA',
      motivo: 'Intento imposible',
    });

    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().error.code).toBe('STOCK_INSUFICIENTE');
    expect(await stockDe(itemId)).toBe(3);
  });

  it('los movimientos de venta no se pueden registrar por aqui', async () => {
    const porHttp = await api.post(`/api/v1/inventario/${itemId}/movimientos`, {
      cantidad: 1,
      tipo: 'VENTA',
      motivo: 'No deberia pasar',
    });
    expect(porHttp.statusCode).toBe(400);

    // Y el servicio tambien se niega, para que ningun otro modulo lo use por error.
    const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } });
    await expect(
      registrarMovimientoManual(
        itemId,
        { cantidad: 1, tipo: 'VENTA' as never, motivo: 'x' },
        admin.id,
      ),
    ).rejects.toThrowError(/POST \/ventas/);
  });
});

describe('conteo fisico', () => {
  it('registra la diferencia como ajuste en vez de corregir el stock', async () => {
    const respuesta = await api.post('/api/v1/inventario/conteos', {
      motivo: 'Conteo de prueba',
      lineas: [{ itemId, contado: 7 }],
    });

    expect(respuesta.statusCode).toBe(201);
    const datos = respuesta.json().data;

    expect(datos.lineas[0].enSistema).toBe(3);
    expect(datos.lineas[0].contado).toBe(7);
    expect(datos.lineas[0].diferencia).toBe(4);
    expect(datos.resumen.unidadesSobrantes).toBe(4);
    expect(await stockDe(itemId)).toBe(7);

    // El ajuste queda amarrado al conteo: se puede reconstruir desde el ledger.
    const movimiento = await prisma.movimientoStock.findUniqueOrThrow({
      where: { id: datos.lineas[0].movimientoId },
    });
    expect(movimiento.tipo).toBe('AJUSTE_POS');
    expect(movimiento.refTipo).toBe('CONTEO');
    expect(movimiento.refId).toBe(datos.conteoId);
    expect(movimiento.motivo).toBe('Conteo de prueba');
  });

  it('un conteo que coincide no genera ningun movimiento', async () => {
    const antes = await prisma.movimientoStock.count({ where: { itemId } });

    const respuesta = await api.post('/api/v1/inventario/conteos', {
      lineas: [{ itemId, contado: 7 }],
    });

    expect(respuesta.statusCode).toBe(201);
    const datos = respuesta.json().data;
    expect(datos.lineas[0].diferencia).toBe(0);
    expect(datos.lineas[0].movimientoId).toBeNull();
    expect(datos.resumen.itemsConDiferencia).toBe(0);

    expect(await prisma.movimientoStock.count({ where: { itemId } })).toBe(antes);
  });

  it('rechaza el mismo item dos veces en el mismo conteo', async () => {
    const respuesta = await api.post('/api/v1/inventario/conteos', {
      lineas: [
        { itemId, contado: 7 },
        { itemId, contado: 8 },
      ],
    });

    expect(respuesta.statusCode).toBe(400);
  });
});

describe('kardex', () => {
  it('cuenta la historia completa y cierra en el stock actual', async () => {
    const respuesta = await api.get(`/api/v1/inventario/${itemId}/kardex`);
    expect(respuesta.statusCode).toBe(200);

    const cuerpo = respuesta.json();
    expect(cuerpo.item.id).toBe(itemId);
    expect(cuerpo.periodo.saldoFinal).toBe(await stockDe(itemId));

    const tipos = cuerpo.data.map((movimiento: { tipo: string }) => movimiento.tipo);
    expect(tipos).toEqual(['ENTRADA', 'MERMA', 'AJUSTE_POS']);

    // Cada movimiento dice quien lo hizo y con que saldo quedo.
    expect(cuerpo.data[0].usuario.nombre).toBeTruthy();
    expect(cuerpo.data.at(-1).saldoDespues).toBe(cuerpo.periodo.saldoFinal);
  });

  it('filtra por fecha sin romper el saldo inicial', async () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const respuesta = await api.get(`/api/v1/inventario/${itemId}/kardex?desde=${manana}`);
    const cuerpo = respuesta.json();

    expect(cuerpo.data).toHaveLength(0);
    // Todo lo anterior al periodo se arrastra como saldo inicial.
    expect(cuerpo.periodo.saldoInicial).toBe(await stockDe(itemId));
    expect(cuerpo.periodo.saldoFinal).toBe(cuerpo.periodo.saldoInicial);
  });
});

describe('alertas y vista unificada', () => {
  it('avisa cuando el stock queda en el minimo o por debajo', async () => {
    // 7 - 5 = 2, con minimo 5: entra en alerta con faltante 3.
    await api.post(`/api/v1/inventario/${itemId}/movimientos`, {
      cantidad: 5,
      tipo: 'AJUSTE_NEG',
      motivo: 'Dejarlo bajo para la prueba',
    });

    const respuesta = await api.get('/api/v1/inventario/alertas');
    expect(respuesta.statusCode).toBe(200);

    const cuerpo = respuesta.json();
    const alerta = cuerpo.data.find((item: { id: string }) => item.id === itemId);

    expect(alerta).toBeDefined();
    expect(alerta.stockActual).toBe(2);
    expect(alerta.faltante).toBe(3);
    expect(cuerpo.resumen.total).toBeGreaterThan(0);

    // Ordenadas por lo que falta: es el orden en que le sirven a quien compra.
    const faltantes = cuerpo.data.map((item: { faltante: number }) => item.faltante);
    expect([...faltantes].sort((a: number, b: number) => b - a)).toEqual(faltantes);
  });

  it('el filtro bajoStock compara dos columnas de la misma fila', async () => {
    const respuesta = await api.get('/api/v1/inventario?bajoStock=true&perPage=100');

    const ids = respuesta.json().data.map((item: { id: string }) => item.id);
    expect(ids).toContain(itemId);

    for (const item of respuesta.json().data) {
      expect(item.stockActual).toBeLessThanOrEqual(item.stockMinimo);
    }
  });

  it('lista uniformes y bolsas juntos, y sabe de donde viene cada item', async () => {
    const bolsas = await api.get('/api/v1/inventario?tipo=BOLSA_UTILES&perPage=100');
    const datosBolsas = bolsas.json().data;

    expect(datosBolsas.length).toBeGreaterThan(0);
    expect(datosBolsas.every((item: { tipo: string }) => item.tipo === 'BOLSA_UTILES')).toBe(true);
    expect(datosBolsas[0].origen.clase).toBe('BOLSA_UTILES');
    expect(datosBolsas[0].origen.grado.nombre).toBeTruthy();

    const uniformes = await api.get('/api/v1/inventario?tipo=UNIFORME_TALLA&q=ZZ+Prenda');
    const datosUniformes = uniformes.json().data;

    expect(datosUniformes).toHaveLength(1);
    expect(datosUniformes[0].origen.talla).toBe('M');
    expect(datosUniformes[0].origen.categoria.codigo).toBe('DIARIO');
  });

  it('valoriza el inventario cuando el item tiene costo', async () => {
    const respuesta = await api.get('/api/v1/inventario?tipo=BOLSA_UTILES&perPage=100');

    const conCosto = respuesta
      .json()
      .data.find((item: { costoCentavos: number | null }) => item.costoCentavos !== null);

    expect(conCosto.valorInventarioCentavos).toBe(conCosto.costoCentavos * conCosto.stockActual);
  });
});

describe('integridad del ledger', () => {
  it('despues de entradas, mermas, ajustes y conteos el invariante sigue en pie', async () => {
    const respuesta = await api.get('/api/v1/admin/verificar-integridad');
    expect(respuesta.statusCode).toBe(200);

    const datos = respuesta.json().data;
    expect(datos.inconsistentes).toEqual([]);
    expect(datos.ok).toBe(true);
  });
});
