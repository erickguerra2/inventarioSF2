import { useCallback, useMemo, useState } from 'react';
import type { Vendible } from './vendibles.ts';

export type LineaCarrito = {
  itemId: string;
  titulo: string;
  detalle: string;
  precioCentavos: number;
  cantidad: number;
  /** Lo que habia cuando se cargo el catalogo. Sirve para avisar, no para decidir. */
  stockActual: number;
};

export function useCarrito() {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);

  const agregar = useCallback((vendible: Vendible) => {
    setLineas((actuales) => {
      const existente = actuales.find((linea) => linea.itemId === vendible.itemId);

      if (existente) {
        // No se pasa de lo que hay. El backend lo rechazaria igual con un 409,
        // pero avisar antes es mas amable que cobrar y fallar.
        const cantidad = Math.min(existente.cantidad + 1, vendible.stockActual);
        return actuales.map((linea) =>
          linea.itemId === vendible.itemId ? { ...linea, cantidad } : linea,
        );
      }

      return [
        ...actuales,
        {
          itemId: vendible.itemId,
          titulo: vendible.titulo,
          detalle: vendible.detalle,
          precioCentavos: vendible.precioCentavos,
          cantidad: 1,
          stockActual: vendible.stockActual,
        },
      ];
    });
  }, []);

  const cambiarCantidad = useCallback((itemId: string, cantidad: number) => {
    setLineas((actuales) =>
      actuales.flatMap((linea) => {
        if (linea.itemId !== itemId) return [linea];
        if (cantidad < 1) return [];
        return [{ ...linea, cantidad: Math.min(cantidad, linea.stockActual) }];
      }),
    );
  }, []);

  const quitar = useCallback((itemId: string) => {
    setLineas((actuales) => actuales.filter((linea) => linea.itemId !== itemId));
  }, []);

  const limpiar = useCallback(() => setLineas([]), []);

  const subtotalCentavos = useMemo(
    () => lineas.reduce((suma, linea) => suma + linea.precioCentavos * linea.cantidad, 0),
    [lineas],
  );

  const unidades = useMemo(
    () => lineas.reduce((suma, linea) => suma + linea.cantidad, 0),
    [lineas],
  );

  return { lineas, agregar, cambiarCantidad, quitar, limpiar, subtotalCentavos, unidades };
}

/** "125.50" -> 12550. El dinero viaja en centavos enteros. */
export function aCentavos(texto: string): number {
  const numero = Number.parseFloat(texto.replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.round(numero * 100);
}
