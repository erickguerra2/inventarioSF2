import { useQuery } from '@tanstack/react-query';
import { api } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { Aviso, Boton, Cargando, Quetzales } from './ui.tsx';

type DatosRecibo = {
  correlativo: number;
  estado: 'PAGADA' | 'ANULADA';
  fecha: string;
  comprador: string;
  atendidoPor: string;
  metodoPago: string;
  referenciaPago: string | null;
  lineas: Array<{
    cantidad: number;
    descripcion: string;
    precioUnitCentavos: number;
    totalCentavos: number;
  }>;
  subtotalCentavos: number;
  descuentoCentavos: number;
  totalCentavos: number;
  anulacion: { en: string; motivo: string; por: string | null } | null;
};

const METODOS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  DEPOSITO: 'Depósito',
  TARJETA: 'Tarjeta',
};

/**
 * El recibo se imprime con el navegador (`window.print()`), no se genera un PDF.
 * El CSS de impresion en index.css deja visible solo `#recibo-impresion`.
 */
export function Recibo({ ventaId, alCerrar }: { ventaId: string; alCerrar: () => void }) {
  const recibo = useQuery({
    queryKey: ['recibo', ventaId],
    queryFn: () => api<DatosRecibo>(`/ventas/${ventaId}/recibo`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-md">
        <div id="recibo-impresion" className="rounded-lg bg-white p-6 shadow-lg">
          {recibo.isPending ? (
            <Cargando texto="Preparando el recibo..." />
          ) : recibo.isError ? (
            <Aviso tipo="error">{mensajeDeError(recibo.error)}</Aviso>
          ) : (
            <>
              <div className="border-b border-slate-200 pb-4 text-center">
                <img
                  src="/logo.jpg"
                  alt=""
                  className="mx-auto h-16 w-16 object-contain"
                />
                <p className="mt-2 text-sm font-semibold text-azul">
                  Centro Cultural Sagrada Familia 2
                </p>
                <p className="text-xs text-slate-500">Uniformes y bolsas de útiles</p>
              </div>

              <div className="flex items-baseline justify-between pt-4">
                <p className="text-lg font-semibold text-azul">
                  Recibo No. {recibo.data.correlativo}
                </p>
                {recibo.data.estado === 'ANULADA' ? (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                    ANULADA
                  </span>
                ) : null}
              </div>

              <dl className="mt-3 space-y-1 text-sm text-slate-600">
                <div className="flex justify-between">
                  <dt>Fecha</dt>
                  <dd>{new Date(recibo.data.fecha).toLocaleString('es-GT')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Comprador</dt>
                  <dd className="text-right">{recibo.data.comprador}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Atendió</dt>
                  <dd className="text-right">{recibo.data.atendidoPor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Pago</dt>
                  <dd>
                    {METODOS[recibo.data.metodoPago] ?? recibo.data.metodoPago}
                    {recibo.data.referenciaPago ? ` · ${recibo.data.referenciaPago}` : ''}
                  </dd>
                </div>
              </dl>

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="pb-1">Cant.</th>
                    <th className="pb-1">Descripción</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recibo.data.lineas.map((linea, indice) => (
                    <tr key={indice} className="border-b border-slate-100 align-top">
                      <td className="py-2 tabular-nums">{linea.cantidad}</td>
                      <td className="py-2">
                        {linea.descripcion}
                        <span className="block text-xs text-slate-500">
                          <Quetzales centavos={linea.precioUnitCentavos} /> c/u
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Quetzales centavos={linea.totalCentavos} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <Quetzales centavos={recibo.data.subtotalCentavos} />
                </div>
                {recibo.data.descuentoCentavos > 0 ? (
                  <div className="flex justify-between text-slate-600">
                    <span>Descuento</span>
                    <span>
                      − <Quetzales centavos={recibo.data.descuentoCentavos} />
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-azul">
                  <span>Total</span>
                  <Quetzales centavos={recibo.data.totalCentavos} />
                </div>
              </div>

              {recibo.data.anulacion ? (
                <p className="mt-4 text-xs text-red-700">
                  Anulada por {recibo.data.anulacion.por}: {recibo.data.anulacion.motivo}
                </p>
              ) : null}

              <p className="mt-6 text-center text-xs text-slate-400">
                Gracias por su compra
              </p>
            </>
          )}
        </div>

        <div className="no-imprimir mt-4 flex justify-end gap-3">
          <Boton variante="secundario" onClick={alCerrar}>
            Cerrar
          </Boton>
          <Boton onClick={() => window.print()} disabled={recibo.isPending}>
            Imprimir
          </Boton>
        </div>
      </div>
    </div>
  );
}
