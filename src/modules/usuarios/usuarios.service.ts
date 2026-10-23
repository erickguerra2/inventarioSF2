import type { Rol } from '@prisma/client';
import { auditar } from '../../shared/auditoria.js';
import { Conflict, NotFound } from '../../shared/errors.js';
import { prisma, type Tx } from '../../shared/prisma.js';
import { cerrarTodasLasSesiones, hashDePassword } from '../auth/auth.service.js';
import type { ActualizarUsuarioBody, CrearUsuarioBody } from './usuarios.schemas.js';

type FilaUsuario = {
  id: string;
  usuario: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
  creadoEn: Date;
};

/** El passwordHash no sale de aqui nunca. */
function presentar(usuario: FilaUsuario) {
  return {
    id: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    activo: usuario.activo,
    creadoEn: usuario.creadoEn,
  };
}

const camposPublicos = {
  id: true,
  usuario: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  creadoEn: true,
} as const;

export async function listarUsuarios(filtros: { incluirInactivos?: boolean }) {
  const usuarios = await prisma.usuario.findMany({
    where: filtros.incluirInactivos ? {} : { activo: true },
    select: camposPublicos,
    orderBy: [{ rol: 'asc' }, { nombre: 'asc' }],
  });
  return usuarios.map(presentar);
}

export async function obtenerUsuario(id: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: camposPublicos });
  if (!usuario) throw new NotFound('El usuario no existe');
  return presentar(usuario);
}

/**
 * Nunca puede quedar el sistema sin administradora activa: seria imposible
 * volver a entrar a administrar nada.
 */
async function asegurarQueQuedaAlgunAdmin(tx: Tx, excluyendoId: string) {
  const otrosAdmins = await tx.usuario.count({
    where: { rol: 'ADMIN', activo: true, NOT: { id: excluyendoId } },
  });
  if (otrosAdmins === 0) {
    throw new Conflict(
      'RESTRICCION_BD',
      'Tiene que quedar al menos una administradora activa en el sistema',
    );
  }
}

export async function crearUsuario(datos: CrearUsuarioBody, actorId: string) {
  const passwordHash = await hashDePassword(datos.password);

  const creado = await prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        usuario: datos.usuario,
        nombre: datos.nombre,
        email: datos.email ?? null,
        rol: datos.rol,
        passwordHash,
      },
      select: camposPublicos,
    });

    await auditar(tx, {
      usuarioId: actorId,
      accion: 'usuario.crear',
      entidad: 'Usuario',
      entidadId: usuario.id,
      detalle: { usuario: usuario.usuario, rol: usuario.rol },
    });

    return usuario;
  });

  return presentar(creado);
}

export async function actualizarUsuario(
  id: string,
  datos: ActualizarUsuarioBody,
  actorId: string,
) {
  const actual = await prisma.usuario.findUnique({ where: { id } });
  if (!actual) throw new NotFound('El usuario no existe');

  // Desactivarse a si misma dejaria a la administradora fuera de su propio sistema.
  if (datos.activo === false && id === actorId) {
    throw new Conflict('RESTRICCION_BD', 'No puede desactivar su propio usuario');
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    const dejaDeSerAdminActiva =
      actual.rol === 'ADMIN' &&
      ((datos.rol !== undefined && datos.rol !== 'ADMIN') || datos.activo === false);
    if (dejaDeSerAdminActiva) {
      await asegurarQueQuedaAlgunAdmin(tx, id);
    }

    const usuario = await tx.usuario.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        email: datos.email,
        rol: datos.rol,
        activo: datos.activo,
      },
      select: camposPublicos,
    });

    // Dar de baja a una maestra la saca YA: si no se borran sus sesiones, sigue
    // dentro hasta que la cookie expire.
    if (datos.activo === false) {
      await tx.sesion.deleteMany({ where: { usuarioId: id } });
    }

    await auditar(tx, {
      usuarioId: actorId,
      accion: datos.activo === false ? 'usuario.desactivar' : 'usuario.actualizar',
      entidad: 'Usuario',
      entidadId: id,
      detalle: {
        antes: { nombre: actual.nombre, rol: actual.rol, activo: actual.activo },
        despues: { nombre: usuario.nombre, rol: usuario.rol, activo: usuario.activo },
      },
    });

    return usuario;
  });

  return presentar(actualizado);
}

/**
 * Reseteo por la administradora (no hay correo de recuperacion: no todas las
 * maestras tienen email). Cambiar la contrasena cierra todas las sesiones de ese
 * usuario, que es lo que se espera cuando se resetea porque algo paso.
 */
export async function cambiarPassword(id: string, password: string, actorId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw new NotFound('El usuario no existe');

  const passwordHash = await hashDePassword(password);

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id }, data: { passwordHash } });
    await auditar(tx, {
      usuarioId: actorId,
      accion: 'usuario.password.cambiar',
      entidad: 'Usuario',
      entidadId: id,
      detalle: { usuario: usuario.usuario, porSiMismo: id === actorId },
    });
  });

  const sesionesCerradas = await cerrarTodasLasSesiones(id);
  return { ok: true, sesionesCerradas };
}
