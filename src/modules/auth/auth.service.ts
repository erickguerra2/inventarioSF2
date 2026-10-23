import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { DemasiadosIntentos, NoAutenticado } from '../../shared/errors.js';
import type { UsuarioSesion } from '../../shared/middleware/auth.js';
import { prisma } from '../../shared/prisma.js';
import type { LoginBody } from './auth.schemas.js';

export const HORAS_DE_SESION = 12;

/** Cada cuantos minutos se refresca la sesion en la base, para no escribir en cada peticion. */
const MINUTOS_ENTRE_RENOVACIONES = 5;

const MAX_INTENTOS_FALLIDOS = 5;
const MINUTOS_DE_BLOQUEO = 15;

/**
 * En la base se guarda el sha256 del token, nunca el token. Si la base se filtra,
 * nadie puede resumir una sesion con lo que hay ahi.
 */
function huella(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function nuevaExpiracion(): Date {
  return new Date(Date.now() + HORAS_DE_SESION * 60 * 60 * 1000);
}

// ===========================================================================
// Bloqueo por intentos fallidos
//
// Se cuentan los intentos FALLIDOS, no todas las peticiones: el ataque es
// adivinar contrasenas, y contar los exitos solo castiga a quien si se acuerda
// de la suya. La clave es IP + usuario, no solo IP, porque todo el colegio sale
// por la misma IP publica: si fuera por IP, una maestra equivocandose dejaria
// afuera a las demas.
//
// Vive en memoria: con un solo proceso de Node alcanza, y se reinicia si el
// servicio se reinicia.
// ===========================================================================
const intentos = new Map<string, { fallidos: number; bloqueadoHasta: number }>();

function claveDeIntentos(ip: string, usuario: string): string {
  return `${ip}|${usuario.toLowerCase()}`;
}

function revisarBloqueo(clave: string) {
  const registro = intentos.get(clave);
  if (!registro) return;
  if (registro.bloqueadoHasta > Date.now()) {
    throw new DemasiadosIntentos((registro.bloqueadoHasta - Date.now()) / 1000);
  }
  if (registro.bloqueadoHasta !== 0 && registro.bloqueadoHasta <= Date.now()) {
    intentos.delete(clave); // paso el bloqueo: borron y cuenta nueva
  }
}

function anotarFallo(clave: string) {
  const registro = intentos.get(clave) ?? { fallidos: 0, bloqueadoHasta: 0 };
  registro.fallidos += 1;
  if (registro.fallidos >= MAX_INTENTOS_FALLIDOS) {
    registro.bloqueadoHasta = Date.now() + MINUTOS_DE_BLOQUEO * 60 * 1000;
  }
  intentos.set(clave, registro);
}

/** Solo para las pruebas: deja el contador de intentos en blanco. */
export function reiniciarIntentos() {
  intentos.clear();
}

// ===========================================================================
// Login / logout
// ===========================================================================

/**
 * Hash de mentira para comparar cuando el usuario NO existe. Asi el login tarda
 * lo mismo exista o no la cuenta: si no, el tiempo de respuesta delata cuales
 * usuarios son validos.
 */
let hashSenuelo: string | null = null;
async function obtenerHashSenuelo(): Promise<string> {
  hashSenuelo ??= await hash(randomBytes(16).toString('hex'));
  return hashSenuelo;
}

function presentar(usuario: {
  id: string;
  usuario: string;
  nombre: string;
  rol: UsuarioSesion['rol'];
}): UsuarioSesion {
  return {
    id: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
  };
}

export async function iniciarSesion(
  credenciales: LoginBody,
  contexto: { ip: string; userAgent?: string },
): Promise<{ token: string; usuario: UsuarioSesion }> {
  const clave = claveDeIntentos(contexto.ip, credenciales.usuario);
  revisarBloqueo(clave);

  const usuario = await prisma.usuario.findUnique({
    where: { usuario: credenciales.usuario },
  });

  const hashAComparar = usuario?.passwordHash ?? (await obtenerHashSenuelo());
  const correcta = await verify(hashAComparar, credenciales.password).catch(() => false);

  // Un solo mensaje para los tres casos (no existe / inactivo / contrasena mala):
  // decir cual fue seria confirmarle a cualquiera que una cuenta existe.
  if (!usuario || !usuario.activo || !correcta) {
    anotarFallo(clave);
    throw new NoAutenticado('Usuario o contrasena incorrectos');
  }

  intentos.delete(clave);

  const token = randomBytes(32).toString('base64url');
  await prisma.sesion.create({
    data: {
      id: huella(token),
      usuarioId: usuario.id,
      expiraEn: nuevaExpiracion(),
      ip: contexto.ip,
      userAgent: contexto.userAgent ?? null,
    },
  });

  return { token, usuario: presentar(usuario) };
}

/**
 * Resuelve el token de la cookie a un usuario. Devuelve null si la sesion no
 * existe, expiro, o el usuario fue desactivado — este ultimo caso es el que hace
 * que dar de baja a una maestra tenga efecto inmediato.
 */
export async function sesionDesdeToken(token: string): Promise<UsuarioSesion | null> {
  const sesion = await prisma.sesion.findUnique({
    where: { id: huella(token) },
    include: { usuario: true },
  });
  if (!sesion) return null;

  if (sesion.expiraEn <= new Date()) {
    await prisma.sesion.deleteMany({ where: { id: sesion.id } });
    return null;
  }

  if (!sesion.usuario.activo) {
    await prisma.sesion.deleteMany({ where: { usuarioId: sesion.usuarioId } });
    return null;
  }

  // Sesion de 12 h de INACTIVIDAD: cada uso corre la expiracion hacia adelante.
  // No se escribe en cada peticion, solo cada pocos minutos.
  const minutosDesdeUltimoUso = (Date.now() - sesion.ultimoUsoEn.getTime()) / 60_000;
  if (minutosDesdeUltimoUso >= MINUTOS_ENTRE_RENOVACIONES) {
    await prisma.sesion.update({
      where: { id: sesion.id },
      data: { ultimoUsoEn: new Date(), expiraEn: nuevaExpiracion() },
    });
  }

  return presentar(sesion.usuario);
}

export async function cerrarSesion(token: string): Promise<void> {
  await prisma.sesion.deleteMany({ where: { id: huella(token) } });
}

/** Saca a un usuario de todos los navegadores donde tenga sesion abierta. */
export async function cerrarTodasLasSesiones(usuarioId: string): Promise<number> {
  const { count } = await prisma.sesion.deleteMany({ where: { usuarioId } });
  return count;
}

/** Para una tarea diaria: las sesiones vencidas no sirven de nada en la tabla. */
export async function limpiarSesionesExpiradas(): Promise<number> {
  const { count } = await prisma.sesion.deleteMany({
    where: { expiraEn: { lt: new Date() } },
  });
  return count;
}

export async function hashDePassword(password: string): Promise<string> {
  return hash(password);
}
