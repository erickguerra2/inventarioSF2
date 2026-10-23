import { z } from 'zod';
import { NotFound } from '../../shared/errors.js';
import { prisma } from '../../shared/prisma.js';
import type {
  crearCicloBodySchema,
  crearGradoBodySchema,
  crearNivelBodySchema,
} from './escolar.schemas.js';

export async function listarNiveles() {
  return prisma.nivel.findMany({
    orderBy: { orden: 'asc' },
    include: { grados: { orderBy: { orden: 'asc' } } },
  });
}

export async function crearNivel(datos: z.infer<typeof crearNivelBodySchema>) {
  return prisma.nivel.create({ data: datos });
}

export async function listarGrados(filtros: { nivelId?: string }) {
  return prisma.grado.findMany({
    where: filtros.nivelId ? { nivelId: filtros.nivelId } : {},
    orderBy: [{ nivel: { orden: 'asc' } }, { orden: 'asc' }],
    include: { nivel: { select: { id: true, nombre: true } } },
  });
}

export async function crearGrado(datos: z.infer<typeof crearGradoBodySchema>) {
  const nivel = await prisma.nivel.findUnique({ where: { id: datos.nivelId } });
  if (!nivel) throw new NotFound('El nivel no existe');
  return prisma.grado.create({ data: datos });
}

export async function listarCiclos() {
  return prisma.cicloEscolar.findMany({ orderBy: { anio: 'desc' } });
}

export async function cicloActivo() {
  return prisma.cicloEscolar.findFirst({ where: { activo: true } });
}

export async function crearCiclo(datos: z.infer<typeof crearCicloBodySchema>) {
  if (datos.activo) {
    return activarCicloNuevo(datos.anio);
  }
  return prisma.cicloEscolar.create({ data: { anio: datos.anio, activo: false } });
}

async function activarCicloNuevo(anio: number) {
  return prisma.$transaction(async (tx) => {
    await tx.cicloEscolar.updateMany({ where: { activo: true }, data: { activo: false } });
    return tx.cicloEscolar.create({ data: { anio, activo: true } });
  });
}

/**
 * Solo un ciclo activo a la vez: activar uno desactiva el anterior en la misma
 * transaccion, para que no exista un instante con dos ciclos activos.
 */
export async function activarCiclo(id: string) {
  const ciclo = await prisma.cicloEscolar.findUnique({ where: { id } });
  if (!ciclo) throw new NotFound('El ciclo escolar no existe');

  return prisma.$transaction(async (tx) => {
    await tx.cicloEscolar.updateMany({
      where: { activo: true, NOT: { id } },
      data: { activo: false },
    });
    return tx.cicloEscolar.update({ where: { id }, data: { activo: true } });
  });
}
