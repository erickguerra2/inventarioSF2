import { useQuery } from '@tanstack/react-query';
import { apiConMeta } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { Aviso, Boton, Cargando } from '../componentes/ui.tsx';
import { fechaHoraCorta } from '../utilidades/fechas.ts';
import type { ItemInventario } from './items.ts';

type Movimiento = {
  id: string;
  fecha: string;
  tipo: string;
  cantidad: number;
  saldoDespues: number;
  motivo: string | null;
  referencia: { tipo: string; id: string | null } | null;
  usuario: { id: string; nombre: string };
};

type RespuestaKardex = {
  item: ItemInventario;
  periodo: { saldoInicial: number; saldoFinal: number; movidoEnPeriodo: number };
  data: Movimiento[];
  meta: { total: number };
};

const NOMBRES: Record<string, string> = {
  APERTURA: 'Apertura',
  ENTRADA: 'Entrada',
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
  AJUSTE_POS: 'Ajuste +',
  AJUSTE_NEG: 'Ajuste −',
  MERMA: 'Merma',
  ANULACION_VENTA: 'Anulación de venta',
};

/**
 * El historial de un item. Es la pantalla que responde "¿y por qué hay 18 y no
 * 20?" — justo lo que un campo de stock editable no permitiria contestar.
 */
export function Kardex({ item, alCerrar }: { item: ItemInventario; alCerrar: () => void }) {
  const kardex = useQuery({
    queryKey: ['kardex', item.id],
    queryFn: () => apiConMeta<RespuestaKardex>(`/inventario/${item.id}/kardex?perPage=100`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-azul">{item.nombre}</h2>
            <p className="text-sm text-slate-500">{item.sku}</p>
          </div>
          <Boton variante="secundario" onClick={alCerrar}>
            Cerrar
          </Boton>
        </div>

        {kardex.isPending ? (
          <Cargando texto="Cargando el historial..." />
        ) : kardex.isError ? (
          <div className="mt-4">
            <Aviso tipo="error">{mensajeDeError(kardex.error)}</Aviso>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">
              {kardex.data.meta.total} movimiento(s) · saldo actual{' '}
              <strong className="text-slate-900">{kardex.data.periodo.saldoFinal}</strong>
            </p>

            <div className="mt-3 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3 text-right">Cantidad</th>
                    <th className="py-2 pr-3 text-right">Saldo</th>
                    <th className="py-2 pr-3">Motivo</th>
                    <th className="py-2">Quién</th>
                  </tr>
                </thead>
                <tbody>
                  {kardex.data.data.map((movimiento) => (
                    <tr key={movimiento.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                        {fechaHoraCorta(movimiento.fecha)}
                      </td>
                      <td className="py-2 pr-3">{NOMBRES[movimiento.tipo] ?? movimiento.tipo}</td>
                      <td
                        className={`py-2 pr-3 text-right font-medium tabular-nums ${
                          movimiento.cantidad > 0 ? 'text-marca' : 'text-red-700'
                        }`}
                      >
                        {movimiento.cantidad > 0 ? '+' : ''}
                        {movimiento.cantidad}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {movimiento.saldoDespues}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{movimiento.motivo ?? '—'}</td>
                      <td className="py-2 text-slate-600">{movimiento.usuario.nombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Cada línea dice quién la hizo y con qué saldo quedó. Nada se edita ni se borra:
              un error se corrige con otro movimiento.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
