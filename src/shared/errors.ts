/**
 * Catalogo CERRADO de codigos de error. El frontend reacciona por `code`, nunca
 * parseando el mensaje. Si se agrega uno, se documenta en docs/plan-backend.md.
 */
export type CodigoError =
  | 'VALIDACION'
  | 'NO_ENCONTRADO'
  | 'NO_AUTENTICADO'
  | 'SIN_PERMISO'
  | 'RECURSO_DUPLICADO'
  | 'SKU_DUPLICADO'
  | 'ITEM_INACTIVO'
  | 'STOCK_INSUFICIENTE'
  | 'MOVIMIENTO_INVALIDO'
  | 'CICLO_CERRADO'
  | 'CICLO_SIN_ACTIVAR'
  | 'VENTA_YA_ANULADA'
  | 'RESTRICCION_BD'
  | 'ERROR_INTERNO';

export class AppError extends Error {
  readonly statusCode: number;
  readonly codigo: CodigoError;
  readonly detalles: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    codigo: CodigoError,
    mensaje: string,
    detalles?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** 400 — el cliente mando algo que no sirve. */
export class BadRequest extends AppError {
  constructor(
    mensaje: string,
    detalles?: Record<string, unknown>,
    codigo: CodigoError = 'VALIDACION',
  ) {
    super(400, codigo, mensaje, detalles);
  }
}

/** 404 — no existe, o el usuario no tiene por que saber que existe. */
export class NotFound extends AppError {
  constructor(mensaje = 'No encontrado', detalles?: Record<string, unknown>) {
    super(404, 'NO_ENCONTRADO', mensaje, detalles);
  }
}

/** 409 — la peticion es valida pero choca con una regla del negocio. */
export class Conflict extends AppError {
  constructor(codigo: CodigoError, mensaje: string, detalles?: Record<string, unknown>) {
    super(409, codigo, mensaje, detalles);
  }
}

/** 401 / 403 — se usan a partir de la Fase 3. */
export class NoAutenticado extends AppError {
  constructor(mensaje = 'Hay que iniciar sesion') {
    super(401, 'NO_AUTENTICADO', mensaje);
  }
}

export class SinPermiso extends AppError {
  constructor(mensaje = 'Esta accion no esta permitida para su usuario') {
    super(403, 'SIN_PERMISO', mensaje);
  }
}
