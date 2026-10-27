import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, apiConMeta } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import type { Ciclo } from '../api/modelos.ts';
import { BotonExportar } from '../componentes/BotonExportar.tsx';
import { Aviso, Cargando, Quetzales, Tarjeta } from '../componentes/ui.tsx';

type Reporte = {
  nota: string;
  totales: { vendidas: number; totalCentavos: number; enExistencia: number };
  data: Array<{
    bolsaId: string;
    sku: string;
    nivel: string;
    grado: string;
    anio: number;
    precioCentavos: number;
    stockActual: number;
    vendidas: number;
    totalCentavos: number;
  }>;
};

export function BolsasPorGrado() {
  const [anio, setAnio] = useState<number | null>(null);

  const ciclos = useQuery({ queryKey: ['ciclos'], queryFn: () => api<Ciclo[]>('/ciclos') });

  useEffect(() => {
    if (anio === null && ciclos.data) {
      const activo = ciclos.data.find((ciclo) => ciclo.activo) ?? ciclos.data[0];
      if (activo) setAnio(activo.anio);
    }
  }, [ciclos.data, anio]);

  const consulta = anio === null ? '' : `ciclo=${anio}`;

  const reporte = useQuery({
    queryKey: ['reporte-bolsas', anio],
    queryFn: () => apiConMeta<Reporte>(`/reportes/bolsas-por-grado?${consulta}`),
    enabled: anio !== null,
  });

  return (
    <div>
      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Ciclo</span>
            <select
              value={anio ?? ''}
              onChange={(evento) => setAnio(Number(evento.target.value))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {(ciclos.data ?? []).map((ciclo) => (
                <option key={ciclo.id} value={ciclo.anio}>
                  {ciclo.anio}
                  {ciclo.activo ? ' (en curso)' : ''}
                </option>
              ))}
            </select>
          </label>

          <BotonExportar ruta={`/reportes/bolsas-por-grado?${consulta}`} />
        </div>
      </Tarjeta>

      {reporte.isPending ? (
        <Cargando texto="Calculando..." />
      ) : reporte.isError ? (
        <Aviso tipo="error">{mensajeDeError(reporte.error)}</Aviso>
      ) : (
        <Tarjeta>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
            <p>
              {reporte.data.totales.vendidas} bolsa(s) vendida(s) ·{' '}
              {reporte.data.totales.enExistencia} en existencia
            </p>
            <p>
              Total:{' '}
              <strong className="text-azul">
                <Quetzales centavos={reporte.data.totales.totalCentavos} />
              </strong>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Grado</th>
                  <th className="py-2 pr-3">Nivel</th>
                  <th className="py-2 pr-3 text-right">Precio</th>
                  <th className="py-2 pr-3 text-right">Vendidas</th>
                  <th className="py-2 pr-3 text-right">En existencia</th>
                  <th className="py-2 text-right">Total vendido</th>
                </tr>
              </thead>
              <tbody>
                {reporte.data.data.map((fila) => (
                  <tr key={fila.bolsaId} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-900">{fila.grado}</td>
                    <td className="py-2 pr-3 text-slate-600">{fila.nivel}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                      <Quetzales centavos={fila.precioCentavos} />
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      {fila.vendidas}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fila.stockActual}</td>
                    <td className="py-2 text-right tabular-nums">
                      <Quetzales centavos={fila.totalCentavos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-500">{reporte.data.nota}</p>
        </Tarjeta>
      )}
    </div>
  );
}
