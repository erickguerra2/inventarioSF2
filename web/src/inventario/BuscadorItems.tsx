import { useRef, useState } from 'react';
import { Quetzales } from '../componentes/ui.tsx';
import { buscarItems, detalleDe, type ItemInventario } from './items.ts';

/**
 * Buscar un item y agregarlo con Enter. Es el mismo gesto de la pantalla de
 * venta: escribir, Enter, escribir, Enter. Ingresar veinte lineas de una compra
 * no deberia tomar mas que eso.
 */
export function BuscadorItems({
  items,
  alElegir,
  yaElegidos,
  autoFocus = true,
}: {
  items: ItemInventario[];
  alElegir: (item: ItemInventario) => void;
  yaElegidos: Set<string>;
  autoFocus?: boolean;
}) {
  const [consulta, setConsulta] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  const resultados = buscarItems(items, consulta)
    .filter((item) => !yaElegidos.has(item.id))
    .slice(0, 8);

  function elegir(item: ItemInventario) {
    alElegir(item);
    setConsulta('');
    campo.current?.focus();
  }

  return (
    <div>
      <input
        ref={campo}
        autoFocus={autoFocus}
        value={consulta}
        onChange={(evento) => setConsulta(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key !== 'Enter') return;
          evento.preventDefault();
          const primero = resultados[0];
          if (primero) elegir(primero);
        }}
        placeholder="Buscar: polo m, pantalón 32, 4to primaria..."
        className="w-full rounded-md border border-slate-300 px-4 py-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
      />

      {consulta.trim() !== '' ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
          {resultados.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => elegir(item)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {item.nombre}
                  </span>
                  <span className="block text-xs text-slate-500">{detalleDe(item)}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-500">
                  <span className="block tabular-nums">{item.stockActual} en existencia</span>
                  <span className="block">
                    <Quetzales centavos={item.precioCentavos} />
                  </span>
                </span>
              </button>
            </li>
          ))}

          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">
              No se encontró nada con “{consulta}”.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
