import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiConMeta } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { Aviso, Cargando, Tarjeta } from '../componentes/ui.tsx';
import { detalleDe, refrescarInventario, type ItemInventario } from './items.ts';
import { MovimientoManual } from './MovimientoManual.tsx';

type RespuestaAlertas = {
  data: ItemInventario[];
  resumen: { total: number; agotados: number };
};

/** Lo que hay que reponer, ya ordenado por lo que falta: es el orden en que le sirve a quien compra. */
export function Alertas() {
  const clienteConsultas = useQueryClient();
  const [moviendo, setMoviendo] = useState<ItemInventario | null>(null);

  const alertas = useQuery({
    queryKey: ['alertas'],
    queryFn: () => apiConMeta<RespuestaAlertas>('/inventario/alertas'),
  });

  if (alertas.isPending) return <Cargando texto="Revisando existencias..." />;
  if (alertas.isError) return <Aviso tipo="error">{mensajeDeError(alertas.error)}</Aviso>;

  if (alertas.data.data.length === 0) {
    return (
      <Tarjeta>
        <p className="py-8 text-center text-sm text-slate-600">
          No hay nada por reponer: todo está sobre su mínimo.
        </p>
      </Tarjeta>
    );
  }

  return (
    <div>
      <Tarjeta>
        <p className="mb-4 text-sm text-slate-600">
          {alertas.data.resumen.total} producto(s) en o por debajo del mínimo
          {alertas.data.resumen.agotados > 0 ? (
            <>
              , <strong className="text-red-700">{alertas.data.resumen.agotados} agotado(s)</strong>
            </>
          ) : null}
          .
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3 text-right">Hay</th>
                <th className="py-2 pr-3 text-right">Mínimo</th>
                <th className="py-2 pr-3 text-right">Faltan</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {alertas.data.data.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <span className="block font-medium text-slate-900">{item.nombre}</span>
                    <span className="block text-xs text-slate-500">{detalleDe(item)}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <span className={item.agotado ? 'font-semibold text-red-700' : ''}>
                      {item.stockActual}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                    {item.stockMinimo}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-amber-700">
                    {item.faltante}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setMoviendo(item)}
                      className="text-xs font-medium text-marca hover:underline"
                    >
                      Ingresar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {moviendo ? (
        <MovimientoManual
          item={moviendo}
          alCerrar={() => setMoviendo(null)}
          alGuardar={() => {
            setMoviendo(null);
            refrescarInventario(clienteConsultas);
          }}
        />
      ) : null}
    </div>
  );
}
