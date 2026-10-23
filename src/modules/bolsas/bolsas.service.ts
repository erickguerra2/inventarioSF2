import { Prisma } from '@prisma/client';
import { auditar } from '../../shared/auditoria.js';
import { Conflict, NotFound } from '../../shared/errors.js';
import { prisma } from '../../shared/prisma.js';
import { skuBolsa } from '../../shared/sku.js';
import type {
  ActualizarBolsaBody,
  CrearBolsaBody,
  LineaContenido,
} from './bolsas.schemas.js';

const incluirBolsa = {
  item: true,
  grado: { include: { nivel: true } },
  ciclo: true,
  contenido: { orderBy: { orden: 'asc' } },
} satisfies Prisma.BolsaUtilesInclude;

type BolsaConDetalle = Prisma.BolsaUtilesGetPayload<{ include: typeof incluirBolsa }>;

function presentarBolsa(bolsa: BolsaConDetalle) {
  const { item } = bolsa;
  return {
    id: bolsa.id,
    nombre: bolsa.nombre,
    notas: bolsa.notas,
    version: bolsa.version,
    // La bolsa COMPLETA es la unidad de inventario: "tenemos 25 bolsas de 4to".
    itemId: item.id,
    sku: item.sku,
    precioCentavos: item.precioCentavos,
    costoCentavos: item.costoCentavos,
    stockActual: item.stockActual,
    stockMinimo: item.stockMinimo,
    activo: item.activo,
    disponible: item.activo && item.stockActual > 0,
    bajoStock: item.stockActual <= item.stockMinimo,
    grado: {
      id: bolsa.grado.id,
      nombre: bolsa.grado.nombre,
      nivel: { id: bolsa.grado.nivel.id, nombre: bolsa.grado.nivel.nombre },
    },
    ciclo: { id: bolsa.ciclo.id, anio: bolsa.ciclo.anio, activo: bolsa.ciclo.activo },
    // Informativo: la lista que se imprime. No afecta existencias ni precio, y
    // puede venir vacia sin que nada se rompa.
    contenido: bolsa.contenido.map((linea) => ({
      id: linea.id,
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      unidad: linea.unidad,
      orden: linea.orden,
    })),
    totalLineasContenido: bolsa.contenido.length,
  };
}

/**
 * Un ciclo se considera cerrado cuando ya paso: no es el activo y su anio es
 * menor al del ciclo en curso. Los ciclos futuros si se pueden editar, porque es
 * justo cuando se prepara el catalogo del ano siguiente.
 */
async function asegurarCicloEditable(ciclo: { id: string; anio: number; activo: boolean }) {
  if (ciclo.activo) return;

  const enCurso = await prisma.cicloEscolar.findFirst({ where: { activo: true } });
  if (!enCurso) return; // todavia no se ha definido cual es el ciclo en curso
  if (ciclo.anio > enCurso.anio) return; // ciclo futuro: se esta preparando

  throw new Conflict(
    'CICLO_CERRADO',
    `El ciclo ${ciclo.anio} ya cerro. Para cambiar la lista, duplique la bolsa en el ciclo vigente.`,
    { cicloId: ciclo.id, anio: ciclo.anio, cicloEnCurso: enCurso.anio },
  );
}

function nombrePorDefecto(nombreGrado: string, anio: number, version: number) {
  const base = `Bolsa de útiles - ${nombreGrado} - ${anio}`;
  return version > 1 ? `${base} (v${version})` : base;
}

function lineasParaCrear(contenido: LineaContenido[] | undefined) {
  return (contenido ?? []).map((linea, indice) => ({
    descripcion: linea.descripcion,
    cantidad: linea.cantidad,
    unidad: linea.unidad ?? null,
    orden: indice,
  }));
}

export async function listarBolsas(filtros: {
  ciclo?: number;
  cicloId?: string;
  gradoId?: string;
  nivelId?: string;
  incluirInactivas?: boolean;
}) {
  const where: Prisma.BolsaUtilesWhereInput = {};
  if (filtros.cicloId) where.cicloId = filtros.cicloId;
  if (filtros.ciclo !== undefined) where.ciclo = { anio: filtros.ciclo };
  if (filtros.gradoId) where.gradoId = filtros.gradoId;
  if (filtros.nivelId) where.grado = { nivelId: filtros.nivelId };
  if (!filtros.incluirInactivas) where.item = { activo: true };

  const bolsas = await prisma.bolsaUtiles.findMany({
    where,
    include: incluirBolsa,
    orderBy: [
      { ciclo: { anio: 'desc' } },
      { grado: { nivel: { orden: 'asc' } } },
      { grado: { orden: 'asc' } },
      { version: 'desc' },
    ],
  });

  return bolsas.map(presentarBolsa);
}

export async function obtenerBolsa(id: string) {
  const bolsa = await prisma.bolsaUtiles.findUnique({ where: { id }, include: incluirBolsa });
  if (!bolsa) throw new NotFound('La bolsa de útiles no existe');
  return presentarBolsa(bolsa);
}

export async function crearBolsa(datos: CrearBolsaBody) {
  const grado = await prisma.grado.findUnique({ where: { id: datos.gradoId } });
  if (!grado) throw new NotFound('El grado no existe');

  const ciclo = await prisma.cicloEscolar.findUnique({ where: { id: datos.cicloId } });
  if (!ciclo) throw new NotFound('El ciclo escolar no existe');
  await asegurarCicloEditable(ciclo);

  const existente = await prisma.bolsaUtiles.findFirst({
    where: { gradoId: grado.id, cicloId: ciclo.id },
    orderBy: { version: 'desc' },
  });
  if (existente) {
    throw new Conflict(
      'RECURSO_DUPLICADO',
      `Ya existe una bolsa de ${grado.nombre} para el ciclo ${ciclo.anio}. Para cambiar la lista use PUT /bolsas/:id/contenido; para crear otra version o pasarla a otro ciclo, POST /bolsas/:id/duplicar.`,
      { bolsaId: existente.id, version: existente.version },
    );
  }

  const nombre = datos.nombre ?? nombrePorDefecto(grado.nombre, ciclo.anio, 1);

  const bolsaId = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        tipo: 'BOLSA_UTILES',
        sku: skuBolsa(grado.nombre, ciclo.anio, 1),
        nombre,
        // El precio y el costo son de la bolsa COMPLETA: un numero que se teclea,
        // no la suma de 30 utiles.
        precioCentavos: datos.precioCentavos,
        costoCentavos: datos.costoCentavos ?? null,
        stockMinimo: datos.stockMinimo ?? 0,
      },
    });

    const bolsa = await tx.bolsaUtiles.create({
      data: {
        gradoId: grado.id,
        cicloId: ciclo.id,
        version: 1,
        nombre,
        notas: datos.notas ?? null,
        itemId: item.id,
        contenido: { create: lineasParaCrear(datos.contenido) },
      },
    });

    return bolsa.id;
  });

  return obtenerBolsa(bolsaId);
}

export async function actualizarBolsa(
  id: string,
  datos: ActualizarBolsaBody,
  usuarioId: string,
) {
  const bolsa = await prisma.bolsaUtiles.findUnique({ where: { id }, include: { item: true } });
  if (!bolsa) throw new NotFound('La bolsa de útiles no existe');

  await prisma.$transaction(async (tx) => {
    if (datos.precioCentavos !== undefined && datos.precioCentavos !== bolsa.item.precioCentavos) {
      await tx.historialPrecio.create({
        data: {
          itemId: bolsa.itemId,
          precioAnterior: bolsa.item.precioCentavos,
          precioNuevo: datos.precioCentavos,
          usuarioId,
        },
      });

      await auditar(tx, {
        usuarioId,
        accion: 'item.precio.cambiar',
        entidad: 'InventoryItem',
        entidadId: bolsa.itemId,
        detalle: {
          sku: bolsa.item.sku,
          antes: bolsa.item.precioCentavos,
          despues: datos.precioCentavos,
        },
      });
    }

    if (datos.activo !== undefined && datos.activo !== bolsa.item.activo) {
      await auditar(tx, {
        usuarioId,
        accion: datos.activo ? 'bolsa.reactivar' : 'bolsa.desactivar',
        entidad: 'BolsaUtiles',
        entidadId: id,
        detalle: { nombre: bolsa.nombre, sku: bolsa.item.sku },
      });
    }

    if (datos.nombre !== undefined || datos.notas !== undefined) {
      await tx.bolsaUtiles.update({
        where: { id },
        data: { nombre: datos.nombre, notas: datos.notas },
      });
    }

    await tx.inventoryItem.update({
      where: { id: bolsa.itemId },
      data: {
        nombre: datos.nombre,
        precioCentavos: datos.precioCentavos,
        costoCentavos: datos.costoCentavos,
        stockMinimo: datos.stockMinimo,
        activo: datos.activo,
        // stockActual no se toca aqui: las existencias solo se mueven con un
        // movimiento de inventario.
      },
    });
  });

  return obtenerBolsa(id);
}

/**
 * Reemplazo completo de la lista. Editar el contenido NO cambia el stock ni el
 * precio: son cosas distintas, y mezclarlas es como se descuadra un inventario.
 */
export async function reemplazarContenido(id: string, contenido: LineaContenido[]) {
  const bolsa = await prisma.bolsaUtiles.findUnique({ where: { id }, include: { ciclo: true } });
  if (!bolsa) throw new NotFound('La bolsa de útiles no existe');
  await asegurarCicloEditable(bolsa.ciclo);

  await prisma.$transaction(async (tx) => {
    await tx.bolsaItem.deleteMany({ where: { bolsaId: id } });
    const lineas = lineasParaCrear(contenido);
    if (lineas.length > 0) {
      await tx.bolsaItem.createMany({
        data: lineas.map((linea) => ({ ...linea, bolsaId: id })),
      });
    }
  });

  return obtenerBolsa(id);
}

/**
 * Clona la bolsa y su contenido hacia otro ciclo, con stock en 0: es como se arma
 * el catalogo cada ano sin volver a teclear todo. Duplicar dentro del MISMO ciclo
 * crea la version siguiente de la lista.
 */
export async function duplicarBolsa(id: string, cicloDestinoId: string) {
  const origen = await prisma.bolsaUtiles.findUnique({
    where: { id },
    include: { item: true, grado: true, contenido: { orderBy: { orden: 'asc' } } },
  });
  if (!origen) throw new NotFound('La bolsa de útiles no existe');

  const destino = await prisma.cicloEscolar.findUnique({ where: { id: cicloDestinoId } });
  if (!destino) throw new NotFound('El ciclo escolar de destino no existe');
  await asegurarCicloEditable(destino);

  const ultima = await prisma.bolsaUtiles.findFirst({
    where: { gradoId: origen.gradoId, cicloId: destino.id },
    orderBy: { version: 'desc' },
  });
  const version = ultima ? ultima.version + 1 : 1;
  const nombre = nombrePorDefecto(origen.grado.nombre, destino.anio, version);

  const nuevaId = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        tipo: 'BOLSA_UTILES',
        sku: skuBolsa(origen.grado.nombre, destino.anio, version),
        nombre,
        precioCentavos: origen.item.precioCentavos,
        costoCentavos: origen.item.costoCentavos,
        stockMinimo: origen.item.stockMinimo,
        // stockActual = 0: la bolsa nueva todavia no se ha armado.
      },
    });

    const bolsa = await tx.bolsaUtiles.create({
      data: {
        gradoId: origen.gradoId,
        cicloId: destino.id,
        version,
        nombre,
        notas: origen.notas,
        itemId: item.id,
        contenido: {
          create: origen.contenido.map((linea) => ({
            descripcion: linea.descripcion,
            cantidad: linea.cantidad,
            unidad: linea.unidad,
            orden: linea.orden,
          })),
        },
      },
    });

    return bolsa.id;
  });

  return obtenerBolsa(nuevaId);
}

/** Vista para imprimir y entregarle la lista al papá. */
export async function listaParaImprimir(id: string) {
  const bolsa = await obtenerBolsa(id);
  return {
    titulo: bolsa.nombre,
    grado: bolsa.grado.nombre,
    nivel: bolsa.grado.nivel.nombre,
    ciclo: bolsa.ciclo.anio,
    precioCentavos: bolsa.precioCentavos,
    notas: bolsa.notas,
    items: bolsa.contenido.map((linea) => ({
      cantidad: linea.cantidad,
      unidad: linea.unidad,
      descripcion: linea.descripcion,
    })),
    totalLineas: bolsa.totalLineasContenido,
    generadoEn: new Date().toISOString(),
  };
}

export async function desactivarBolsa(id: string, usuarioId: string) {
  return actualizarBolsa(id, { activo: false }, usuarioId);
}
