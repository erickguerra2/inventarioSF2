import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { mensajeDeError } from '../api/errores.ts';
import type { TipoItem } from '../api/modelos.ts';
import { Aviso, Cargando, Quetzales, Tarjeta } from '../componentes/ui.tsx';
import {
  buscarItems,
  detalleDe,
  refrescarInventario,
  useItemsInventario,
  type ItemInventario,
} from './items.ts';
import { Kardex } from './Kardex.tsx';
import { MovimientoManual } from './MovimientoManual.tsx';

export function Existencias() {
  const clienteConsultas = useQueryClient();
  const { items, cargando, error } = useItemsInventario();

  const [consulta, setConsulta] = useState('');
  const [tipo, setTipo] = useState<'' | TipoItem>('');
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [incluirInactivos, setIncluirInactivos] = useState(false);

  const [viendoKardex, setViendoKardex] = useState<ItemInventario | null>(null);
  const [moviendo, setMoviendo] = useState<ItemInventario | null>(null);

  if (cargando) return <Cargando texto="Cargando el inventario..." />;
  if (error) return <Aviso tipo="error">{mensajeDeError(error)}</Aviso>;

  const filtrados = buscarItems(items, consulta).filter(
    (item) =>
      (tipo === '' || item.tipo === tipo) &&
      (!soloBajoStock || item.bajoStock) &&
      (incluirInactivos || item.activo),
  );

  const unidades = filtrados.reduce((suma, item) => suma + item.stockActual, 0);
  const valor = filtrados.reduce((suma, item) => suma + (item.valorInventarioCentavos ?? 0), 0);
  const sinCosto = filtrados.filter((item) => item.costoCentavos === null).length;

  return (
    <div>
      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block grow">
            <span className="mb-1 block text-xs font-medium text-slate-600">Buscar</span>
            <input
              value={consulta}
              onChange={(evento) => setConsulta(evento.target.value)}
              placeholder="polo m, 4to primaria..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Tipo</span>
            <select
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as '' | TipoItem)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Todo</option>
              <option value="UNIFORME_TALLA">Uniformes</option>
              <option value="BOLSA_UTILES">Bolsas</option>
            </select>
          </label>

          <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={soloBajoStock}
              onChange={(evento) => setSoloBajoStock(evento.target.checked)}
            />
            Solo lo que falta
          </label>

          <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={incluirInactivos}
              onChange={(evento) => setIncluirInactivos(evento.target.checked)}
            />
            Incluir inactivos
          </label>
        </div>
      </Tarjeta>

      <Tarjeta>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
          <p>
            {filtrados.length} producto(s) · {unidades} unidad(es)
          </p>
          <p>
            Valorizado al costo:{' '}
            <strong className="text-azul">
              <Quetzales centavos={valor} />
            </strong>
            {sinCosto > 0 ? (
              <span className="ml-1 text-xs text-slate-400">
                ({sinCosto} sin costo registrado, aportan 0)
              </span>
            ) : null}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3 text-right">Existencia</th>
                <th className="py-2 pr-3 text-right">Mínimo</th>
                <th className="py-2 pr-3 text-right">Costo</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-slate-100 ${item.activo ? '' : 'opacity-50'}`}
                >
                  <td className="py-2 pr-3">
                    <span className="block font-medium text-slate-900">{item.nombre}</span>
                    <span className="block text-xs text-slate-500">{detalleDe(item)}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-500">{item.sku}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <span
                      className={
                        item.agotado
                          ? 'font-semibold text-red-700'
                          : item.bajoStock
                            ? 'font-semibold text-amber-700'
                            : ''
                      }
                    >
                      {item.stockActual}
                    </span>
                    {item.bajoStock ? (
                      <span className="ml-2 text-xs text-slate-400">
                        faltan {item.faltante}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                    {item.stockMinimo}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-600">
                    {item.costoCentavos === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <Quetzales centavos={item.costoCentavos} />
                    )}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => setViendoKardex(item)}
                      className="text-xs font-medium text-marca hover:underline"
                    >
                      Kardex
                    </button>
                    <button
                      onClick={() => setMoviendo(item)}
                      className="ml-3 text-xs font-medium text-marca hover:underline"
                    >
                      Movimiento
                    </button>
                  </td>
                </tr>
              ))}

              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No hay productos con esos filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {viendoKardex ? (
        <Kardex item={viendoKardex} alCerrar={() => setViendoKardex(null)} />
      ) : null}

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
