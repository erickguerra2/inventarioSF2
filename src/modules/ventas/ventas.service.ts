import { Prisma } from '@prisma/client';
import { auditar } from '../../shared/auditoria.js';
import { BadRequest, Conflict, NotFound } from '../../shared/errors.js';
import type { UsuarioSesion } from '../../shared/middleware/auth.js';
import { nitParaMostrar, nitSospechoso } from '../../shared/nit.js';
import { paginar, type Paginacion } from '../../shared/pagination.js';
import { prisma } from '../../shared/prisma.js';
import { registrarMovimiento } from '../inventario/inventario.service.js';
import type { CrearVentaBody, ListarVentasQuery } from './ventas.schemas.js';

const incluirVenta = {
  lineas: { orderBy: { id: 'asc' } },
  usuario: { select: { id: true, usuario: true, nombre: true } },
  anuladaPor: { select: { id: true, nombre: true } },
  alumno: { select: { id: true, nombres: true, apellidos: true } },
} satisfies Prisma.VentaInclude;

type VentaConDetalle = Prisma.VentaGetPayload<{ include: typeof incluirVenta }>;

function presentarVenta(venta: VentaConDetalle) {
  return {
    id: venta.id,
    correlativo: venta.correlativo,
    estado: venta.estado,
    creadoEn: venta.creadoEn,
    metodoPago: venta.metodoPago,
    referenciaPago: venta.referenciaPago,
    subtotalCentavos: venta.subtotalCentavos,
    descuentoCentavos: venta.descuentoCentavos,
    totalCentavos: venta.totalCentavos,
    comprador: venta.alumno
      ? {
          tipo: 'ALUMNO' as const,
          id: venta.alumno.id,
          nombre: `${venta.alumno.nombres} ${venta.alumno.apellidos}`,
        }
      : venta.compradorNombre
        ? { tipo: 'NOMBRE' as const, id: null, nombre: venta.compradorNombre }
        : null,
    // Para la factura del portal de la SAT. null = consumidor final.
    compradorNit: venta.compradorNit,
    /**
     * Si conviene que alguien le eche un ojo al NIT antes de facturar. Lo decide
     * el backend y no el frontend para no tener el algoritmo del verificador en
     * dos lugares. Nunca impidio cobrar: es un aviso, no un error.
     */
    nitPorRevisar: nitSospechoso(venta.compradorNit),
    // Quien vendio. No es editable nunca: es la base del corte de caja.
    vendidoPor: {
      id: venta.usuario.id,
      usuario: venta.usuario.usuario,
      nombre: venta.usuario.nombre,
    },
    anulacion:
      venta.estado === 'ANULADA'
        ? {
            en: venta.anuladaEn,
            motivo: venta.motivoAnulacion,
            por: venta.anuladaPor ? venta.anuladaPor.nombre : null,
          }
        : null,
    lineas: venta.lineas.map((linea) => ({
      id: linea.id,
      itemId: linea.itemId,
      // Congelados al momento de la venta: el recibo de enero no cambia en marzo.
      descripcion: linea.descripcionSnapshot,
      cantidad: linea.cantidad,
      precioUnitCentavos: linea.precioUnitCentavos,
      totalCentavos: linea.totalCentavos,
    })),
  };
}

/** Una maestra solo ve lo suyo. El filtro se fuerza aqui, no se confia al cliente. */
function alcancePorRol(usuario: UsuarioSesion, usuarioIdPedido?: string): string | undefined {
  if (usuario.rol === 'VENDEDOR') return usuario.id;
  return usuarioIdPedido;
}

async function buscarPorIdempotencyKey(idempotencyKey: string) {
  return prisma.venta.findUnique({ where: { idempotencyKey }, include: incluirVenta });
}

/**
 * Registrar una venta. Todo pasa dentro de UNA transaccion: si algo falla en
 * cualquier paso, no queda venta a medias ni inventario descontado.
 *
 * Devuelve `yaExistia: true` cuando la Idempotency-Key ya se habia usado; en ese
 * caso no se toca el inventario y se responde la venta original.
 */
export async function registrarVenta(
  datos: CrearVentaBody,
  idempotencyKey: string,
  usuario: UsuarioSesion,
) {
  const yaRegistrada = await buscarPorIdempotencyKey(idempotencyKey);
  if (yaRegistrada) {
    return { venta: presentarVenta(yaRegistrada), yaExistia: true };
  }

  // Dos lineas del mismo item se consolidan: es lo que la persona esperaba.
  const consolidadas = new Map<string, number>();
  for (const linea of datos.lineas) {
    consolidadas.set(linea.itemId, (consolidadas.get(linea.itemId) ?? 0) + linea.cantidad);
  }

  // ORDEN ASCENDENTE DE itemId. Esto es lo que evita deadlocks: dos maestras
  // vendiendo polo M y pantalon 32 a la vez toman los locks en el mismo orden,
  // asi que una espera en lugar de trabarse con la otra.
  const lineas = [...consolidadas.entries()]
    .map(([itemId, cantidad]) => ({ itemId, cantidad }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

  try {
    const ventaId = await prisma.$transaction(async (tx) => {
      const detalles: Array<{
        itemId: string;
        descripcionSnapshot: string;
        precioUnitCentavos: number;
        cantidad: number;
        totalCentavos: number;
      }> = [];
      let subtotalCentavos = 0;

      for (const linea of lineas) {
        const filas = await tx.$queryRaw<
          Array<{ id: string; nombre: string; precioCentavos: number; activo: boolean }>
        >`
          SELECT id, nombre, "precioCentavos", activo
          FROM "InventoryItem"
          WHERE id = ${linea.itemId}
          FOR UPDATE
        `;

        const item = filas[0];
        if (!item) throw new NotFound('El item no existe', { itemId: linea.itemId });
        if (!item.activo) {
          throw new Conflict('ITEM_INACTIVO', `"${item.nombre}" ya no esta disponible`, {
            itemId: item.id,
          });
        }

        // El precio sale de la base de datos, SIEMPRE.
        const totalLinea = item.precioCentavos * linea.cantidad;
        subtotalCentavos += totalLinea;
        detalles.push({
          itemId: item.id,
          descripcionSnapshot: item.nombre,
          precioUnitCentavos: item.precioCentavos,
          cantidad: linea.cantidad,
          totalCentavos: totalLinea,
        });
      }

      const descuentoCentavos = datos.descuentoCentavos ?? 0;
      if (descuentoCentavos > subtotalCentavos) {
        throw new BadRequest('El descuento no puede ser mayor que el subtotal', {
          subtotalCentavos,
          descuentoCentavos,
        });
      }

      if (datos.alumnoId) {
        const alumno = await tx.alumno.findUnique({ where: { id: datos.alumnoId } });
        if (!alumno) throw new NotFound('El alumno no existe');
      }

      // Correlativo desde una secuencia de la base, no MAX()+1, que bajo
      // concurrencia produce duplicados.
      const secuencia = await tx.$queryRaw<Array<{ correlativo: bigint }>>`
        SELECT nextval('venta_correlativo_seq') AS correlativo
      `;
      const correlativo = Number(secuencia[0]?.correlativo ?? 0);

      const venta = await tx.venta.create({
        data: {
          correlativo,
          alumnoId: datos.alumnoId ?? null,
          compradorNombre: datos.compradorNombre ?? null,
          compradorNit: datos.compradorNit?.valor ?? null,
          metodoPago: datos.metodoPago,
          referenciaPago: datos.referenciaPago ?? null,
          subtotalCentavos,
          descuentoCentavos,
          totalCentavos: subtotalCentavos - descuentoCentavos,
          idempotencyKey,
          usuarioId: usuario.id,
          lineas: { create: detalles },
        },
      });

      for (const detalle of detalles) {
        await registrarMovimiento(tx, {
          itemId: detalle.itemId,
          cantidad: -detalle.cantidad,
          tipo: 'VENTA',
          refTipo: 'VENTA',
          refId: venta.id,
          usuarioId: usuario.id,
        });
      }

      return venta.id;
    });

    const venta = await prisma.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: incluirVenta,
    });
    return { venta: presentarVenta(venta), yaExistia: false };
  } catch (error) {
    // Carrera con la misma Idempotency-Key: las dos pasaron la comprobacion de
    // arriba y el indice unico dejo entrar solo a una. Se devuelve la que gano,
    // que es exactamente lo que el cliente queria.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.['target']).includes('idempotencyKey')
    ) {
      const ganadora = await buscarPorIdempotencyKey(idempotencyKey);
      if (ganadora) return { venta: presentarVenta(ganadora), yaExistia: true };
    }
    throw error;
  }
}

export async function listarVentas(filtros: ListarVentasQuery, usuario: UsuarioSesion) {
  const paginacion: Paginacion = { page: filtros.page, perPage: filtros.perPage };

  const where: Prisma.VentaWhereInput = {};
  const usuarioId = alcancePorRol(usuario, filtros.usuarioId);
  if (usuarioId) where.usuarioId = usuarioId;
  if (filtros.estado) where.estado = filtros.estado;
  if (filtros.alumnoId) where.alumnoId = filtros.alumnoId;
  if (filtros.soloConDescuento) where.descuentoCentavos = { gt: 0 };
  if (filtros.desde || filtros.hasta) {
    const rango: Prisma.DateTimeFilter = {};
    if (filtros.desde) rango.gte = filtros.desde;
    if (filtros.hasta) rango.lte = filtros.hasta;
    where.creadoEn = rango;
  }

  const [ventas, total, sumas] = await Promise.all([
    prisma.venta.findMany({
      where,
      include: incluirVenta,
      orderBy: { correlativo: 'desc' },
      skip: (paginacion.page - 1) * paginacion.perPage,
      take: paginacion.perPage,
    }),
    prisma.venta.count({ where }),
    // El total cobrado del periodo filtrado, sin contar las anuladas.
    prisma.venta.aggregate({
      where: { ...where, estado: 'PAGADA' },
      _sum: { totalCentavos: true },
    }),
  ]);

  return {
    ...paginar(ventas.map(presentarVenta), total, paginacion),
    resumen: {
      totalCobradoCentavos: sumas._sum.totalCentavos ?? 0,
      incluyeSoloSusVentas: usuario.rol === 'VENDEDOR',
    },
  };
}

/**
 * Para una maestra, una venta ajena responde 404 y no 403: un 403 le confirmaria
 * que la venta existe.
 */
export async function obtenerVenta(id: string, usuario: UsuarioSesion) {
  const venta = await prisma.venta.findUnique({ where: { id }, include: incluirVenta });
  if (!venta) throw new NotFound('La venta no existe');
  if (usuario.rol === 'VENDEDOR' && venta.usuarioId !== usuario.id) {
    throw new NotFound('La venta no existe');
  }
  return presentarVenta(venta);
}

/**
 * Las ventas no se editan ni se borran: se anulan, y el ledger queda con la
 * salida y su reversa. Solo ADMIN (ver docs/plan-backend.md seccion 7).
 */
export async function anularVenta(id: string, motivo: string, usuario: UsuarioSesion) {
  const venta = await prisma.venta.findUnique({ where: { id }, include: { lineas: true } });
  if (!venta) throw new NotFound('La venta no existe');

  if (venta.estado === 'ANULADA') {
    throw new Conflict('VENTA_YA_ANULADA', 'Esta venta ya estaba anulada', {
      correlativo: venta.correlativo,
      anuladaEn: venta.anuladaEn,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.venta.update({
      where: { id },
      data: {
        estado: 'ANULADA',
        anuladaEn: new Date(),
        anuladaPorId: usuario.id,
        motivoAnulacion: motivo,
      },
    });

    // Mismo orden determinista que en la venta.
    const lineas = [...venta.lineas].sort((a, b) => a.itemId.localeCompare(b.itemId));
    for (const linea of lineas) {
      await registrarMovimiento(tx, {
        itemId: linea.itemId,
        cantidad: linea.cantidad, // positiva: regresa al inventario
        tipo: 'ANULACION_VENTA',
        motivo: `Anulacion de la venta #${venta.correlativo}: ${motivo}`,
        refTipo: 'VENTA',
        refId: venta.id,
        usuarioId: usuario.id,
      });
    }

    await auditar(tx, {
      usuarioId: usuario.id,
      accion: 'venta.anular',
      entidad: 'Venta',
      entidadId: id,
      detalle: {
        correlativo: venta.correlativo,
        totalCentavos: venta.totalCentavos,
        vendidaPor: venta.usuarioId,
        motivo,
      },
    });
  });

  return obtenerVenta(id, usuario);
}

/** Datos del recibo. El formato (papel, PDF) es del frontend; aqui van los datos. */
export async function recibo(id: string, usuario: UsuarioSesion) {
  const venta = await obtenerVenta(id, usuario);

  return {
    correlativo: venta.correlativo,
    estado: venta.estado,
    fecha: venta.creadoEn,
    comprador: venta.comprador?.nombre ?? 'Venta al público',
    // El recibo es lo que la directora tiene enfrente cuando factura en el
    // portal de la SAT, asi que el NIT va impreso, con "C/F" cuando no lo dieron.
    nit: nitParaMostrar(venta.compradorNit),
    nitPorRevisar: venta.nitPorRevisar,
    atendidoPor: venta.vendidoPor.nombre,
    metodoPago: venta.metodoPago,
    referenciaPago: venta.referenciaPago,
    lineas: venta.lineas.map((linea) => ({
      cantidad: linea.cantidad,
      descripcion: linea.descripcion,
      precioUnitCentavos: linea.precioUnitCentavos,
      totalCentavos: linea.totalCentavos,
    })),
    subtotalCentavos: venta.subtotalCentavos,
    descuentoCentavos: venta.descuentoCentavos,
    totalCentavos: venta.totalCentavos,
    anulacion: venta.anulacion,
    impresoEn: new Date().toISOString(),
  };
}
