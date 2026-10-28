/**
 * Las formas de respuesta que usa la interfaz.
 *
 * Los tipos de PETICION salen del contrato generado (`npm run tipos` ->
 * src/api/esquema.ts). Los de RESPUESTA se declaran aqui a mano porque el
 * openapi.json documenta las respuestas como el sobre y no campo por campo
 * (ver planfrontend.md 3). Si el backend llega a exportar sus tipos inferidos,
 * este archivo se reemplaza por esos.
 */

export type Rol = 'ADMIN' | 'VENDEDOR';

export type CategoriaUniforme = {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
};

export type Grado = {
  id: string;
  nombre: string;
  orden: number;
  nivelId: string;
};

export type Nivel = {
  id: string;
  nombre: string;
  orden: number;
  grados: Grado[];
};

export type Ciclo = {
  id: string;
  anio: number;
  activo: boolean;
};

export type UsuarioSesion = {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
};

export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'TARJETA';

export type TipoItem = 'UNIFORME_TALLA' | 'BOLSA_UTILES';

export type EstadoVenta = 'PAGADA' | 'ANULADA';

export type Venta = {
  id: string;
  correlativo: number;
  estado: EstadoVenta;
  creadoEn: string;
  metodoPago: MetodoPago;
  referenciaPago: string | null;
  subtotalCentavos: number;
  descuentoCentavos: number;
  totalCentavos: number;
  comprador: { tipo: 'ALUMNO' | 'NOMBRE'; id: string | null; nombre: string } | null;
  /** NIT para la factura de la SAT, normalizado y sin guiones. null = consumidor final. */
  compradorNit: string | null;
  /**
   * El backend ya decidio si este NIT merece una segunda mirada antes de
   * facturar. Es un aviso: nunca impidio cobrar.
   */
  nitPorRevisar: boolean;
  /** Quien vendio. No es editable: es la base del corte de caja. */
  vendidoPor: { id: string; usuario: string; nombre: string };
  anulacion: { en: string; motivo: string; por: string | null } | null;
  lineas: Array<{
    id: string;
    itemId: string;
    descripcion: string;
    cantidad: number;
    precioUnitCentavos: number;
    totalCentavos: number;
  }>;
};

/** Lo que devuelve GET /ventas: filas en `data`, metadatos como hermanos. */
export type ListadoVentas = {
  data: Venta[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
  resumen: { totalCobradoCentavos: number; incluyeSoloSusVentas: boolean };
};

export type CorteDeCaja = {
  fecha: string;
  zona: string;
  alcance: 'TODAS' | 'SOLO_MIS_VENTAS';
  totales: {
    ventas: number;
    cobradoCentavos: number;
    efectivoCentavos: number;
    anuladas: number;
    anuladoCentavos: number;
  };
  porMetodo: Partial<Record<MetodoPago, number>>;
  porMaestra: Array<{
    usuarioId: string;
    usuario: string;
    nombre: string;
    ventas: number;
    cobradoCentavos: number;
    porMetodo: Partial<Record<MetodoPago, number>>;
    aEntregarEnEfectivoCentavos: number;
  }>;
};

/** Una talla de uniforme. `itemId` es con lo que se vende. */
export type Variante = {
  id: string;
  itemId: string;
  sku: string;
  talla: string;
  precioCentavos: number;
  costoCentavos: number | null;
  stockActual: number;
  stockMinimo: number;
  activo: boolean;
  disponible: boolean;
  bajoStock: boolean;
};

export type Prenda = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoTalla: 'LETRA' | 'NUMERO';
  activo: boolean;
  categoria: { id: string; codigo: string; nombre: string };
  fotos: Array<{
    id: string;
    /** Ancho 800, para ver la prenda. */
    url: string;
    /** Ancho 200, para listas y resultados de búsqueda. */
    urlMini: string;
    alt: string | null;
    esPrincipal: boolean;
  }>;
  variantes: Variante[];
};

/** Una bolsa de utiles. Tambien se vende por `itemId`. */
export type Bolsa = {
  id: string;
  nombre: string;
  notas: string | null;
  version: number;
  itemId: string;
  sku: string;
  precioCentavos: number;
  costoCentavos: number | null;
  stockActual: number;
  stockMinimo: number;
  activo: boolean;
  disponible: boolean;
  bajoStock: boolean;
  grado: { id: string; nombre: string; nivel: { id: string; nombre: string } };
  ciclo: { id: string; anio: number; activo: boolean };
  contenido: Array<{
    id: string;
    descripcion: string;
    cantidad: number;
    unidad: string | null;
    orden: number;
  }>;
  totalLineasContenido: number;
};
