import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { Aviso, Boton, Cargando, Tarjeta } from '../componentes/ui.tsx';
import { BuscadorItems } from './BuscadorItems.tsx';
import {
  detalleDe,
  refrescarInventario,
  useItemsInventario,
  type ItemInventario,
} from './items.ts';

type LineaConteo = { item: ItemInventario; contado: string };

type Resultado = {
  conteoId: string;
  motivo: string;
  resumen: {
    itemsContados: number;
    itemsConDiferencia: number;
    unidadesFaltantes: number;
    unidadesSobrantes: number;
  };
  lineas: Array<{
    sku: string;
    nombre: string;
    enSistema: number;
    contado: number;
    diferencia: number;
  }>;
};

/**
 * Conteo fisico. La pantalla muestra las tres columnas ANTES de guardar —
 * sistema, contado, diferencia — porque el valor del conteo esta justamente en
 * ver la diferencia, no en corregir el numero en silencio.
 *
 * El backend registra cada diferencia como un ajuste con motivo, asi que el
 * faltante queda documentado en vez de desaparecer.
 */
export function Conteo() {
  const clienteConsultas = useQueryClient();
  const { items, cargando, error } = useItemsInventario();

  const [lineas, setLineas] = useState<LineaConteo[]>([]);
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const registrar = useMutation({
    mutationFn: () =>
      api<Resultado>('/inventario/conteos', {
        method: 'POST',
        body: {
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
          lineas: lineas.map((linea) => ({
            itemId: linea.item.id,
            contado: Number.parseInt(linea.contado, 10) || 0,
          })),
        },
      }),
    onSuccess: (datos) => {
      setResultado(datos);
      setLineas([]);
      setMotivo('');
      refrescarInventario(clienteConsultas);
    },
  });

  if (cargando) return <Cargando texto="Cargando el inventario..." />;
  if (error) return <Aviso tipo="error">{mensajeDeError(error)}</Aviso>;

  const conDiferencia = lineas.filter(
    (linea) => (Number.parseInt(linea.contado, 10) || 0) !== linea.item.stockActual,
  );

  return (
    <div>
      <Aviso>
        Escriba lo que <strong>contó en la bodega</strong>. Lo que no cuadre se registra como
        un ajuste con motivo, no se corrige en silencio.
      </Aviso>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Tarjeta>
            <h2 className="mb-3 font-semibold text-azul">Qué se contó</h2>

            <BuscadorItems
              items={items.filter((item) => item.activo)}
              yaElegidos={new Set(lineas.map((linea) => linea.item.id))}
              alElegir={(item) =>
                setLineas((actuales) => [
                  ...actuales,
                  { item, contado: String(item.stockActual) },
                ])
              }
            />

            {lineas.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="py-2 pr-3">Producto</th>
                      <th className="py-2 pr-3 text-right">Sistema</th>
                      <th className="py-2 pr-3 text-right">Contado</th>
                      <th className="py-2 pr-3 text-right">Diferencia</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((linea, indice) => {
                      const contado = Number.parseInt(linea.contado, 10);
                      const valido = Number.isFinite(contado) && contado >= 0;
                      const diferencia = valido ? contado - linea.item.stockActual : 0;

                      return (
                        <tr key={linea.item.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3">
                            <span className="block font-medium text-slate-900">
                              {linea.item.nombre}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {detalleDe(linea.item)}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                            {linea.item.stockActual}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <input
                              value={linea.contado}
                              inputMode="numeric"
                              onChange={(evento) =>
                                setLineas((actuales) =>
                                  actuales.map((otra, i) =>
                                    i === indice ? { ...otra, contado: evento.target.value } : otra,
                                  ),
                                )
                              }
                              className={`w-20 rounded border px-2 py-1.5 text-center text-sm tabular-nums ${
                                valido ? 'border-slate-300' : 'border-red-400'
                              }`}
                              aria-label={`Contado de ${linea.item.nombre}`}
                            />
                          </td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">
                            {diferencia === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span className={diferencia < 0 ? 'text-red-700' : 'text-marca'}>
                                {diferencia > 0 ? '+' : ''}
                                {diferencia}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() =>
                                setLineas((actuales) => actuales.filter((_, i) => i !== indice))
                              }
                              className="text-xs text-slate-400 hover:text-red-700"
                              aria-label={`Quitar ${linea.item.nombre}`}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                Busque un producto y agréguelo. Arranca con lo que dice el sistema; cambie
                solo lo que no cuadre.
              </p>
            )}
          </Tarjeta>
        </div>

        <div className="lg:col-span-2">
          <Tarjeta>
            <h2 className="mb-3 font-semibold text-azul">Guardar el conteo</h2>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Motivo <span className="font-normal text-slate-400">(opcional)</span>
              </span>
              <input
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="Conteo físico de bodega"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <dl className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Productos contados</dt>
                <dd className="tabular-nums">{lineas.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Con diferencia</dt>
                <dd
                  className={`tabular-nums ${
                    conDiferencia.length > 0 ? 'font-semibold text-amber-700' : ''
                  }`}
                >
                  {conDiferencia.length}
                </dd>
              </div>
            </dl>

            {registrar.error ? (
              <div className="mt-3">
                <Aviso tipo="error">{mensajeDeError(registrar.error)}</Aviso>
              </div>
            ) : null}

            <Boton
              onClick={() => registrar.mutate()}
              disabled={lineas.length === 0 || registrar.isPending}
              className="mt-4 w-full py-3 text-base"
            >
              {registrar.isPending ? 'Guardando...' : 'Guardar el conteo'}
            </Boton>

            <p className="mt-2 text-xs text-slate-500">
              Los productos que cuadren no generan ningún movimiento.
            </p>
          </Tarjeta>

          {resultado ? (
            <div className="mt-4">
              <Tarjeta>
                <h3 className="font-semibold text-marca">Conteo guardado</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {resultado.resumen.itemsContados} contado(s),{' '}
                  {resultado.resumen.itemsConDiferencia} con diferencia.
                </p>
                {resultado.resumen.itemsConDiferencia > 0 ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Faltaron {resultado.resumen.unidadesFaltantes}, sobraron{' '}
                    {resultado.resumen.unidadesSobrantes}.
                  </p>
                ) : null}

                <ul className="mt-3 space-y-1 text-sm">
                  {resultado.lineas
                    .filter((linea) => linea.diferencia !== 0)
                    .map((linea) => (
                      <li key={linea.sku} className="flex justify-between gap-2">
                        <span className="truncate text-slate-700">{linea.nombre}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">
                          {linea.enSistema} → {linea.contado}
                        </span>
                      </li>
                    ))}
                </ul>
              </Tarjeta>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
