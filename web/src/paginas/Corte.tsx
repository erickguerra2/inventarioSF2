import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import type { CorteDeCaja, MetodoPago } from '../api/modelos.ts';
import { Aviso, Cargando, Quetzales, Tarjeta, Titulo } from '../componentes/ui.tsx';
import { fechaLarga, hoyISO } from '../utilidades/fechas.ts';

const METODOS: Array<{ valor: MetodoPago; texto: string }> = [
  { valor: 'EFECTIVO', texto: 'Efectivo' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
  { valor: 'DEPOSITO', texto: 'Depósito' },
  { valor: 'TARJETA', texto: 'Tarjeta' },
];

/**
 * Solo se muestran las columnas de los metodos que tuvieron movimiento ese dia,
 * mas el efectivo, que siempre importa porque es lo que hay que entregar en mano.
 * En el colegio se cobra casi todo en efectivo o transferencia: dejar cuatro
 * columnas fijas llenaba la tabla de guiones.
 */
function metodosConMovimiento(corte: CorteDeCaja): typeof METODOS {
  return METODOS.filter(
    (metodo) => metodo.valor === 'EFECTIVO' || (corte.porMetodo[metodo.valor] ?? 0) > 0,
  );
}

export function Corte() {
  const [fecha, setFecha] = useState(hoyISO());

  const corte = useQuery({
    queryKey: ['corte-caja', fecha],
    queryFn: () => api<CorteDeCaja>(`/reportes/corte-caja?fecha=${fecha}`),
  });

  const soloSuyo = corte.data?.alcance === 'SOLO_MIS_VENTAS';
  const columnas = corte.data ? metodosConMovimiento(corte.data) : METODOS;

  return (
    <div>
      <Titulo
        ayuda={
          soloSuyo
            ? 'Lo que usted cobró, y cuánto efectivo tiene que entregar.'
            : 'Lo cobrado en el día, por maestra y por método de pago.'
        }
      >
        {soloSuyo ? 'Mi corte de caja' : 'Corte de caja'}
      </Titulo>

      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Día</span>
            <input
              type="date"
              value={fecha}
              max={hoyISO()}
              onChange={(evento) => setFecha(evento.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <a
            href={`/api/v1/reportes/corte-caja?fecha=${fecha}&formato=csv`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Exportar a Excel
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-500">{fechaLarga(fecha)}</p>
      </Tarjeta>

      {corte.isPending ? (
        <Cargando texto="Calculando el corte..." />
      ) : corte.isError ? (
        <Aviso tipo="error">{mensajeDeError(corte.error)}</Aviso>
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Tarjeta>
              <p className="text-sm font-medium text-slate-500">Cobrado</p>
              <p className="mt-2 text-3xl font-semibold text-azul">
                <Quetzales centavos={corte.data.totales.cobradoCentavos} />
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {corte.data.totales.ventas} venta(s)
              </p>
            </Tarjeta>

            {/* El numero que de verdad importa al final del dia. */}
            <Tarjeta className="border-marca/40 bg-marca/5">
              <p className="text-sm font-medium text-slate-600">A entregar en efectivo</p>
              <p className="mt-2 text-3xl font-semibold text-marca">
                <Quetzales centavos={corte.data.totales.efectivoCentavos} />
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Lo que entró por transferencia ya está en el banco.
              </p>
            </Tarjeta>

            <Tarjeta>
              <p className="text-sm font-medium text-slate-500">Anuladas</p>
              <p className="mt-2 text-3xl font-semibold text-slate-700">
                {corte.data.totales.anuladas}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                <Quetzales centavos={corte.data.totales.anuladoCentavos} /> que no se cobraron
              </p>
            </Tarjeta>
          </div>

          <Tarjeta>
            <h2 className="mb-3 font-semibold text-azul">
              {soloSuyo ? 'Mi desglose' : 'Por maestra'}
            </h2>

            {corte.data.porMaestra.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No hubo ventas cobradas este día.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="py-2 pr-3">Quién</th>
                      <th className="py-2 pr-3 text-right">Ventas</th>
                      {columnas.map((metodo) => (
                        <th key={metodo.valor} className="py-2 pr-3 text-right">
                          {metodo.texto}
                        </th>
                      ))}
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 text-right">A entregar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corte.data.porMaestra.map((fila) => (
                      <tr key={fila.usuarioId} className="border-b border-slate-100">
                        <td className="py-3 pr-3">
                          <span className="font-medium text-slate-900">{fila.nombre}</span>
                          <span className="block text-xs text-slate-500">{fila.usuario}</span>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">{fila.ventas}</td>
                        {columnas.map((metodo) => (
                          <td key={metodo.valor} className="py-3 pr-3 text-right text-slate-600">
                            {fila.porMetodo[metodo.valor] ? (
                              <Quetzales centavos={fila.porMetodo[metodo.valor] ?? 0} />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        ))}
                        <td className="py-3 pr-3 text-right font-medium">
                          <Quetzales centavos={fila.cobradoCentavos} />
                        </td>
                        <td className="py-3 text-right font-semibold text-marca">
                          <Quetzales centavos={fila.aEntregarEnEfectivoCentavos} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-500">
              Las ventas anuladas no suman al cobrado; se cuentan aparte para que los números
              se puedan explicar.
            </p>
          </Tarjeta>
        </>
      )}
    </div>
  );
}
