import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { diaLocal } from '../../shared/fechas.js';
import type { UsuarioSesion } from '../../shared/middleware/auth.js';
import { prisma } from '../../shared/prisma.js';
import type {
  BolsasPorGradoQuery,
  CorteCajaQuery,
  TallasQuery,
  VentasQuery,
} from './reportes.schemas.js';

/**
 * Estos reportes se escriben en SQL y no con el query builder a proposito: son
 * agrupaciones con joins y FILTER que en Prisma salen en varias consultas y
 * terminan armandose en memoria. Aqui la base hace el trabajo que sabe hacer.
 */

const ZONA = env.TZ; // America/Guatemala

/**
 * El dia del corte, en hora de Guatemala. Se pasa como texto YYYY-MM-DD y los
 * limites los calcula Postgres (ver abajo), no JavaScript: asi el corte sale
 * igual aunque el proceso de Node arranque con otra zona horaria. Es dinero: no
 * depende de una variable de entorno bien puesta.
 */
function diaDelCorte(fecha?: string): string {
  return fecha ?? diaLocal();
}

function rango(desde?: Date, hasta?: Date) {
  const inicio = desde ?? new Date(0);
  const fin = hasta ?? new Date(8_640_000_000_000);
  return { inicio, fin };
}

// ===========================================================================
// Corte de caja
// ===========================================================================

type FilaCorte = {
  usuarioId: string;
  usuario: string;
  nombre: string;
  metodoPago: string;
  ventas: number;
  totalCentavos: number;
};

/**
 * Lo que cada maestra tiene que entregar al final del dia, separado por metodo
 * de pago: el efectivo se entrega en mano, la transferencia ya esta en el banco.
 *
 * Las anuladas no suman (solo cuentan las PAGADA), pero se reportan aparte para
 * que los numeros se puedan explicar.
 */
export async function corteDeCaja(filtros: CorteCajaQuery, usuario: UsuarioSesion) {
  const etiqueta = diaDelCorte(filtros.fecha);

  // Una maestra solo ve su propio corte, pida lo que pida.
  const usuarioId = usuario.rol === 'VENDEDOR' ? usuario.id : filtros.usuarioId;
  const filtroUsuario = usuarioId ? Prisma.sql`AND v."usuarioId" = ${usuarioId}` : Prisma.empty;

  // La medianoche local de Guatemala, calculada por la base: [dia, dia+1).
  const delDia = Prisma.sql`
    AND v."creadoEn" >= (${etiqueta}::date)::timestamp AT TIME ZONE ${ZONA}
    AND v."creadoEn" <  ((${etiqueta}::date + 1)::timestamp AT TIME ZONE ${ZONA})
  `;

  const filas = await prisma.$queryRaw<FilaCorte[]>`
    SELECT v."usuarioId",
           u.usuario,
           u.nombre,
           v."metodoPago"::text AS "metodoPago",
           COUNT(*)::int AS ventas,
           COALESCE(SUM(v."totalCentavos"), 0)::int AS "totalCentavos"
    FROM "Venta" v
    JOIN "Usuario" u ON u.id = v."usuarioId"
    WHERE v.estado = 'PAGADA'
      ${delDia}
      ${filtroUsuario}
    GROUP BY v."usuarioId", u.usuario, u.nombre, v."metodoPago"
    ORDER BY u.nombre
  `;

  const anuladas = await prisma.$queryRaw<Array<{ ventas: number; totalCentavos: number }>>`
    SELECT COUNT(*)::int AS ventas,
           COALESCE(SUM(v."totalCentavos"), 0)::int AS "totalCentavos"
    FROM "Venta" v
    WHERE v.estado = 'ANULADA'
      ${delDia}
      ${filtroUsuario}
  `;

  const porMaestra = new Map<
    string,
    {
      usuarioId: string;
      usuario: string;
      nombre: string;
      ventas: number;
      cobradoCentavos: number;
      porMetodo: Record<string, number>;
      aEntregarEnEfectivoCentavos: number;
    }
  >();
  const porMetodo: Record<string, number> = {};

  for (const fila of filas) {
    const actual = porMaestra.get(fila.usuarioId) ?? {
      usuarioId: fila.usuarioId,
      usuario: fila.usuario,
      nombre: fila.nombre,
      ventas: 0,
      cobradoCentavos: 0,
      porMetodo: {},
      aEntregarEnEfectivoCentavos: 0,
    };

    actual.ventas += fila.ventas;
    actual.cobradoCentavos += fila.totalCentavos;
    actual.porMetodo[fila.metodoPago] =
      (actual.porMetodo[fila.metodoPago] ?? 0) + fila.totalCentavos;
    if (fila.metodoPago === 'EFECTIVO') {
      actual.aEntregarEnEfectivoCentavos += fila.totalCentavos;
    }

    porMaestra.set(fila.usuarioId, actual);
    porMetodo[fila.metodoPago] = (porMetodo[fila.metodoPago] ?? 0) + fila.totalCentavos;
  }

  const lista = [...porMaestra.values()];

  return {
    fecha: etiqueta,
    zona: ZONA,
    alcance: usuario.rol === 'VENDEDOR' ? 'SOLO_MIS_VENTAS' : 'TODAS',
    totales: {
      ventas: lista.reduce((suma, maestra) => suma + maestra.ventas, 0),
      cobradoCentavos: lista.reduce((suma, maestra) => suma + maestra.cobradoCentavos, 0),
      efectivoCentavos: porMetodo['EFECTIVO'] ?? 0,
      anuladas: anuladas[0]?.ventas ?? 0,
      anuladoCentavos: anuladas[0]?.totalCentavos ?? 0,
    },
    porMetodo,
    porMaestra: lista,
  };
}

// ===========================================================================
// Ventas agrupadas
// ===========================================================================

export type FilaVentas = {
  clave: string;
  etiqueta: string;
  ventas: number;
  unidades: number;
  totalCentavos: number;
};

export async function ventasAgrupadas(filtros: VentasQuery) {
  const { inicio, fin } = rango(filtros.desde, filtros.hasta);

  let filas: FilaVentas[];

  if (filtros.agrupar === 'dia') {
    filas = await prisma.$queryRaw<FilaVentas[]>`
      SELECT to_char(v."creadoEn" AT TIME ZONE ${ZONA}, 'YYYY-MM-DD') AS clave,
             to_char(v."creadoEn" AT TIME ZONE ${ZONA}, 'YYYY-MM-DD') AS etiqueta,
             COUNT(DISTINCT v.id)::int AS ventas,
             COALESCE(SUM(l.cantidad), 0)::int AS unidades,
             COALESCE(SUM(v."totalCentavos"), 0)::int AS "totalCentavos"
      FROM "Venta" v
      LEFT JOIN "VentaLinea" l ON l."ventaId" = v.id
      WHERE v.estado = 'PAGADA' AND v."creadoEn" BETWEEN ${inicio} AND ${fin}
      GROUP BY 1, 2
      ORDER BY 1 DESC
    `;
    // El total por dia se repetiria por cada linea si se sumara v."totalCentavos"
    // directamente, asi que se recalcula aparte.
    const totales = await prisma.$queryRaw<Array<{ clave: string; totalCentavos: number }>>`
      SELECT to_char(v."creadoEn" AT TIME ZONE ${ZONA}, 'YYYY-MM-DD') AS clave,
             COALESCE(SUM(v."totalCentavos"), 0)::int AS "totalCentavos"
      FROM "Venta" v
      WHERE v.estado = 'PAGADA' AND v."creadoEn" BETWEEN ${inicio} AND ${fin}
      GROUP BY 1
    `;
    const porClave = new Map(totales.map((fila) => [fila.clave, fila.totalCentavos]));
    filas = filas.map((fila) => ({ ...fila, totalCentavos: porClave.get(fila.clave) ?? 0 }));
  } else if (filtros.agrupar === 'usuario') {
    filas = await prisma.$queryRaw<FilaVentas[]>`
      SELECT u.id AS clave,
             u.nombre AS etiqueta,
             COUNT(*)::int AS ventas,
             0::int AS unidades,
             COALESCE(SUM(v."totalCentavos"), 0)::int AS "totalCentavos"
      FROM "Venta" v
      JOIN "Usuario" u ON u.id = v."usuarioId"
      WHERE v.estado = 'PAGADA' AND v."creadoEn" BETWEEN ${inicio} AND ${fin}
      GROUP BY u.id, u.nombre
      ORDER BY "totalCentavos" DESC
    `;
  } else if (filtros.agrupar === 'tipo') {
    filas = await prisma.$queryRaw<FilaVentas[]>`
      SELECT i.tipo::text AS clave,
             CASE i.tipo WHEN 'UNIFORME_TALLA' THEN 'Uniformes' ELSE 'Bolsas de utiles' END AS etiqueta,
             COUNT(DISTINCT v.id)::int AS ventas,
             COALESCE(SUM(l.cantidad), 0)::int AS unidades,
             COALESCE(SUM(l."totalCentavos"), 0)::int AS "totalCentavos"
      FROM "VentaLinea" l
      JOIN "Venta" v ON v.id = l."ventaId"
      JOIN "InventoryItem" i ON i.id = l."itemId"
      WHERE v.estado = 'PAGADA' AND v."creadoEn" BETWEEN ${inicio} AND ${fin}
      GROUP BY i.tipo
      ORDER BY "totalCentavos" DESC
    `;
  } else {
    // Por grado: solo tiene sentido para las bolsas de utiles.
    filas = await prisma.$queryRaw<FilaVentas[]>`
      SELECT g.id AS clave,
             g.nombre AS etiqueta,
             COUNT(DISTINCT v.id)::int AS ventas,
             COALESCE(SUM(l.cantidad), 0)::int AS unidades,
             COALESCE(SUM(l."totalCentavos"), 0)::int AS "totalCentavos"
      FROM "VentaLinea" l
      JOIN "Venta" v ON v.id = l."ventaId"
      JOIN "BolsaUtiles" b ON b."itemId" = l."itemId"
      JOIN "Grado" g ON g.id = b."gradoId"
      JOIN "Nivel" n ON n.id = g."nivelId"
      WHERE v.estado = 'PAGADA' AND v."creadoEn" BETWEEN ${inicio} AND ${fin}
      GROUP BY g.id, g.nombre, n.orden, g.orden
      ORDER BY n.orden, g.orden
    `;
  }

  const notas: string[] = [];
  if (filtros.agrupar === 'tipo' || filtros.agrupar === 'grado') {
    notas.push(
      'Los totales son la suma de las lineas, ANTES de descuento: el descuento se aplica a la venta completa, no a una linea.',
    );
  }
  if (filtros.agrupar === 'grado') {
    notas.push('Solo incluye bolsas de utiles; los uniformes no tienen grado.');
  }

  return {
    agrupadoPor: filtros.agrupar,
    periodo: {
      desde: filtros.desde?.toISOString() ?? null,
      hasta: filtros.hasta?.toISOString() ?? null,
    },
    totales: {
      ventas: filas.reduce((suma, fila) => suma + fila.ventas, 0),
      totalCentavos: filas.reduce((suma, fila) => suma + fila.totalCentavos, 0),
    },
    notas,
    data: filas,
  };
}

// ===========================================================================
// Tallas mas vendidas
// ===========================================================================

export type FilaTalla = {
  itemId: string;
  sku: string;
  prenda: string;
  talla: string;
  unidades: number;
  totalCentavos: number;
  stockActual: number;
};

export async function tallasMasVendidas(filtros: TallasQuery) {
  const { inicio, fin } = rango(filtros.desde, filtros.hasta);

  const data = await prisma.$queryRaw<FilaTalla[]>`
    SELECT i.id AS "itemId",
           i.sku,
           p.nombre AS prenda,
           uv.talla,
           SUM(l.cantidad)::int AS unidades,
           SUM(l."totalCentavos")::int AS "totalCentavos",
           i."stockActual"
    FROM "VentaLinea" l
    JOIN "Venta" v ON v.id = l."ventaId"
    JOIN "InventoryItem" i ON i.id = l."itemId"
    JOIN "UniformeVariante" uv ON uv."itemId" = i.id
    JOIN "Prenda" p ON p.id = uv."prendaId"
    WHERE v.estado = 'PAGADA' AND v."creadoEn" BETWEEN ${inicio} AND ${fin}
    GROUP BY i.id, i.sku, p.nombre, uv.talla, i."stockActual"
    ORDER BY unidades DESC, p.nombre
    LIMIT ${filtros.limite}
  `;

  return {
    periodo: {
      desde: filtros.desde?.toISOString() ?? null,
      hasta: filtros.hasta?.toISOString() ?? null,
    },
    nota: 'Sirve para saber que tallas pedir. La columna stockActual es de hoy, no del periodo.',
    data,
  };
}

// ===========================================================================
// Existencias valorizadas
// ===========================================================================

type FilaValorizada = {
  tipo: string;
  items: number;
  unidades: number;
  valorCentavos: number;
  itemsSinCosto: number;
  unidadesSinCosto: number;
};

export async function existenciasValorizadas() {
  const data = await prisma.$queryRaw<FilaValorizada[]>`
    SELECT tipo::text AS tipo,
           COUNT(*)::int AS items,
           COALESCE(SUM("stockActual"), 0)::int AS unidades,
           COALESCE(SUM("stockActual" * COALESCE("costoCentavos", 0)), 0)::int AS "valorCentavos",
           COUNT(*) FILTER (WHERE "costoCentavos" IS NULL)::int AS "itemsSinCosto",
           COALESCE(SUM("stockActual") FILTER (WHERE "costoCentavos" IS NULL), 0)::int AS "unidadesSinCosto"
    FROM "InventoryItem"
    WHERE activo = true
    GROUP BY tipo
    ORDER BY tipo
  `;

  const itemsSinCosto = data.reduce((suma, fila) => suma + fila.itemsSinCosto, 0);

  return {
    totales: {
      items: data.reduce((suma, fila) => suma + fila.items, 0),
      unidades: data.reduce((suma, fila) => suma + fila.unidades, 0),
      valorCentavos: data.reduce((suma, fila) => suma + fila.valorCentavos, 0),
      itemsSinCosto,
    },
    // Importante decirlo: un item sin costo registrado aporta 0 a la valorizacion,
    // asi que el total es un piso, no el valor real del inventario.
    advertencia:
      itemsSinCosto > 0
        ? `${itemsSinCosto} item(s) activos no tienen costo registrado y aportan 0 a esta suma. El total es un minimo, no el valor real.`
        : null,
    data,
  };
}

// ===========================================================================
// Bolsas por grado
// ===========================================================================

export type FilaBolsa = {
  bolsaId: string;
  sku: string;
  nivel: string;
  grado: string;
  anio: number;
  precioCentavos: number;
  stockActual: number;
  vendidas: number;
  totalCentavos: number;
};

export async function bolsasPorGrado(filtros: BolsasPorGradoQuery) {
  const filtroCiclo = filtros.cicloId
    ? Prisma.sql`AND c.id = ${filtros.cicloId}`
    : filtros.ciclo
      ? Prisma.sql`AND c.anio = ${filtros.ciclo}`
      : Prisma.empty;

  const data = await prisma.$queryRaw<FilaBolsa[]>`
    SELECT b.id AS "bolsaId",
           i.sku,
           n.nombre AS nivel,
           g.nombre AS grado,
           c.anio,
           i."precioCentavos",
           i."stockActual",
           COALESCE(SUM(l.cantidad) FILTER (WHERE v.estado = 'PAGADA'), 0)::int AS vendidas,
           COALESCE(SUM(l."totalCentavos") FILTER (WHERE v.estado = 'PAGADA'), 0)::int AS "totalCentavos"
    FROM "BolsaUtiles" b
    JOIN "Grado" g ON g.id = b."gradoId"
    JOIN "Nivel" n ON n.id = g."nivelId"
    JOIN "CicloEscolar" c ON c.id = b."cicloId"
    JOIN "InventoryItem" i ON i.id = b."itemId"
    LEFT JOIN "VentaLinea" l ON l."itemId" = b."itemId"
    LEFT JOIN "Venta" v ON v.id = l."ventaId"
    WHERE TRUE ${filtroCiclo}
    GROUP BY b.id, i.sku, n.nombre, g.nombre, c.anio, i."precioCentavos", i."stockActual", n.orden, g.orden
    ORDER BY c.anio DESC, n.orden, g.orden
  `;

  return {
    nota: 'La comparacion contra alumnos inscritos queda pendiente del padron de alumnos (Fase 6).',
    totales: {
      vendidas: data.reduce((suma, fila) => suma + fila.vendidas, 0),
      totalCentavos: data.reduce((suma, fila) => suma + fila.totalCentavos, 0),
      enExistencia: data.reduce((suma, fila) => suma + fila.stockActual, 0),
    },
    data,
  };
}
