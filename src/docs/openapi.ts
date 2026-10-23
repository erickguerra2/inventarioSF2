/**
 * Especificacion OpenAPI del backend.
 *
 * Los ESQUEMAS no se escriben aqui: se generan de los mismos objetos Zod que
 * validan las peticiones en tiempo de ejecucion, asi que no pueden mentir sobre
 * lo que la API acepta.
 *
 * La TABLA de rutas (metodo, ruta, resumen, permiso) si se escribe a mano. Para
 * que no se desincronice, `tests/integration/openapi.test.ts` compara esta tabla
 * contra las rutas realmente registradas en Fastify, en las dos direcciones: si
 * alguien agrega un endpoint y no lo documenta, el test falla.
 *
 * Lo que queda fuera a proposito: el detalle campo por campo de las RESPUESTAS.
 * Todas siguen el mismo sobre (`{ data }`, y `{ data, meta }` cuando paginan), y
 * describirlas aqui significaria mantener una copia a mano de cada presentador.
 */
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  actualizarPrendaBodySchema,
  actualizarVarianteBodySchema,
  crearPrendaBodySchema,
  listarPrendasQuerySchema,
  varianteNuevaSchema,
} from '../modules/uniformes/uniformes.schemas.js';
import {
  actualizarBolsaBodySchema,
  crearBolsaBodySchema,
  duplicarBolsaBodySchema,
  listarBolsasQuerySchema,
  reemplazarContenidoBodySchema,
} from '../modules/bolsas/bolsas.schemas.js';
import {
  crearCicloBodySchema,
  crearGradoBodySchema,
  crearNivelBodySchema,
  listarGradosQuerySchema,
} from '../modules/escolar/escolar.schemas.js';
import {
  conteoBodySchema,
  entradasBodySchema,
  kardexQuerySchema,
  listarInventarioQuerySchema,
  movimientoManualBodySchema,
} from '../modules/inventario/inventario.schemas.js';
import {
  anularVentaBodySchema,
  crearVentaBodySchema,
  listarVentasQuerySchema,
} from '../modules/ventas/ventas.schemas.js';
import { loginBodySchema } from '../modules/auth/auth.schemas.js';
import {
  actualizarUsuarioBodySchema,
  cambiarPasswordBodySchema,
  crearUsuarioBodySchema,
  listarUsuariosQuerySchema,
} from '../modules/usuarios/usuarios.schemas.js';
import {
  bolsasPorGradoQuerySchema,
  corteCajaQuerySchema,
  existenciasQuerySchema,
  tallasQuerySchema,
  ventasQuerySchema,
} from '../modules/reportes/reportes.schemas.js';

type Permiso = 'PUBLICO' | 'AUTENTICADO' | 'ADMIN';

type Ruta = {
  metodo: 'get' | 'post' | 'patch' | 'put' | 'delete';
  ruta: string; // con {parametro}, como lo escribe OpenAPI
  etiqueta: string;
  resumen: string;
  permiso: Permiso;
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  nota?: string;
};

const RUTAS: Ruta[] = [
  // Salud
  { metodo: 'get', ruta: '/health', etiqueta: 'Salud', resumen: 'El servicio esta vivo', permiso: 'PUBLICO' },
  { metodo: 'get', ruta: '/health/db', etiqueta: 'Salud', resumen: 'La base de datos responde', permiso: 'PUBLICO' },

  // Auth
  {
    metodo: 'post',
    ruta: '/api/v1/auth/login',
    etiqueta: 'Sesion',
    resumen: 'Iniciar sesion',
    permiso: 'PUBLICO',
    body: loginBodySchema,
    nota: 'Responde con Set-Cookie (sid, httpOnly). Se bloquea tras 5 intentos fallidos por IP + usuario.',
  },
  { metodo: 'post', ruta: '/api/v1/auth/logout', etiqueta: 'Sesion', resumen: 'Cerrar sesion', permiso: 'AUTENTICADO' },
  {
    metodo: 'get',
    ruta: '/api/v1/auth/me',
    etiqueta: 'Sesion',
    resumen: 'Quien soy',
    permiso: 'AUTENTICADO',
    nota: 'El frontend lo llama al cargar: 200 hay sesion, 401 mostrar login.',
  },

  // Usuarios
  { metodo: 'get', ruta: '/api/v1/usuarios', etiqueta: 'Usuarios', resumen: 'Listar usuarios', permiso: 'ADMIN', query: listarUsuariosQuerySchema },
  { metodo: 'post', ruta: '/api/v1/usuarios', etiqueta: 'Usuarios', resumen: 'Crear una maestra o administradora', permiso: 'ADMIN', body: crearUsuarioBodySchema },
  { metodo: 'get', ruta: '/api/v1/usuarios/{id}', etiqueta: 'Usuarios', resumen: 'Ver un usuario', permiso: 'ADMIN' },
  { metodo: 'patch', ruta: '/api/v1/usuarios/{id}', etiqueta: 'Usuarios', resumen: 'Editar o desactivar un usuario', permiso: 'ADMIN', body: actualizarUsuarioBodySchema },
  { metodo: 'post', ruta: '/api/v1/usuarios/{id}/password', etiqueta: 'Usuarios', resumen: 'Resetear la contrasena', permiso: 'ADMIN', body: cambiarPasswordBodySchema, nota: 'Cierra todas las sesiones de ese usuario.' },

  // Estructura escolar
  { metodo: 'get', ruta: '/api/v1/niveles', etiqueta: 'Escolar', resumen: 'Listar niveles con sus grados', permiso: 'AUTENTICADO' },
  { metodo: 'post', ruta: '/api/v1/niveles', etiqueta: 'Escolar', resumen: 'Crear un nivel', permiso: 'ADMIN', body: crearNivelBodySchema },
  { metodo: 'get', ruta: '/api/v1/grados', etiqueta: 'Escolar', resumen: 'Listar grados', permiso: 'AUTENTICADO', query: listarGradosQuerySchema },
  { metodo: 'post', ruta: '/api/v1/grados', etiqueta: 'Escolar', resumen: 'Crear un grado', permiso: 'ADMIN', body: crearGradoBodySchema },
  { metodo: 'get', ruta: '/api/v1/ciclos', etiqueta: 'Escolar', resumen: 'Listar ciclos escolares', permiso: 'AUTENTICADO' },
  { metodo: 'post', ruta: '/api/v1/ciclos', etiqueta: 'Escolar', resumen: 'Crear un ciclo escolar', permiso: 'ADMIN', body: crearCicloBodySchema },
  { metodo: 'post', ruta: '/api/v1/ciclos/{id}/activar', etiqueta: 'Escolar', resumen: 'Activar un ciclo (desactiva el anterior)', permiso: 'ADMIN' },

  // Uniformes
  { metodo: 'get', ruta: '/api/v1/uniformes/categorias', etiqueta: 'Uniformes', resumen: 'Categorias de uniforme', permiso: 'AUTENTICADO' },
  { metodo: 'get', ruta: '/api/v1/uniformes/prendas', etiqueta: 'Uniformes', resumen: 'Listar prendas con sus tallas', permiso: 'AUTENTICADO', query: listarPrendasQuerySchema },
  { metodo: 'get', ruta: '/api/v1/uniformes/prendas/{id}', etiqueta: 'Uniformes', resumen: 'Ver una prenda', permiso: 'AUTENTICADO' },
  { metodo: 'post', ruta: '/api/v1/uniformes/prendas', etiqueta: 'Uniformes', resumen: 'Crear una prenda (opcionalmente con sus tallas)', permiso: 'ADMIN', body: crearPrendaBodySchema },
  { metodo: 'patch', ruta: '/api/v1/uniformes/prendas/{id}', etiqueta: 'Uniformes', resumen: 'Editar una prenda', permiso: 'ADMIN', body: actualizarPrendaBodySchema },
  { metodo: 'delete', ruta: '/api/v1/uniformes/prendas/{id}', etiqueta: 'Uniformes', resumen: 'Desactivar una prenda y sus tallas', permiso: 'ADMIN' },
  { metodo: 'post', ruta: '/api/v1/uniformes/prendas/{id}/variantes', etiqueta: 'Uniformes', resumen: 'Agregar una talla', permiso: 'ADMIN', body: varianteNuevaSchema },
  {
    metodo: 'patch',
    ruta: '/api/v1/uniformes/variantes/{id}',
    etiqueta: 'Uniformes',
    resumen: 'Editar precio, costo o minimo de una talla',
    permiso: 'ADMIN',
    body: actualizarVarianteBodySchema,
    nota: 'No acepta stockActual: las existencias solo se mueven con un movimiento de inventario.',
  },
  { metodo: 'delete', ruta: '/api/v1/uniformes/variantes/{id}', etiqueta: 'Uniformes', resumen: 'Borrar una talla sin historia', permiso: 'ADMIN' },

  // Bolsas
  { metodo: 'get', ruta: '/api/v1/bolsas', etiqueta: 'Bolsas de utiles', resumen: 'Listar bolsas por ciclo y grado', permiso: 'AUTENTICADO', query: listarBolsasQuerySchema },
  { metodo: 'get', ruta: '/api/v1/bolsas/{id}', etiqueta: 'Bolsas de utiles', resumen: 'Ver una bolsa y su contenido', permiso: 'AUTENTICADO' },
  { metodo: 'get', ruta: '/api/v1/bolsas/{id}/lista', etiqueta: 'Bolsas de utiles', resumen: 'Lista de utiles para imprimir', permiso: 'AUTENTICADO' },
  { metodo: 'post', ruta: '/api/v1/bolsas', etiqueta: 'Bolsas de utiles', resumen: 'Crear la bolsa de un grado y ciclo', permiso: 'ADMIN', body: crearBolsaBodySchema },
  { metodo: 'patch', ruta: '/api/v1/bolsas/{id}', etiqueta: 'Bolsas de utiles', resumen: 'Editar nombre, precio o minimo', permiso: 'ADMIN', body: actualizarBolsaBodySchema },
  {
    metodo: 'put',
    ruta: '/api/v1/bolsas/{id}/contenido',
    etiqueta: 'Bolsas de utiles',
    resumen: 'Reemplazar la lista de utiles completa',
    permiso: 'ADMIN',
    body: reemplazarContenidoBodySchema,
    nota: 'El contenido es informativo: no cambia existencias ni precio, y puede quedar vacio.',
  },
  { metodo: 'post', ruta: '/api/v1/bolsas/{id}/duplicar', etiqueta: 'Bolsas de utiles', resumen: 'Clonar la bolsa a otro ciclo, con stock 0', permiso: 'ADMIN', body: duplicarBolsaBodySchema },
  { metodo: 'delete', ruta: '/api/v1/bolsas/{id}', etiqueta: 'Bolsas de utiles', resumen: 'Desactivar una bolsa', permiso: 'ADMIN' },

  // Ventas
  {
    metodo: 'post',
    ruta: '/api/v1/ventas',
    etiqueta: 'Ventas',
    resumen: 'Registrar una venta',
    permiso: 'AUTENTICADO',
    body: crearVentaBodySchema,
    nota: 'Exige la cabecera Idempotency-Key. Si la clave ya se uso responde 200 con la venta original, sin descontar de nuevo.',
  },
  { metodo: 'get', ruta: '/api/v1/ventas', etiqueta: 'Ventas', resumen: 'Listar ventas', permiso: 'AUTENTICADO', query: listarVentasQuerySchema, nota: 'Una maestra solo recibe las suyas, se ignora el usuarioId del query.' },
  { metodo: 'get', ruta: '/api/v1/ventas/{id}', etiqueta: 'Ventas', resumen: 'Ver una venta', permiso: 'AUTENTICADO', nota: 'Una venta ajena responde 404, no 403.' },
  { metodo: 'get', ruta: '/api/v1/ventas/{id}/recibo', etiqueta: 'Ventas', resumen: 'Datos del recibo', permiso: 'AUTENTICADO' },
  { metodo: 'post', ruta: '/api/v1/ventas/{id}/anular', etiqueta: 'Ventas', resumen: 'Anular una venta y devolver el stock', permiso: 'ADMIN', body: anularVentaBodySchema },

  // Inventario
  { metodo: 'get', ruta: '/api/v1/inventario', etiqueta: 'Inventario', resumen: 'Existencias de uniformes y bolsas juntas', permiso: 'ADMIN', query: listarInventarioQuerySchema },
  { metodo: 'get', ruta: '/api/v1/inventario/alertas', etiqueta: 'Inventario', resumen: 'Que hay que reponer', permiso: 'ADMIN' },
  { metodo: 'get', ruta: '/api/v1/inventario/{itemId}', etiqueta: 'Inventario', resumen: 'Ver un item', permiso: 'ADMIN' },
  {
    metodo: 'post',
    ruta: '/api/v1/inventario/entradas',
    etiqueta: 'Inventario',
    resumen: 'Ingresar existencias en lote',
    permiso: 'ADMIN',
    body: entradasBodySchema,
    nota: 'Una transaccion. Con tipo APERTURA es la carga inicial del inventario.',
  },
  {
    metodo: 'post',
    ruta: '/api/v1/inventario/conteos',
    etiqueta: 'Inventario',
    resumen: 'Registrar un conteo fisico',
    permiso: 'ADMIN',
    body: conteoBodySchema,
    nota: 'La diferencia se registra como ajuste con motivo; no se corrige el stock en silencio.',
  },
  {
    metodo: 'post',
    ruta: '/api/v1/inventario/{itemId}/movimientos',
    etiqueta: 'Inventario',
    resumen: 'Entrada, ajuste, merma o devolucion',
    permiso: 'ADMIN',
    body: movimientoManualBodySchema,
    nota: 'La cantidad va SIEMPRE positiva: el tipo define si entra o sale. VENTA no se acepta aqui.',
  },
  { metodo: 'get', ruta: '/api/v1/inventario/{itemId}/kardex', etiqueta: 'Inventario', resumen: 'Historial de un item con saldos', permiso: 'ADMIN', query: kardexQuerySchema },
  { metodo: 'get', ruta: '/api/v1/admin/verificar-integridad', etiqueta: 'Inventario', resumen: 'stockActual == SUM(movimientos) en todos los items', permiso: 'ADMIN' },

  // Reportes
  {
    metodo: 'get',
    ruta: '/api/v1/reportes/corte-caja',
    etiqueta: 'Reportes',
    resumen: 'Corte de caja del dia, por maestra y metodo de pago',
    permiso: 'AUTENTICADO',
    query: corteCajaQuerySchema,
    nota: 'El unico reporte que ve una maestra, y solo el suyo. Con formato=csv devuelve un CSV.',
  },
  { metodo: 'get', ruta: '/api/v1/reportes/ventas', etiqueta: 'Reportes', resumen: 'Ventas agrupadas por dia, maestra, tipo o grado', permiso: 'ADMIN', query: ventasQuerySchema },
  { metodo: 'get', ruta: '/api/v1/reportes/tallas-mas-vendidas', etiqueta: 'Reportes', resumen: 'Que tallas pedir', permiso: 'ADMIN', query: tallasQuerySchema },
  { metodo: 'get', ruta: '/api/v1/reportes/existencias-valorizadas', etiqueta: 'Reportes', resumen: 'Cuanto vale el inventario al costo', permiso: 'ADMIN', query: existenciasQuerySchema },
  { metodo: 'get', ruta: '/api/v1/reportes/bolsas-por-grado', etiqueta: 'Reportes', resumen: 'Bolsas vendidas y en existencia por grado', permiso: 'ADMIN', query: bolsasPorGradoQuerySchema },

  // Documentacion
  { metodo: 'get', ruta: '/api/v1/openapi.json', etiqueta: 'Documentacion', resumen: 'Esta especificacion', permiso: 'PUBLICO' },
];

const CODIGOS_ERROR = [
  'VALIDACION',
  'NO_ENCONTRADO',
  'NO_AUTENTICADO',
  'SIN_PERMISO',
  'RECURSO_DUPLICADO',
  'SKU_DUPLICADO',
  'ITEM_INACTIVO',
  'STOCK_INSUFICIENTE',
  'MOVIMIENTO_INVALIDO',
  'CICLO_CERRADO',
  'CICLO_SIN_ACTIVAR',
  'VENTA_YA_ANULADA',
  'DEMASIADOS_INTENTOS',
  'RESTRICCION_BD',
  'ERROR_INTERNO',
];

type JsonSchema = Record<string, unknown>;

function aJsonSchema(schema: ZodTypeAny): JsonSchema {
  return zodToJsonSchema(schema, { $refStrategy: 'none', target: 'openApi3' }) as JsonSchema;
}

/** OpenAPI quiere un parametro por cada campo del query, no un objeto. */
function parametrosDeQuery(schema: ZodTypeAny): JsonSchema[] {
  const generado = aJsonSchema(schema);
  const propiedades = (generado['properties'] ?? {}) as Record<string, JsonSchema>;
  const requeridos = (generado['required'] ?? []) as string[];

  return Object.entries(propiedades).map(([nombre, esquema]) => ({
    name: nombre,
    in: 'query',
    required: requeridos.includes(nombre),
    schema: esquema,
    ...(esquema['description'] ? { description: esquema['description'] } : {}),
  }));
}

function parametrosDeRuta(ruta: string): JsonSchema[] {
  const nombres = [...ruta.matchAll(/\{(\w+)\}/g)].map((coincidencia) => coincidencia[1]);
  return nombres.map((nombre) => ({
    name: nombre,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function respuestas(ruta: Ruta): JsonSchema {
  const base: JsonSchema = {
    '200': {
      description: 'Correcto. El cuerpo es { data } (y { data, meta } cuando pagina).',
      content: {
        'application/json': {
          schema: { type: 'object', properties: { data: {} } },
        },
      },
    },
    '400': { $ref: '#/components/responses/Error' },
  };

  if (ruta.metodo === 'post' && !ruta.ruta.includes('login')) {
    base['201'] = { description: 'Creado' };
  }
  if (ruta.permiso !== 'PUBLICO') {
    base['401'] = { $ref: '#/components/responses/Error' };
  }
  if (ruta.permiso === 'ADMIN') {
    base['403'] = { $ref: '#/components/responses/Error' };
  }
  base['404'] = { $ref: '#/components/responses/Error' };
  base['409'] = { $ref: '#/components/responses/Error' };

  return base;
}

export function construirEspecificacion() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ruta of RUTAS) {
    const parametros = [...parametrosDeRuta(ruta.ruta)];
    if (ruta.query) parametros.push(...parametrosDeQuery(ruta.query));

    if (ruta.ruta === '/api/v1/ventas' && ruta.metodo === 'post') {
      parametros.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description: 'UUID por intento de venta. El mismo valor en los reintentos.',
        schema: { type: 'string', minLength: 8 },
      });
    }

    const operacion: Record<string, unknown> = {
      tags: [ruta.etiqueta],
      summary: ruta.resumen,
      description: [
        ruta.permiso === 'ADMIN'
          ? 'Solo ADMIN.'
          : ruta.permiso === 'AUTENTICADO'
            ? 'Requiere sesion.'
            : 'Publico.',
        ruta.nota,
      ]
        .filter(Boolean)
        .join(' '),
      responses: respuestas(ruta),
    };

    if (parametros.length > 0) operacion['parameters'] = parametros;
    if (ruta.body) {
      operacion['requestBody'] = {
        required: true,
        content: { 'application/json': { schema: aJsonSchema(ruta.body) } },
      };
    }
    if (ruta.permiso !== 'PUBLICO') {
      operacion['security'] = [{ cookieSesion: [] }];
    }

    paths[ruta.ruta] = { ...paths[ruta.ruta], [ruta.metodo]: operacion };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Inventario CCSF2',
      version: '0.1.0',
      description: [
        'Backend del inventario de uniformes y bolsas de utiles.',
        '',
        '- **El dinero va en centavos enteros.** Q125.50 se envia y se recibe como 12550.',
        '- **Se vende con `itemId`**, que sirve igual para una talla de uniforme que para una bolsa.',
        '- **La sesion va en una cookie httpOnly.** Basta `credentials: "include"` en cada peticion; no hay token que guardar.',
        '- Todas las respuestas correctas son `{ data }`, y `{ data, meta }` cuando paginan.',
        '- Los errores siempre traen `{ error: { code, message, details? } }`. Reaccione por `code`, no por el mensaje.',
      ].join('\n'),
    },
    servers: [{ url: '/', description: 'El mismo dominio que sirve el frontend' }],
    components: {
      securitySchemes: {
        cookieSesion: { type: 'apiKey', in: 'cookie', name: 'sid' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', enum: CODIGOS_ERROR },
                message: { type: 'string' },
                details: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      responses: {
        Error: {
          description: 'Error. El cuerpo siempre tiene la misma forma.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    tags: [...new Set(RUTAS.map((ruta) => ruta.etiqueta))].map((nombre) => ({ name: nombre })),
    paths,
  };
}

/** Para la prueba de completitud: la tabla de arriba, en crudo. */
export function rutasDocumentadas() {
  return RUTAS.map((ruta) => ({ metodo: ruta.metodo.toUpperCase(), ruta: ruta.ruta }));
}
