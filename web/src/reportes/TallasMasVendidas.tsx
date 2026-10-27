import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiConMeta } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { BotonExportar } from '../componentes/BotonExportar.tsx';
import { FiltroFechas, rangoDelMes, type Rango } from '../componentes/FiltroFechas.tsx';
import { Aviso, Cargando, Quetzales, Tarjeta } from '../componentes/ui.tsx';

type Reporte = {
  nota: string;
  data: Array<{
    itemId: string;
    sku: string;
    prenda: string;
    talla: string;
    unidades: number;
    totalCentavos: number;
    stockActual: number;
  }>;
};

export function TallasMasVendidas() {
  const [rango, setRango] = useState<Rango>(rangoDelMes());
  const consulta = `desde=${rango.desde}&hasta=${rango.hasta}&limite=50`;

  const reporte = useQuery({
    queryKey: ['reporte-tallas', rango],
    queryFn: () => apiConMeta<Reporte>(`/reportes/tallas-mas-vendidas?${consulta}`),
  });

  return (
    <div>
      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FiltroFechas rango={rango} alCambiar={setRango} />
          <BotonExportar ruta={`/reportes/tallas-mas-vendidas?${consulta}`} />
        </div>
      </Tarjeta>

      {reporte.isPending ? (
        <Cargando texto="Calculando..." />
      ) : reporte.isError ? (
        <Aviso tipo="error">{mensajeDeError(reporte.error)}</Aviso>
      ) : (
        <Tarjeta>
          <Aviso>{reporte.data.nota}</Aviso>

          {reporte.data.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No se vendieron uniformes en ese período.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Prenda</th>
                    <th className="py-2 pr-3">Talla</th>
                    <th className="py-2 pr-3 text-right">Vendidas</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 text-right">Hay hoy</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.data.data.map((fila) => (
                    <tr key={fila.itemId} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-900">{fila.prenda}</td>
                      <td className="py-2 pr-3">{fila.talla}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                        {fila.unidades}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                        <Quetzales centavos={fila.totalCentavos} />
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        <span className={fila.stockActual === 0 ? 'font-semibold text-red-700' : ''}>
                          {fila.stockActual}
                        </span>
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
