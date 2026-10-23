import { Prisma, type TipoTalla } from '@prisma/client';
import { auditar } from '../../shared/auditoria.js';
import { Conflict, NotFound } from '../../shared/errors.js';
import { presentarMedia } from '../../shared/media.js';
import { prisma, type Tx } from '../../shared/prisma.js';
import { skuVariante } from '../../shared/sku.js';
import { normalizarTalla, ordenDeTalla } from './tallas.js';
import type {
  ActualizarPrendaBody,
  ActualizarVarianteBody,
  CrearPrendaBody,
  VarianteNueva,
} from './uniformes.schemas.js';

const incluirPrenda = {
  categoria: true,
  fotos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }] },
  variantes: { include: { item: true }, orderBy: { ordenTalla: 'asc' } },
} satisfies Prisma.PrendaInclude;

type PrendaConDetalle = Prisma.PrendaGetPayload<{ include: typeof incluirPrenda }>;

function presentarVariante(variante: PrendaConDetalle['variantes'][number]) {
  const { item } = variante;
  return {
    id: variante.id,
    // El frontend vende con itemId, nunca con el id de la variante: el item es la
    // unidad de inventario.
    itemId: item.id,
    sku: item.sku,
    talla: variante.talla,
    precioCentavos: item.precioCentavos,
    costoCentavos: item.costoCentavos,
    stockActual: item.stockActual,
    stockMinimo: item.stockMinimo,
    activo: item.activo,
    // Una talla agotada se sigue mostrando (la vendedora necesita saber que hay
    // que pedirla), pero marcada: el intento de venta se rechaza con 409.
    disponible: item.activo && item.stockActual > 0,
    bajoStock: item.stockActual <= item.stockMinimo,
  };
}

function presentarPrenda(prenda: PrendaConDetalle) {
  return {
    id: prenda.id,
    nombre: prenda.nombre,
    descripcion: prenda.descripcion,
    tipoTalla: prenda.tipoTalla,
    activo: prenda.activo,
    categoria: {
      id: prenda.categoria.id,
      codigo: prenda.categoria.codigo,
      nombre: prenda.categoria.nombre,
    },
    fotos: prenda.fotos.map(presentarMedia),
    variantes: prenda.variantes.map(presentarVariante),
  };
}

export async function listarCategorias() {
  const categorias = await prisma.categoriaUniforme.findMany({ orderBy: { orden: 'asc' } });
  return categorias.map((categoria) => ({
    id: categoria.id,
    codigo: categoria.codigo,
    nombre: categoria.nombre,
    orden: categoria.orden,
  }));
}

export async function listarPrendas(filtros: { categoria?: string; incluirInactivas?: boolean }) {
  const where: Prisma.PrendaWhereInput = {};
  if (!filtros.incluirInactivas) where.activo = true;
  if (filtros.categoria) {
    where.categoria = { codigo: filtros.categoria.toUpperCase() };
  }

  const prendas = await prisma.prenda.findMany({
    where,
    include: incluirPrenda,
    orderBy: [{ categoria: { orden: 'asc' } }, { nombre: 'asc' }],
  });

  return prendas.map(presentarPrenda);
}

export async function obtenerPrenda(id: string) {
  const prenda = await prisma.prenda.findUnique({ where: { id }, include: incluirPrenda });
  if (!prenda) throw new NotFound('La prenda no existe');
  return presentarPrenda(prenda);
}

async function crearVarianteEnTx(
  tx: Tx,
  contexto: {
    prendaId: string;
    nombrePrenda: string;
    tipoTalla: TipoTalla;
    codigoCategoria: string;
  },
  datos: VarianteNueva,
) {
  const talla = normalizarTalla(datos.talla, contexto.tipoTalla);
  const ordenTalla = ordenDeTalla(talla, contexto.tipoTalla);

  const item = await tx.inventoryItem.create({
    data: {
      tipo: 'UNIFORME_TALLA',
      sku: skuVariante(contexto.codigoCategoria, contexto.nombrePrenda, talla),
      nombre: `${contexto.nombrePrenda} - ${talla}`,
      precioCentavos: datos.precioCentavos,
      costoCentavos: datos.costoCentavos ?? null,
      stockMinimo: datos.stockMinimo ?? 0,
      // stockActual arranca en 0 siempre: las existencias entran con un
      // movimiento de inventario, nunca al crear el catalogo.
    },
  });

  return tx.uniformeVariante.create({
    data: { prendaId: contexto.prendaId, talla, ordenTalla, itemId: item.id },
  });
}

export async function crearPrenda(datos: CrearPrendaBody) {
  const categoria = await prisma.categoriaUniforme.findUnique({
    where: { id: datos.categoriaId },
  });
  if (!categoria) throw new NotFound('La categoria de uniforme no existe');

  const prendaId = await prisma.$transaction(async (tx) => {
    const prenda = await tx.prenda.create({
      data: {
        categoriaId: categoria.id,
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        tipoTalla: datos.tipoTalla,
      },
    });

    for (const variante of datos.variantes ?? []) {
      await crearVarianteEnTx(
        tx,
        {
          prendaId: prenda.id,
          nombrePrenda: prenda.nombre,
          tipoTalla: prenda.tipoTalla,
          codigoCategoria: categoria.codigo,
        },
        variante,
      );
    }

    return prenda.id;
  });

  return obtenerPrenda(prendaId);
}

export async function actualizarPrenda(
  id: string,
  datos: ActualizarPrendaBody,
  usuarioId: string,
) {
  const prenda = await prisma.prenda.findUnique({
    where: { id },
    select: { id: true, nombre: true, variantes: { select: { itemId: true } } },
  });
  if (!prenda) throw new NotFound('La prenda no existe');

  await prisma.$transaction(async (tx) => {
    await tx.prenda.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        activo: datos.activo,
      },
    });

    // Desactivar una prenda desactiva sus tallas: si el polo sale del catalogo,
    // ninguna de sus tallas se puede vender. Reactivarla las reactiva.
    if (datos.activo !== undefined) {
      await tx.inventoryItem.updateMany({
        where: { id: { in: prenda.variantes.map((variante) => variante.itemId) } },
        data: { activo: datos.activo },
      });

      await auditar(tx, {
        usuarioId,
        accion: datos.activo ? 'prenda.reactivar' : 'prenda.desactivar',
        entidad: 'Prenda',
        entidadId: id,
        detalle: { nombre: prenda.nombre, tallasAfectadas: prenda.variantes.length },
      });
    }
  });

  return obtenerPrenda(id);
}

export async function desactivarPrenda(id: string, usuarioId: string) {
  return actualizarPrenda(id, { activo: false }, usuarioId);
}

export async function crearVariante(prendaId: string, datos: VarianteNueva) {
  const prenda = await prisma.prenda.findUnique({
    where: { id: prendaId },
    include: { categoria: true },
  });
  if (!prenda) throw new NotFound('La prenda no existe');

  await prisma.$transaction((tx) =>
    crearVarianteEnTx(
      tx,
      {
        prendaId: prenda.id,
        nombrePrenda: prenda.nombre,
        tipoTalla: prenda.tipoTalla,
        codigoCategoria: prenda.categoria.codigo,
      },
      datos,
    ),
  );

  return obtenerPrenda(prendaId);
}

export async function actualizarVariante(
  varianteId: string,
  datos: ActualizarVarianteBody,
  usuarioId: string,
) {
  const variante = await prisma.uniformeVariante.findUnique({
    where: { id: varianteId },
    include: { item: true },
  });
  if (!variante) throw new NotFound('La talla no existe');

  await prisma.$transaction(async (tx) => {
    // Cambiar el precio no altera ninguna venta pasada (las lineas de venta
    // guardan su propio snapshot), pero si queda registrado quien lo cambio.
    if (
      datos.precioCentavos !== undefined &&
      datos.precioCentavos !== variante.item.precioCentavos
    ) {
      await tx.historialPrecio.create({
        data: {
          itemId: variante.itemId,
          precioAnterior: variante.item.precioCentavos,
          precioNuevo: datos.precioCentavos,
          usuarioId,
        },
      });

      await auditar(tx, {
        usuarioId,
        accion: 'item.precio.cambiar',
        entidad: 'InventoryItem',
        entidadId: variante.itemId,
        detalle: {
          sku: variante.item.sku,
          antes: variante.item.precioCentavos,
          despues: datos.precioCentavos,
        },
      });
    }

    await tx.inventoryItem.update({
      where: { id: variante.itemId },
      data: {
        precioCentavos: datos.precioCentavos,
        costoCentavos: datos.costoCentavos,
        stockMinimo: datos.stockMinimo,
        activo: datos.activo,
      },
    });
  });

  return obtenerPrenda(variante.prendaId);
}

/**
 * Las tallas no se borran si ya tienen movimientos: eso borraria historia
 * contable. Se desactivan.
 */
export async function eliminarVariante(varianteId: string) {
  const variante = await prisma.uniformeVariante.findUnique({
    where: { id: varianteId },
    include: { item: { include: { _count: { select: { movimientos: true, lineasVenta: true } } } } },
  });
  if (!variante) throw new NotFound('La talla no existe');

  const { movimientos, lineasVenta } = variante.item._count;
  if (movimientos > 0 || lineasVenta > 0) {
    throw new Conflict(
      'RESTRICCION_BD',
      'Esta talla ya tiene movimientos o ventas: se desactiva, no se borra',
      { movimientos, lineasVenta },
    );
  }

  await prisma.$transaction([
    prisma.uniformeVariante.delete({ where: { id: varianteId } }),
    prisma.inventoryItem.delete({ where: { id: variante.itemId } }),
  ]);

  return obtenerPrenda(variante.prendaId);
}
