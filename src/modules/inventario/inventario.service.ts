import { randomUUID } from 'node:crypto';
import { Prisma, type TipoMovimiento } from '@prisma/client';
import { BadRequest, Conflict, NotFound } from '../../shared/errors.js';
import { paginar, type Paginacion } from '../../shared/pagination.js';
import { prisma, type Tx } from '../../shared/prisma.js';
import { tiposQueExigenMotivo } from './inventario.schemas.js';
import type {
  ConteoBody,
  EntradasBody,
  KardexQuery,
  ListarInventarioQuery,
  MovimientoManualBody,
} from './inventario.schemas.js';

export type MovimientoInput = {
  itemId: string;
  /** FIRMADO: positivo entra, negativo sale. Nunca 0. */
  cantidad: number;
  tipo: TipoMovimiento;
  usuarioId: string;
  motivo?: string | null;
  refTipo?: string | null;
  refId?: string | null;
};

/**
 * LA UNICA funcion que escribe existencias en todo el sistema.
 *
 * Invariante que sostiene: stockActual == SUM(movimientos.cantidad) para cada item.
 * `stockActual` es solo un cache del ledger; si algun otro lugar del codigo escribe
 * ese campo, el diseno ya se rompio (ver docs/plan-backend.md seccion 3).
 *
 * Recibe el cliente de transaccion, no el global: asi es imposible llamarla sin
 * transaccion, y la venta puede mover varios items de forma atomica.
 */
export async function registrarMovimiento(tx: Tx, entrada: MovimientoInput) {
  const { itemId, cantidad, tipo, usuarioId, motivo, refTipo, refId } = entrada;

  if (!Number.isInteger(cantidad) || cantidad === 0) {
    throw new BadRequest(
      'La cantidad del movimiento debe ser un entero distinto de cero',
      { cantidad },
      'MOVIMIENTO_INVALIDO',
    );
  }

  // Lock pesimista: nadie mas puede tocar este item hasta que la transaccion
  // cierre. Quien mueva varios items debe hacerlo en orden ascendente de id para
  // no provocar deadlocks (ver seccion 4.1 del plan).
  const filas = await tx.$queryRaw<Array<{ id: string; stockActual: number; activo: boolean }>>`
    SELECT id, "stockActual", activo
    FROM "InventoryItem"
    WHERE id = ${itemId}
    FOR UPDATE
  `;

  const item = filas[0];
  if (!item) {
    throw new NotFound('El item de inventario no existe', { itemId });
  }

  // Un item inactivo no admite movimientos nuevos... salvo deshacer una venta.
  // Si no, una prenda descontinuada despues de venderse volveria imposible
  // anular esa venta, que es justo cuando hay que poder.
  if (!item.activo && tipo !== 'ANULACION_VENTA') {
    throw new Conflict('ITEM_INACTIVO', 'El item esta inactivo y no admite movimientos', {
      itemId,
    });
  }

  const saldoDespues = item.stockActual + cantidad;
  if (saldoDespues < 0) {
    throw new Conflict(
      'STOCK_INSUFICIENTE',
      `Existencias insuficientes: hay ${item.stockActual}, se requieren ${-cantidad}`,
      { itemId, disponible: item.stockActual, solicitado: -cantidad },
    );
  }

  await tx.inventoryItem.update({
    where: { id: itemId },
    data: { stockActual: saldoDespues },
  });

  return tx.movimientoStock.create({
    data: {
      itemId,
      cantidad,
      tipo,
      motivo: motivo ?? null,
      refTipo: refTipo ?? null,
      refId: refId ?? null,
      saldoDespues,
      usuarioId,
    },
  });
}

/**
 * Verifica el invariante del ledger. Devuelve los items donde el cache no coincide
 * con la suma de sus movimientos; si devuelve vacio, el inventario esta sano.
 * Util despues de una migracion, de un bug, o como prueba de regresion.
 */
export async function itemsConStockInconsistente(): Promise<
  Array<{ id: string; sku: string; stockActual: number; sumaMovimientos: number }>
> {
  return prisma.$queryRaw<
    Array<{ id: string; sku: string; stockActual: number; sumaMovimientos: number }>
  >`
    SELECT i.id,
           i.sku,
           i."stockActual",
           COALESCE(SUM(m.cantidad), 0)::int AS "sumaMovimientos"
    FROM "InventoryItem" i
    LEFT JOIN "MovimientoStock" m ON m."itemId" = i.id
    GROUP BY i.id, i.sku, i."stockActual"
    HAVING i."stockActual" <> COALESCE(SUM(m.cantidad), 0)
  `;
}

// ===========================================================================
// Signo del movimiento: el tipo manda, el cliente solo manda la magnitud
// ===========================================================================

const TIPOS_QUE_SUMAN = new Set<TipoMovimiento>([
  'ENTRADA',
  'APERTURA',
  'DEVOLUCION',
  'AJUSTE_POS',
  'ANULACION_VENTA',
]);

function signoDe(tipo: TipoMovimiento): 1 | -1 {
  return TIPOS_QUE_SUMAN.has(tipo) ? 1 : -1;
}

// ===========================================================================
// Vista unificada de inventario (uniformes + bolsas en la misma lista)
// ===========================================================================

const incluirItem = {
  variante: { include: { prenda: { include: { categoria: true } } } },
  bolsa: { include: { grado: { include: { nivel: true } }, ciclo: true } },
} satisfies Prisma.InventoryItemInclude;

type ItemConOrigen = Prisma.InventoryItemGetPayload<{ include: typeof incluirItem }>;

function presentarItem(item: ItemConOrigen) {
  const origen = item.variante
    ? {
        clase: 'UNIFORME_TALLA' as const,
        varianteId: item.variante.id,
        prendaId: item.variante.prendaId,
        prenda: item.variante.prenda.nombre,
        categoria: {
          codigo: item.variante.prenda.categoria.codigo,
          nombre: item.variante.prenda.categoria.nombre,
        },
        talla: item.variante.talla,
      }
    : item.bolsa
      ? {
          clase: 'BOLSA_UTILES' as const,
          bolsaId: item.bolsa.id,
          grado: {
            id: item.bolsa.grado.id,
            nombre: item.bolsa.grado.nombre,
            nivel: item.bolsa.grado.nivel.nombre,
          },
          ciclo: { id: item.bolsa.ciclo.id, anio: item.bolsa.ciclo.anio },
          version: item.bolsa.version,
        }
      : null;

  return {
    id: item.id,
    sku: item.sku,
    tipo: item.tipo,
    nombre: item.nombre,
    precioCentavos: item.precioCentavos,
    costoCentavos: item.costoCentavos,
    stockActual: item.stockActual,
    stockMinimo: item.stockMinimo,
    activo: item.activo,
    agotado: item.stockActual === 0,
    bajoStock: item.stockActual <= item.stockMinimo,
    faltante: Math.max(0, item.stockMinimo - item.stockActual),
    valorInventarioCentavos:
      item.costoCentavos === null ? null : item.costoCentavos * item.stockActual,
    origen,
  };
}

export async function listarInventario(filtros: ListarInventarioQuery) {
  const paginacion: Paginacion = { page: filtros.page, perPage: filtros.perPage };

  const where: Prisma.InventoryItemWhereInput = {};
  if (filtros.tipo) where.tipo = filtros.tipo;
  if (!filtros.incluirInactivos) where.activo = true;
  if (filtros.q) {
    where.OR = [
      { sku: { contains: filtros.q, mode: 'insensitive' } },
      { nombre: { contains: filtros.q, mode: 'insensitive' } },
    ];
  }
  if (filtros.bajoStock) {
    // Comparacion entre dos columnas de la misma tabla.
    where.stockActual = { lte: prisma.inventoryItem.fields.stockMinimo };
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: incluirItem,
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      skip: (paginacion.page - 1) * paginacion.perPage,
      take: paginacion.perPage,
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  return paginar(items.map(presentarItem), total, paginacion);
}

export async function obtenerItem(itemId: string) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    include: incluirItem,
  });
  if (!item) throw new NotFound('El item de inventario no existe');
  return presentarItem(item);
}

/**
 * Items que hay que reponer: stockActual <= stockMinimo. Se ordenan por lo que
 * falta, que es el orden en que le sirven a quien tiene que comprar.
 */
export async function alertasDeStock() {
  const items = await prisma.inventoryItem.findMany({
    where: { activo: true, stockActual: { lte: prisma.inventoryItem.fields.stockMinimo } },
    include: incluirItem,
  });

  const presentados = items
    .map(presentarItem)
    .sort((a, b) => b.faltante - a.faltante || a.nombre.localeCompare(b.nombre));

  return {
    data: presentados,
    resumen: {
      total: presentados.length,
      agotados: presentados.filter((item) => item.agotado).length,
    },
  };
}

// ===========================================================================
// Movimientos
// ===========================================================================

function validarTipoManual(tipo: TipoMovimiento, motivo?: string) {
  if (tipo === 'VENTA' || tipo === 'ANULACION_VENTA') {
    throw new Conflict(
      'MOVIMIENTO_INVALIDO',
      'Los movimientos de venta no se registran a mano: se generan desde POST /ventas',
      { tipo },
    );
  }
  if (tiposQueExigenMotivo.has(tipo) && !motivo) {
    throw new BadRequest('Los ajustes y las mermas exigen un motivo', { tipo });
  }
}

/** Un solo movimiento sobre un item: entrada, ajuste, merma o devolucion. */
export async function registrarMovimientoManual(
  itemId: string,
  datos: MovimientoManualBody,
  usuarioId: string,
) {
  validarTipoManual(datos.tipo, datos.motivo);

  const movimiento = await prisma.$transaction((tx) =>
    registrarMovimiento(tx, {
      itemId,
      cantidad: datos.cantidad * signoDe(datos.tipo),
      tipo: datos.tipo,
      motivo: datos.motivo ?? null,
      usuarioId,
    }),
  );

  return {
    movimiento: {
      id: movimiento.id,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      saldoDespues: movimiento.saldoDespues,
      motivo: movimiento.motivo,
      creadoEn: movimiento.creadoEn,
    },
    item: await obtenerItem(itemId),
  };
}

/**
 * Entrada en lote, en UNA transaccion: "entraron 25 bolsas de 4to primaria y 12
 * polos M". Es la pantalla principal de la administradora.
 *
 * Con tipo APERTURA, este mismo endpoint ES la carga inicial del inventario: no
 * hace falta un importador aparte.
 */
export async function registrarEntradas(datos: EntradasBody, usuarioId: string) {
  // Dos lineas del mismo item se consolidan en vez de rechazarse: es mas amable
  // y el resultado es el que la persona esperaba.
  const consolidadas = new Map<string, number>();
  for (const linea of datos.lineas) {
    consolidadas.set(linea.itemId, (consolidadas.get(linea.itemId) ?? 0) + linea.cantidad);
  }

  // Orden ascendente de id: dos entradas simultaneas toman los locks en el mismo
  // orden y una espera, en vez de trabarse mutuamente.
  const lineas = [...consolidadas.entries()]
    .map(([itemId, cantidad]) => ({ itemId, cantidad }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

  const movimientos = await prisma.$transaction(async (tx) => {
    const resultado = [];
    for (const linea of lineas) {
      const movimiento = await registrarMovimiento(tx, {
        itemId: linea.itemId,
        cantidad: linea.cantidad,
        tipo: datos.tipo,
        motivo: datos.motivo,
        refTipo: 'COMPRA',
        usuarioId,
      });
      resultado.push(movimiento);
    }
    return resultado;
  });

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: lineas.map((linea) => linea.itemId) } },
    select: { id: true, sku: true, nombre: true, stockActual: true },
  });
  const porId = new Map(items.map((item) => [item.id, item]));

  return {
    tipo: datos.tipo,
    motivo: datos.motivo,
    totalUnidades: lineas.reduce((suma, linea) => suma + linea.cantidad, 0),
    lineas: movimientos.map((movimiento) => ({
      itemId: movimiento.itemId,
      sku: porId.get(movimiento.itemId)?.sku ?? null,
      nombre: porId.get(movimiento.itemId)?.nombre ?? null,
      ingresado: movimiento.cantidad,
      saldoDespues: movimiento.saldoDespues,
      movimientoId: movimiento.id,
    })),
  };
}

/**
 * Conteo fisico. No "corrige" el stock: registra la diferencia como ajuste, con
 * motivo, para que el faltante quede documentado en vez de desaparecer.
 *
 * Todos los ajustes del mismo conteo comparten `refId`, asi que el conteo entero
 * se puede reconstruir desde el ledger con (refTipo='CONTEO', refId).
 */
export async function registrarConteo(datos: ConteoBody, usuarioId: string) {
  const vistos = new Set<string>();
  for (const linea of datos.lineas) {
    if (vistos.has(linea.itemId)) {
      throw new BadRequest('El mismo item aparece dos veces en el conteo', {
        itemId: linea.itemId,
      });
    }
    vistos.add(linea.itemId);
  }

  const lineas = [...datos.lineas].sort((a, b) => a.itemId.localeCompare(b.itemId));
  const conteoId = randomUUID();
  const motivo = datos.motivo ?? `Conteo fisico ${new Date().toISOString().slice(0, 10)}`;

  const resultado = await prisma.$transaction(async (tx) => {
    const detalle = [];

    for (const linea of lineas) {
      const filas = await tx.$queryRaw<
        Array<{ id: string; sku: string; nombre: string; stockActual: number; activo: boolean }>
      >`
        SELECT id, sku, nombre, "stockActual", activo
        FROM "InventoryItem"
        WHERE id = ${linea.itemId}
        FOR UPDATE
      `;

      const item = filas[0];
      if (!item) throw new NotFound('El item de inventario no existe', { itemId: linea.itemId });
      if (!item.activo) {
        throw new Conflict('ITEM_INACTIVO', `El item ${item.sku} esta inactivo`, {
          itemId: item.id,
        });
      }

      const diferencia = linea.contado - item.stockActual;
      let movimientoId: string | null = null;

      if (diferencia !== 0) {
        const movimiento = await registrarMovimiento(tx, {
          itemId: item.id,
          cantidad: diferencia,
          tipo: diferencia > 0 ? 'AJUSTE_POS' : 'AJUSTE_NEG',
          motivo,
          refTipo: 'CONTEO',
          refId: conteoId,
          usuarioId,
        });
        movimientoId = movimiento.id;
      }

      detalle.push({
        itemId: item.id,
        sku: item.sku,
        nombre: item.nombre,
        enSistema: item.stockActual,
        contado: linea.contado,
        diferencia,
        movimientoId,
      });
    }

    return detalle;
  });

  const conDiferencia = resultado.filter((linea) => linea.diferencia !== 0);

  return {
    conteoId,
    motivo,
    contadoEn: new Date().toISOString(),
    resumen: {
      itemsContados: resultado.length,
      itemsConDiferencia: conDiferencia.length,
      unidadesFaltantes: conDiferencia
        .filter((linea) => linea.diferencia < 0)
        .reduce((suma, linea) => suma - linea.diferencia, 0),
      unidadesSobrantes: conDiferencia
        .filter((linea) => linea.diferencia > 0)
        .reduce((suma, linea) => suma + linea.diferencia, 0),
    },
    lineas: resultado,
  };
}

/**
 * Kardex: el historial de un item. Es un SELECT ordenado por fecha, que es
 * justamente lo que un campo editable de stock no permitiria responder.
 */
export async function kardex(itemId: string, filtros: KardexQuery) {
  const item = await obtenerItem(itemId);
  const paginacion: Paginacion = { page: filtros.page, perPage: filtros.perPage };

  const rango: Prisma.DateTimeFilter = {};
  if (filtros.desde) rango.gte = filtros.desde;
  if (filtros.hasta) rango.lte = filtros.hasta;
  const where: Prisma.MovimientoStockWhereInput = { itemId };
  if (filtros.desde || filtros.hasta) where.creadoEn = rango;

  const [movimientos, total, anterior, enPeriodo] = await Promise.all([
    prisma.movimientoStock.findMany({
      where,
      include: { usuario: { select: { id: true, usuario: true, nombre: true } } },
      orderBy: { creadoEn: 'asc' },
      skip: (paginacion.page - 1) * paginacion.perPage,
      take: paginacion.perPage,
    }),
    prisma.movimientoStock.count({ where }),
    // Saldo con el que arranca el periodo, independiente de la paginacion.
    filtros.desde
      ? prisma.movimientoStock.aggregate({
          where: { itemId, creadoEn: { lt: filtros.desde } },
          _sum: { cantidad: true },
        })
      : Promise.resolve({ _sum: { cantidad: 0 } }),
    prisma.movimientoStock.aggregate({ where, _sum: { cantidad: true } }),
  ]);

  const saldoInicial = anterior._sum.cantidad ?? 0;
  const movido = enPeriodo._sum.cantidad ?? 0;

  return {
    item,
    periodo: {
      desde: filtros.desde?.toISOString() ?? null,
      hasta: filtros.hasta?.toISOString() ?? null,
      saldoInicial,
      saldoFinal: saldoInicial + movido,
      movidoEnPeriodo: movido,
    },
    ...paginar(
      movimientos.map((movimiento) => ({
        id: movimiento.id,
        fecha: movimiento.creadoEn,
        tipo: movimiento.tipo,
        cantidad: movimiento.cantidad,
        saldoDespues: movimiento.saldoDespues,
        motivo: movimiento.motivo,
        referencia:
          movimiento.refTipo === null ? null : { tipo: movimiento.refTipo, id: movimiento.refId },
        usuario: { id: movimiento.usuario.id, nombre: movimiento.usuario.nombre },
      })),
      total,
      paginacion,
    ),
  };
}

export async function verificarIntegridad() {
  const inconsistentes = await itemsConStockInconsistente();
  return {
    ok: inconsistentes.length === 0,
    revisadoEn: new Date().toISOString(),
    inconsistentes,
  };
}
