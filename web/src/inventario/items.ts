import { useQuery, type QueryClient } from '@tanstack/react-query';
import { apiConMeta } from '../api/cliente.ts';
import type { TipoItem } from '../api/modelos.ts';
import { calzaPorPalabras, enPalabras } from '../utilidades/texto.ts';

/** Un item del inventario: una talla de uniforme o una bolsa de utiles. */
export type ItemInventario = {
  id: string;
  sku: string;
  tipo: TipoItem;
  nombre: string;
  precioCentavos: number;
  costoCentavos: number | null;
  stockActual: number;
  stockMinimo: number;
  activo: boolean;
  agotado: boolean;
  bajoStock: boolean;
  faltante: number;
  valorInventarioCentavos: number | null;
  origen:
    | {
        clase: 'UNIFORME_TALLA';
        varianteId: string;
        prendaId: string;
        prenda: string;
        categoria: { codigo: string; nombre: string };
        talla: string;
      }
    | {
        clase: 'BOLSA_UTILES';
        bolsaId: string;
        grado: { id: string; nombre: string; nivel: string };
        ciclo: { id: string; anio: number };
        version: number;
      }
    | null;
};

type Respuesta = {
  data: ItemInventario[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
};

/**
 * Todo el inventario de una vez. Son unas decenas de items, asi que buscar y
 * filtrar en el cliente es instantaneo y no hace falta pedir por cada tecla.
 */
export function useItemsInventario() {
  const consulta = useQuery({
    queryKey: ['inventario', 'todos'],
    queryFn: () => apiConMeta<Respuesta>('/inventario?perPage=100&incluirInactivos=true'),
  });

  return {
    items: consulta.data?.data ?? [],
    cargando: consulta.isPending,
    error: consulta.error,
  };
}

/**
 * Un movimiento cambia el stock, y el stock se ve en media aplicacion: el
 * inventario, el catalogo, la pantalla de venta y las alertas.
 */
export function refrescarInventario(cliente: QueryClient) {
  for (const clave of [['inventario'], ['prendas'], ['bolsas'], ['alertas'], ['kardex']]) {
    void cliente.invalidateQueries({ queryKey: clave });
  }
}

export function palabrasDe(item: ItemInventario): string[] {
  const extra =
    item.origen?.clase === 'UNIFORME_TALLA'
      ? `${item.origen.prenda} ${item.origen.talla} ${item.origen.categoria.nombre}`
      : item.origen?.clase === 'BOLSA_UTILES'
        ? `${item.origen.grado.nombre} ${item.origen.grado.nivel} ${item.origen.ciclo.anio}`
        : '';

  return enPalabras(`${item.nombre} ${item.sku} ${extra}`);
}

export function buscarItems(items: ItemInventario[], consulta: string): ItemInventario[] {
  if (consulta.trim() === '') return items;
  return items.filter((item) => calzaPorPalabras(palabrasDe(item), consulta));
}

/** "Talla M · Polo institucional" o "4to Primaria · 2026" */
export function detalleDe(item: ItemInventario): string {
  if (item.origen?.clase === 'UNIFORME_TALLA') {
    return `${item.origen.categoria.nombre}`;
  }
  if (item.origen?.clase === 'BOLSA_UTILES') {
    return `${item.origen.grado.nivel} · Ciclo ${item.origen.ciclo.anio}`;
  }
  return '';
}
