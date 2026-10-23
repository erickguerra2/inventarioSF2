/**
 * Fase 3: sesiones y permisos.
 *
 * La prueba que mas importa aqui es la matriz: que una maestra NO pueda hacer
 * nada mas que vender. El permiso se niega en el backend; esconder botones en
 * React no es un permiso.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { reiniciarIntentos } from '../../src/modules/auth/auth.service.js';
import { prisma } from '../../src/shared/prisma.js';
import {
  clienteConSesion,
  comoAdmin,
  iniciarSesion,
  type ClienteApi,
} from '../helpers/auth.js';

let app: FastifyInstance;
let admin: ClienteApi;
let adminId: string;

// Usuario de prueba propio, para no tocar las cuentas del seed.
const USUARIO_PRUEBA = 'zz.prueba';
const PASSWORD_PRUEBA = 'prueba-fase-3';
let usuarioPruebaId: string;
let itemPrecioId: string;

beforeAll(async () => {
  app = await construirApp();
  await app.ready();

  admin = await comoAdmin(app);
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'admin' } })).id;

  // Si quedo de una corrida anterior interrumpida, se limpia primero.
  await prisma.usuario.deleteMany({ where: { usuario: USUARIO_PRUEBA } });

  const creado = await admin.post('/api/v1/usuarios', {
    usuario: USUARIO_PRUEBA,
    nombre: 'Maestra de Prueba',
    rol: 'VENDEDOR',
    password: PASSWORD_PRUEBA,
  });
  expect(creado.statusCode).toBe(201);
  usuarioPruebaId = creado.json().data.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { entidadId: { in: [usuarioPruebaId, itemPrecioId].filter(Boolean) } },
  });
  if (itemPrecioId) {
    await prisma.historialPrecio.deleteMany({ where: { itemId: itemPrecioId } });
  }
  await prisma.usuario.deleteMany({ where: { id: usuarioPruebaId } });
  reiniciarIntentos();

  await app.close();
  await prisma.$disconnect();
});

describe('login', () => {
  it('sin sesion no se ve nada del sistema', async () => {
    const catalogo = await app.inject({ method: 'GET', url: '/api/v1/uniformes/prendas' });
    expect(catalogo.statusCode).toBe(401);
    expect(catalogo.json().error.code).toBe('NO_AUTENTICADO');

    const inventario = await app.inject({ method: 'GET', url: '/api/v1/inventario' });
    expect(inventario.statusCode).toBe(401);
  });

  it('no revela si el usuario existe: la contrasena mala y el usuario inexistente dan lo mismo', async () => {
    const passwordMala = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { usuario: USUARIO_PRUEBA, password: 'esta-no-es' },
    });
    const usuarioInventado = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { usuario: 'zz.no.existe', password: 'cualquiera' },
    });

    expect(passwordMala.statusCode).toBe(401);
    expect(usuarioInventado.statusCode).toBe(401);
    expect(passwordMala.json()).toEqual(usuarioInventado.json());
  });

  it('entrega una cookie httpOnly que el JavaScript de la pagina no puede leer', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { usuario: USUARIO_PRUEBA, password: PASSWORD_PRUEBA },
    });

    expect(respuesta.statusCode).toBe(200);
    const cabecera = String(respuesta.headers['set-cookie']);

    expect(cabecera).toMatch(/^sid=/);
    expect(cabecera).toContain('HttpOnly');
    expect(cabecera).toContain('SameSite=Lax');
    // El cuerpo trae el usuario, nunca el hash de la contrasena.
    expect(respuesta.json().data.usuario.passwordHash).toBeUndefined();
    expect(respuesta.json().data.usuario.rol).toBe('VENDEDOR');
  });

  it('/auth/me dice quien es, y es lo unico que el frontend necesita al cargar', async () => {
    const respuesta = await admin.get('/api/v1/auth/me');
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json().data.usuario.usuario).toBe('admin');
    expect(respuesta.json().data.usuario.rol).toBe('ADMIN');
  });

  it('bloquea despues de 5 intentos fallidos sobre el mismo usuario', async () => {
    reiniciarIntentos();

    for (let intento = 1; intento <= 5; intento += 1) {
      const fallo = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { usuario: 'zz.bloqueo', password: 'mala' },
      });
      expect(fallo.statusCode).toBe(401);
    }

    const bloqueado = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { usuario: 'zz.bloqueo', password: 'mala' },
    });
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().error.code).toBe('DEMASIADOS_INTENTOS');

    // El bloqueo es por IP + usuario: las demas cuentas siguen pudiendo entrar.
    // Si fuera solo por IP, una maestra equivocandose dejaria afuera al colegio.
    const otra = await iniciarSesion(app, USUARIO_PRUEBA, PASSWORD_PRUEBA);
    expect(otra.usuario.usuario).toBe(USUARIO_PRUEBA);

    reiniciarIntentos();
  });
});

describe('lo que una maestra puede y no puede hacer', () => {
  let maestra: ClienteApi;

  beforeAll(async () => {
    const { cookie } = await iniciarSesion(app, USUARIO_PRUEBA, PASSWORD_PRUEBA);
    maestra = clienteConSesion(app, cookie);
  });

  it('puede ver el catalogo, que es lo que necesita para vender', async () => {
    const prendas = await maestra.get('/api/v1/uniformes/prendas');
    expect(prendas.statusCode).toBe(200);
    expect(prendas.json().data.length).toBeGreaterThan(0);

    const bolsas = await maestra.get('/api/v1/bolsas?ciclo=2026');
    expect(bolsas.statusCode).toBe(200);

    const grados = await maestra.get('/api/v1/grados');
    expect(grados.statusCode).toBe(200);
  });

  it('no puede ver el inventario, el kardex ni la integridad', async () => {
    for (const url of ['/api/v1/inventario', '/api/v1/inventario/alertas', '/api/v1/admin/verificar-integridad']) {
      const respuesta = await maestra.get(url);
      expect(respuesta.statusCode).toBe(403);
      expect(respuesta.json().error.code).toBe('SIN_PERMISO');
    }
  });

  it('no puede ingresar existencias ni ajustar', async () => {
    const entrada = await maestra.post('/api/v1/inventario/entradas', {
      motivo: 'No deberia poder',
      lineas: [{ itemId: 'cualquiera', cantidad: 1 }],
    });
    expect(entrada.statusCode).toBe(403);

    const conteo = await maestra.post('/api/v1/inventario/conteos', {
      lineas: [{ itemId: 'cualquiera', contado: 1 }],
    });
    expect(conteo.statusCode).toBe(403);
  });

  it('no puede cambiar precios ni el catalogo', async () => {
    const variante = await prisma.uniformeVariante.findFirstOrThrow();

    const precio = await maestra.patch(`/api/v1/uniformes/variantes/${variante.id}`, {
      precioCentavos: 1,
    });
    expect(precio.statusCode).toBe(403);

    const prenda = await maestra.post('/api/v1/uniformes/prendas', {
      categoriaId: 'x',
      nombre: 'No deberia',
      tipoTalla: 'LETRA',
    });
    expect(prenda.statusCode).toBe(403);

    const bolsa = await maestra.delete(`/api/v1/bolsas/${'inventado'}`);
    expect(bolsa.statusCode).toBe(403);
  });

  it('no puede administrar usuarios', async () => {
    const lista = await maestra.get('/api/v1/usuarios');
    expect(lista.statusCode).toBe(403);

    const alta = await maestra.post('/api/v1/usuarios', {
      usuario: 'zz.colada',
      nombre: 'No deberia',
      rol: 'ADMIN',
      password: 'password-largo',
    });
    expect(alta.statusCode).toBe(403);
  });

  it('el 403 llega antes que la validacion: no filtra si los datos eran validos', async () => {
    // Importa el orden: si validara primero, un 400 le diria a la maestra que el
    // cuerpo estaba bien formado para una operacion que no le corresponde.
    const respuesta = await maestra.post('/api/v1/inventario/entradas', { basura: true });
    expect(respuesta.statusCode).toBe(403);
  });
});

describe('cerrar sesion y dar de baja', () => {
  it('el logout deja la cookie inservible al instante', async () => {
    const { cookie } = await iniciarSesion(app, USUARIO_PRUEBA, PASSWORD_PRUEBA);
    const sesion = clienteConSesion(app, cookie);

    expect((await sesion.get('/api/v1/auth/me')).statusCode).toBe(200);

    const salida = await sesion.post('/api/v1/auth/logout');
    expect(salida.statusCode).toBe(200);

    // La misma cookie ya no sirve: la fila se borro en la base.
    expect((await sesion.get('/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('desactivar a una maestra la saca de inmediato, sin esperar que expire la cookie', async () => {
    const { cookie } = await iniciarSesion(app, USUARIO_PRUEBA, PASSWORD_PRUEBA);
    const sesion = clienteConSesion(app, cookie);
    expect((await sesion.get('/api/v1/auth/me')).statusCode).toBe(200);

    const baja = await admin.patch(`/api/v1/usuarios/${usuarioPruebaId}`, { activo: false });
    expect(baja.statusCode).toBe(200);
    expect(baja.json().data.activo).toBe(false);

    expect((await sesion.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect(await prisma.sesion.count({ where: { usuarioId: usuarioPruebaId } })).toBe(0);

    // Y tampoco puede volver a entrar.
    const reintento = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { usuario: USUARIO_PRUEBA, password: PASSWORD_PRUEBA },
    });
    expect(reintento.statusCode).toBe(401);

    // Se reactiva para las pruebas siguientes.
    await admin.patch(`/api/v1/usuarios/${usuarioPruebaId}`, { activo: true });
  });

  it('cambiar la contrasena cierra las sesiones de ese usuario', async () => {
    const { cookie } = await iniciarSesion(app, USUARIO_PRUEBA, PASSWORD_PRUEBA);
    const sesion = clienteConSesion(app, cookie);
    expect((await sesion.get('/api/v1/auth/me')).statusCode).toBe(200);

    const reseteo = await admin.post(`/api/v1/usuarios/${usuarioPruebaId}/password`, {
      password: 'otra-password-larga',
    });
    expect(reseteo.statusCode).toBe(200);
    expect(reseteo.json().data.sesionesCerradas).toBeGreaterThan(0);

    expect((await sesion.get('/api/v1/auth/me')).statusCode).toBe(401);

    // La nueva contrasena si entra.
    const nueva = await iniciarSesion(app, USUARIO_PRUEBA, 'otra-password-larga');
    expect(nueva.usuario.usuario).toBe(USUARIO_PRUEBA);
  });
});

describe('guardas de administracion', () => {
  it('la administradora no puede desactivarse a si misma', async () => {
    const respuesta = await admin.patch(`/api/v1/usuarios/${adminId}`, { activo: false });
    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().error.message).toMatch(/su propio usuario/i);
  });

  it('no se puede dejar el sistema sin ninguna administradora activa', async () => {
    const otrosAdmins = await prisma.usuario.count({
      where: { rol: 'ADMIN', activo: true, NOT: { id: adminId } },
    });

    const respuesta = await admin.patch(`/api/v1/usuarios/${adminId}`, { rol: 'VENDEDOR' });

    if (otrosAdmins === 0) {
      expect(respuesta.statusCode).toBe(409);
      expect(respuesta.json().error.message).toMatch(/administradora activa/i);
    } else {
      // Si hay otra admin, el cambio es legitimo: se deja como estaba.
      expect(respuesta.statusCode).toBe(200);
      await admin.patch(`/api/v1/usuarios/${adminId}`, { rol: 'ADMIN' });
    }
  });

  it('el usuario (login) no se puede repetir', async () => {
    const respuesta = await admin.post('/api/v1/usuarios', {
      usuario: USUARIO_PRUEBA,
      nombre: 'Otra con el mismo usuario',
      rol: 'VENDEDOR',
      password: 'password-larga-1',
    });

    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().error.code).toBe('RECURSO_DUPLICADO');
  });

  it('la lista de usuarios nunca devuelve el hash de la contrasena', async () => {
    const respuesta = await admin.get('/api/v1/usuarios?incluirInactivos=true');
    expect(respuesta.statusCode).toBe(200);

    for (const usuario of respuesta.json().data) {
      expect(usuario.passwordHash).toBeUndefined();
      expect(Object.keys(usuario).sort()).toEqual([
        'activo',
        'creadoEn',
        'email',
        'id',
        'nombre',
        'rol',
        'usuario',
      ]);
    }
  });
});

describe('bitacora de lo sensible', () => {
  it('un cambio de precio queda firmado por quien lo hizo', async () => {
    const variante = await prisma.uniformeVariante.findFirstOrThrow({ include: { item: true } });
    itemPrecioId = variante.itemId;
    const precioOriginal = variante.item.precioCentavos;

    const cambio = await admin.patch(`/api/v1/uniformes/variantes/${variante.id}`, {
      precioCentavos: precioOriginal + 100,
    });
    expect(cambio.statusCode).toBe(200);

    const bitacora = await prisma.auditLog.findFirst({
      where: { entidadId: itemPrecioId, accion: 'item.precio.cambiar' },
      orderBy: { creadoEn: 'desc' },
    });
    expect(bitacora).not.toBeNull();
    expect(bitacora?.usuarioId).toBe(adminId);
    expect(bitacora?.datos).toMatchObject({
      antes: precioOriginal,
      despues: precioOriginal + 100,
    });

    // Y el historial de precios del item tambien lo registra.
    const historial = await prisma.historialPrecio.findFirst({
      where: { itemId: itemPrecioId },
      orderBy: { creadoEn: 'desc' },
    });
    expect(historial?.precioNuevo).toBe(precioOriginal + 100);

    // Se deja el precio como estaba.
    await admin.patch(`/api/v1/uniformes/variantes/${variante.id}`, {
      precioCentavos: precioOriginal,
    });
  });

  it('el alta de un usuario queda en la bitacora', async () => {
    const bitacora = await prisma.auditLog.findFirst({
      where: { entidadId: usuarioPruebaId, accion: 'usuario.crear' },
    });
    expect(bitacora).not.toBeNull();
    expect(bitacora?.usuarioId).toBe(adminId);
  });
});
