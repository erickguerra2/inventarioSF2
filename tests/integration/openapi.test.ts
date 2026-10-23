/**
 * La especificacion OpenAPI tiene una tabla de rutas escrita a mano (los
 * esquemas si se generan de Zod). Esta prueba es lo que impide que esa tabla se
 * desincronice: compara en las DOS direcciones contra las rutas que Fastify
 * registro de verdad.
 *
 * Si alguien agrega un endpoint y no lo documenta, esto falla. Si documenta uno
 * que no existe, tambien.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/app.js';
import { construirEspecificacion, rutasDocumentadas } from '../../src/docs/openapi.js';
import { prisma } from '../../src/shared/prisma.js';

let app: FastifyInstance;

/** Camina el documento avisando con claridad si falta un nivel. */
function nodo(objeto: unknown, ...claves: string[]): Record<string, unknown> {
  let actual: unknown = objeto;
  for (const clave of claves) {
    expect(actual, `no se pudo llegar a "${clave}"`).toBeTypeOf('object');
    actual = (actual as Record<string, unknown>)[clave];
  }
  return actual as Record<string, unknown>;
}

function normalizar(ruta: string): string {
  const conLlaves = ruta.replace(/:(\w+)/g, '{$1}');
  return conLlaves.length > 1 ? conLlaves.replace(/\/+$/, '') : conLlaves;
}

beforeAll(async () => {
  app = await construirApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('especificacion OpenAPI', () => {
  it('documenta exactamente las rutas que existen', () => {
    const registradas = [
      ...new Set(
        app.rutasRegistradas
          .filter((ruta) => ruta.metodo !== 'HEAD' && ruta.metodo !== 'OPTIONS')
          .filter((ruta) => ruta.ruta.startsWith('/api/v1') || ruta.ruta.startsWith('/health'))
          // La interfaz grafica de Swagger registra sus propias rutas estaticas.
          .filter((ruta) => !ruta.ruta.startsWith('/api/v1/docs'))
          .map((ruta) => `${ruta.metodo} ${normalizar(ruta.ruta)}`),
      ),
    ].sort();

    const documentadas = [
      ...new Set(rutasDocumentadas().map((ruta) => `${ruta.metodo} ${normalizar(ruta.ruta)}`)),
    ].sort();

    expect(documentadas).toEqual(registradas);
  });

  it('es un documento OpenAPI 3 valido en lo esencial', () => {
    const especificacion = construirEspecificacion();

    expect(especificacion.openapi).toBe('3.0.3');
    expect(Object.keys(especificacion.paths).length).toBeGreaterThan(30);
    expect(especificacion.components.securitySchemes.cookieSesion.name).toBe('sid');
    expect(especificacion.components.schemas.Error).toBeDefined();
  });

  it('los esquemas del cuerpo salen de los Zod que validan de verdad', () => {
    const propiedades = nodo(
      construirEspecificacion(),
      'paths',
      '/api/v1/ventas',
      'post',
      'requestBody',
      'content',
      'application/json',
      'schema',
      'properties',
    );

    // Las lineas y el metodo de pago estan; el precio NO, porque lo pone el servidor.
    expect(Object.keys(propiedades)).toContain('lineas');
    expect(Object.keys(propiedades)).toContain('metodoPago');
    expect(Object.keys(propiedades)).not.toContain('precioUnitCentavos');
  });

  it('declara la cabecera Idempotency-Key como obligatoria al vender', () => {
    const operacion = nodo(construirEspecificacion(), 'paths', '/api/v1/ventas', 'post');
    const parametros = operacion['parameters'] as Array<Record<string, unknown>>;

    const cabecera = parametros.find((parametro) => parametro['name'] === 'Idempotency-Key');
    expect(cabecera).toBeDefined();
    expect(cabecera?.['in']).toBe('header');
    expect(cabecera?.['required']).toBe(true);
  });

  it('se puede pedir por HTTP para generar los tipos del frontend', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json().info.title).toBe('Inventario CCSF2');
  });
});
