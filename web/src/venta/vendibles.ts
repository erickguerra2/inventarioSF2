import { useQuery } from '@tanstack/react-query';
import { api } from '../api/cliente.ts';
import type { Bolsa, Prenda, TipoItem } from '../api/modelos.ts';

/**
 * Una cosa que se puede vender. Uniformes y bolsas se aplanan a la MISMA forma
 * porque el backend los trata igual: los dos se venden con `itemId`. Gracias a
 * eso la pantalla de venta tiene una sola lista y un solo carrito.
 */
export type Vendible = {
  itemId: string;
  tipo: TipoItem;
  titulo: string;
  detalle: string;
  precioCentavos: number;
  stockActual: number;
  disponible: boolean;
  /** Las palabras por las que se puede encontrar, ya normalizadas. */
  palabras: string[];
  /** Posicion en el catalogo tal como lo ordena el backend. */
  orden: number;
};

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** "Polo institucional - M" -> ["polo", "institucional", "m"] */
function enPalabras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function dePrenda(prenda: Prenda): Array<Omit<Vendible, 'orden'>> {
  return prenda.variantes.map((variante) => ({
    itemId: variante.itemId,
    tipo: 'UNIFORME_TALLA' as const,
    titulo: prenda.nombre,
    detalle: `Talla ${variante.talla}`,
    precioCentavos: variante.precioCentavos,
    stockActual: variante.stockActual,
    disponible: variante.disponible,
    palabras: enPalabras(
      `${prenda.nombre} ${variante.talla} ${prenda.categoria.nombre} ${variante.sku}`,
    ),
  }));
}

function deBolsa(bolsa: Bolsa): Omit<Vendible, 'orden'> {
  return {
    itemId: bolsa.itemId,
    tipo: 'BOLSA_UTILES',
    titulo: 'Bolsa de útiles',
    detalle: `${bolsa.grado.nombre} · ${bolsa.ciclo.anio}`,
    precioCentavos: bolsa.precioCentavos,
    stockActual: bolsa.stockActual,
    disponible: bolsa.disponible,
    palabras: enPalabras(
      `bolsa utiles ${bolsa.grado.nombre} ${bolsa.grado.nivel.nombre} ${bolsa.ciclo.anio} ${bolsa.sku}`,
    ),
  };
}

export function useVendibles() {
  const prendas = useQuery({
    queryKey: ['prendas'],
    queryFn: () => api<Prenda[]>('/uniformes/prendas'),
  });

  const bolsas = useQuery({
    queryKey: ['bolsas'],
    queryFn: () => api<Bolsa[]>('/bolsas'),
  });

  const lista: Vendible[] = [
    ...(prendas.data ?? []).flatMap(dePrenda),
    // Solo las del ciclo en curso: las de ciclos anteriores no se venden.
    ...(bolsas.data ?? []).filter((bolsa) => bolsa.ciclo.activo).map(deBolsa),
    // El orden del backend ya viene bien (las tallas en XS, S, M, L, XL y los
    // grados por nivel), asi que se conserva en lugar de reordenar aqui.
  ].map((vendible, indice) => ({ ...vendible, orden: indice }));

  return {
    vendibles: lista,
    cargando: prendas.isPending || bolsas.isPending,
    error: prendas.error ?? bolsas.error,
  };
}

/**
 * Busca por TODAS las palabras escritas, en cualquier orden: "polo m" encuentra
 * el polo talla M, y "4to" encuentra la bolsa de 4to primaria.
 *
 * Cada palabra tiene que calzar con el PRINCIPIO de alguna palabra del producto,
 * no en cualquier parte. Esa diferencia importa: buscando por subcadena, "polo m"
 * tambien encontraba la talla L, porque "uniforme" contiene una m — y vendiendo
 * rapido eso despacha la talla equivocada.
 *
 * Los agotados salen al final pero NO se esconden: quien vende necesita ver que
 * esa talla existe y que hay que pedirla.
 */
export function buscar(vendibles: Vendible[], consulta: string): Vendible[] {
  const buscadas = enPalabras(consulta);

  const encontrados =
    buscadas.length === 0
      ? vendibles
      : vendibles.filter((vendible) =>
          buscadas.every((buscada) =>
            vendible.palabras.some((palabra) => palabra.startsWith(buscada)),
          ),
        );

  // Disponibles primero; dentro de cada grupo, el orden del catalogo.
  return [...encontrados].sort((a, b) =>
    a.disponible === b.disponible ? a.orden - b.orden : a.disponible ? -1 : 1,
  );
}
