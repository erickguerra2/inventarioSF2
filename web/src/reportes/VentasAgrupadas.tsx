import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiConMeta } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { BotonExportar } from '../componentes/BotonExportar.tsx';
import { FiltroFechas, rangoDelMes, type Rango } from '../componentes/FiltroFechas.tsx';
import { Aviso, Cargando, Quetzales, Tarjeta } from '../componentes/ui.tsx';

type Agrupar = 'dia' | 'usuario' | 'tipo' | 'grado';

type Reporte = {
  agrupadoPor: Agrupar;
  totales: { ventas: number; totalCentavos: number };
  notas: string[];
  data: Array<{
    clave: string;
    etiqueta: string;
    ventas: number;
    unidades: number;
    totalCentavos: number;
  }>;
};

const AGRUPACIONES: Array<{ valor: Agrupar; texto: string }> = [
  { valor: 'dia', texto: 'Por día' },
  { valor: 'usuario', texto: 'Por maestra' },
  { valor: 'tipo', texto: 'Por tipo' },
  { valor: 'grado', texto: 'Por grado' },
];

export function VentasAgrupadas() {
  const [rango, setRango] = useState<Rango>(rangoDelMes());
  const [agrupar, setAgrupar] = useState<Agrupar>('dia');

  const consulta = `desde=${rango.desde}&hasta=${rango.hasta}&agrupar=${agrupar}`;

  const reporte = useQuery({
    queryKey: ['reporte-ventas', rango, agrupar],
    queryFn: () => apiConMeta<Reporte>(`/reportes/ventas?${consulta}`),
  });

  return (
    <div>
      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <FiltroFechas rango={rango} alCambiar={setRango} />

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Agrupar</span>
              <select
                value={agrupar}
                onChange={(evento) => setAgrupar(evento.target.value as Agrupar)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {AGRUPACIONES.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.texto}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <BotonExportar ruta={`/reportes/ventas?${consulta}`} />
        </div>
      </Tarjeta>

      {reporte.isPending ? (
        <Cargando texto="Calculando..." />
      ) : reporte.isError ? (
        <Aviso tipo="error">{mensajeDeError(reporte.error)}</Aviso>
      ) : (
        <Tarjeta>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
            <p>{reporte.data.totales.ventas} venta(s) en el período</p>
            <p>
              Total:{' '}
              <strong className="text-azul">
                <Quetzales centavos={reporte.data.totales.totalCentavos} />
              </strong>
            </p>
          </div>

          {/* Las notas vienen del backend y explican como leer los numeros.
              Esconderlas haria que alguien cuadre este reporte contra el corte
              de caja y no le de. */}
          {reporte.data.notas.length > 0 ? (
            <div className="mb-4 space-y-2">
              {reporte.data.notas.map((nota) => (
                <Aviso key={nota}>{nota}</Aviso>
              ))}
            </div>
          ) : null}

          {reporte.data.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No hubo ventas en ese período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">
                      {agrupar === 'dia'
                        ? 'Día'
                        : agrupar === 'usuario'
                          ? 'Maestra'
                          : agrupar === 'tipo'
                            ? 'Tipo'
                            : 'Grado'}
                    </th>
                    <th className="py-2 pr-3 text-right">Ventas</th>
                    <th className="py-2 pr-3 text-right">Unidades</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.data.data.map((fila) => (
                    <tr key={fila.clave} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-900">{fila.etiqueta}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fila.ventas}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                        {fila.unidades || '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        <Quetzales centavos={fila.totalCentavos} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
