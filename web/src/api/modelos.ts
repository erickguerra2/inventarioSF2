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

export type UsuarioSesion = {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
};

export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'TARJETA';

export type TipoItem = 'UNIFORME_TALLA' | 'BOLSA_UTILES';

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
  fotos: Array<{ id: string; url: string; alt: string | null; esPrincipal: boolean }>;
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
