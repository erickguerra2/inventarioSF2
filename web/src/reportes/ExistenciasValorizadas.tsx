import { useQuery } from '@tanstack/react-query';
import { apiConMeta } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { BotonExportar } from '../componentes/BotonExportar.tsx';
import { Aviso, Cargando, Quetzales, Tarjeta } from '../componentes/ui.tsx';

type Reporte = {
  totales: { items: number; unidades: number; valorCentavos: number; itemsSinCosto: number };
  advertencia: string | null;
  data: Array<{
    tipo: string;
    items: number;
    unidades: number;
    valorCentavos: number;
    itemsSinCosto: number;
    unidadesSinCosto: number;
  }>;
};

const NOMBRES: Record<string, string> = {
  UNIFORME_TALLA: 'Uniformes',
  BOLSA_UTILES: 'Bolsas de útiles',
};

export function ExistenciasValorizadas() {
  const reporte = useQuery({
    queryKey: ['reporte-existencias'],
    queryFn: () => apiConMeta<Reporte>('/reportes/existencias-valorizadas'),
  });

  if (reporte.isPending) return <Cargando texto="Calculando..." />;
  if (reporte.isError) return <Aviso tipo="error">{mensajeDeError(reporte.error)}</Aviso>;

  return (
    <div>
      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">Valor del inventario al costo</p>
            <p className="mt-1 text-3xl font-semibold text-azul">
              <Quetzales centavos={reporte.data.totales.valorCentavos} />
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {reporte.data.totales.unidades} unidad(es) en {reporte.data.totales.items}{' '}
              producto(s)
            </p>
          </div>
          <BotonExportar ruta="/reportes/existencias-valorizadas" />
        </div>
      </Tarjeta>

      {/* El backend avisa cuando el total es un piso y no el valor real.
          Esconderlo haria que alguien lea ese numero como si fuera exacto. */}
      {reporte.data.advertencia ? (
        <div className="mb-5">
          <Aviso tipo="error">{reporte.data.advertencia}</Aviso>
        </div>
      ) : null}

      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3 text-right">Productos</th>
                <th className="py-2 pr-3 text-right">Unidades</th>
                <th className="py-2 pr-3 text-right">Valor</th>
                <th className="py-2 text-right">Sin costo</th>
              </tr>
            </thead>
            <tbody>
              {reporte.data.data.map((fila) => (
                <tr key={fila.tipo} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-900">
                    {NOMBRES[fila.tipo] ?? fila.tipo}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fila.items}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fila.unidades}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <Quetzales centavos={fila.valorCentavos} />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fila.itemsSinCosto > 0 ? (
                      <span className="text-amber-700">
                        {fila.itemsSinCosto} producto(s), {fila.unidadesSinCosto} unidad(es)
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Para que un producto cuente en esta suma hay que registrarle el costo desde
          Uniformes o Bolsas.
        </p>
      </Tarjeta>
    </div>
  );
}
