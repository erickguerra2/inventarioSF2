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

type Linea = { item: ItemInventario; cantidad: number };

type Resultado = {
  tipo: string;
  motivo: string;
  totalUnidades: number;
  lineas: Array<{ sku: string | null; nombre: string | null; ingresado: number; saldoDespues: number }>;
};

/**
 * "Entraron 25 bolsas de 4to primaria y 12 polos M". Es la pantalla que mas usa
 * la administradora, asi que todo el flujo es: buscar, Enter, cantidad, repetir,
 * guardar. Una sola transaccion en el backend: o entran todas las lineas o
 * ninguna.
 */
export function Entradas() {
  const clienteConsultas = useQueryClient();
  const { items, cargando, error } = useItemsInventario();

  const [lineas, setLineas] = useState<Linea[]>([]);
  const [motivo, setMotivo] = useState('');
  const [tipo, setTipo] = useState<'ENTRADA' | 'APERTURA'>('ENTRADA');
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const registrar = useMutation({
    mutationFn: () =>
      api<Resultado>('/inventario/entradas', {
        method: 'POST',
        body: {
          motivo: motivo.trim(),
          tipo,
          lineas: lineas.map((linea) => ({ itemId: linea.item.id, cantidad: linea.cantidad })),
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

  const totalUnidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  const puedeGuardar = lineas.length > 0 && motivo.trim().length > 0 && !registrar.isPending;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <Tarjeta>
          <h2 className="mb-3 font-semibold text-azul">Qué entró</h2>

          <BuscadorItems
            items={items.filter((item) => item.activo)}
            yaElegidos={new Set(lineas.map((linea) => linea.item.id))}
            alElegir={(item) => setLineas((actuales) => [...actuales, { item, cantidad: 1 }])}
          />

          {lineas.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {lineas.map((linea, indice) => (
                <li key={linea.item.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 grow">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {linea.item.nombre}
                    </p>
                    <p className="text-xs text-slate-500">
                      {detalleDe(linea.item)} · hoy hay {linea.item.stockActual}
                    </p>
                  </div>

                  <input
                    value={linea.cantidad}
                    inputMode="numeric"
                    onChange={(evento) => {
                      const cantidad = Number.parseInt(evento.target.value, 10);
                      setLineas((actuales) =>
                        actuales.map((otra, i) =>
                          i === indice
                            ? { ...otra, cantidad: Number.isFinite(cantidad) ? cantidad : 1 }
                            : otra,
                        ),
                      );
                    }}
                    className="w-20 rounded border border-slate-300 px-2 py-1.5 text-center text-sm tabular-nums"
                    aria-label={`Cantidad de ${linea.item.nombre}`}
                  />

                  <button
                    onClick={() =>
                      setLineas((actuales) => actuales.filter((_, i) => i !== indice))
                    }
                    className="text-xs text-slate-400 hover:text-red-700"
                    aria-label={`Quitar ${linea.item.nombre}`}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              Busque un producto y agréguelo. Enter agrega el primer resultado.
            </p>
          )}
        </Tarjeta>
      </div>

      <div className="lg:col-span-2">
        <Tarjeta>
          <h2 className="mb-3 font-semibold text-azul">De dónde viene</h2>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Motivo <span className="text-red-700">(obligatorio)</span>
            </span>
            <input
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Compra a proveedor, factura 1182"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Queda escrito en cada movimiento. Dentro de seis meses es lo único que explica
              de dónde salieron estas unidades.
            </span>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Tipo</span>
            <select
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as 'ENTRADA' | 'APERTURA')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ENTRADA">Entrada normal</option>
              <option value="APERTURA">Carga inicial del inventario</option>
            </select>
          </label>

          <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
            {lineas.length} producto(s) · <strong>{totalUnidades}</strong> unidad(es)
          </p>

          {registrar.error ? (
            <div className="mt-3">
              <Aviso tipo="error">{mensajeDeError(registrar.error)}</Aviso>
            </div>
          ) : null}

          <Boton
            onClick={() => registrar.mutate()}
            disabled={!puedeGuardar}
            className="mt-4 w-full py-3 text-base"
          >
            {registrar.isPending ? 'Registrando...' : 'Registrar la entrada'}
          </Boton>
        </Tarjeta>

        {resultado ? (
          <div className="mt-4">
            <Tarjeta>
              <h3 className="font-semibold text-marca">Entrada registrada</h3>
              <p className="mt-1 text-sm text-slate-600">
                {resultado.totalUnidades} unidad(es) · {resultado.motivo}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {resultado.lineas.map((linea) => (
                  <li key={linea.sku} className="flex justify-between gap-2">
                    <span className="truncate text-slate-700">{linea.nombre}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      +{linea.ingresado} → {linea.saldoDespues}
                    </span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          </div>
        ) : null}
      </div>
    </div>
  );
}
