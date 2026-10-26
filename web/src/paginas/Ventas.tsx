import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, apiConMeta } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import type { EstadoVenta, ListadoVentas, Venta } from '../api/modelos.ts';
import { Recibo } from '../componentes/Recibo.tsx';
import {
  Aviso,
  Boton,
  Cargando,
  Modal,
  Quetzales,
  Tarjeta,
  Titulo,
} from '../componentes/ui.tsx';
import { esAdmin, useSesion } from '../sesion/sesion.ts';
import { fechaHoraCorta, haceDiasISO, hoyISO, primerDiaDelMesISO } from '../utilidades/fechas.ts';

type Filtros = { desde: string; hasta: string; estado: '' | EstadoVenta };

export function Ventas() {
  const { usuario } = useSesion();
  const administradora = esAdmin(usuario);
  const clienteConsultas = useQueryClient();

  const [filtros, setFiltros] = useState<Filtros>({
    desde: hoyISO(),
    hasta: hoyISO(),
    estado: '',
  });
  const [pagina, setPagina] = useState(1);
  const [reciboDe, setReciboDe] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<Venta | null>(null);
  const [motivo, setMotivo] = useState('');

  function cambiarFiltros(cambios: Partial<Filtros>) {
    setFiltros((actuales) => ({ ...actuales, ...cambios }));
    setPagina(1); // un filtro nuevo siempre arranca en la primera pagina
  }

  const parametros = new URLSearchParams({
    desde: filtros.desde,
    hasta: filtros.hasta,
    page: String(pagina),
    perPage: '20',
  });
  if (filtros.estado) parametros.set('estado', filtros.estado);

  const ventas = useQuery({
    queryKey: ['ventas', filtros, pagina],
    queryFn: () => apiConMeta<ListadoVentas>(`/ventas?${parametros.toString()}`),
  });

  const anular = useMutation({
    mutationFn: ({ id, motivo: razon }: { id: string; motivo: string }) =>
      api(`/ventas/${id}/anular`, { method: 'POST', body: { motivo: razon } }),
    onSuccess: () => {
      setAnulando(null);
      setMotivo('');
      // La anulacion devuelve el stock y cambia el corte del dia.
      void clienteConsultas.invalidateQueries({ queryKey: ['ventas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['corte-caja'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['prendas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['bolsas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['alertas'] });
    },
  });

  const soloSuyas = ventas.data?.resumen.incluyeSoloSusVentas ?? !administradora;

  return (
    <div>
      <Titulo
        ayuda={
          soloSuyas
            ? 'Solo aparecen las ventas que usted registró.'
            : 'Todas las ventas, de todas las maestras.'
        }
      >
        {soloSuyas ? 'Mis ventas' : 'Ventas'}
      </Titulo>

      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Desde</span>
            <input
              type="date"
              value={filtros.desde}
              max={filtros.hasta}
              onChange={(evento) => cambiarFiltros({ desde: evento.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Hasta</span>
            <input
              type="date"
              value={filtros.hasta}
              min={filtros.desde}
              onChange={(evento) => cambiarFiltros({ hasta: evento.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Estado</span>
            <select
              value={filtros.estado}
              onChange={(evento) =>
                cambiarFiltros({ estado: evento.target.value as Filtros['estado'] })
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              <option value="PAGADA">Pagadas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </label>

          <div className="flex gap-2">
            <Boton
              variante="secundario"
              onClick={() => cambiarFiltros({ desde: hoyISO(), hasta: hoyISO() })}
            >
              Hoy
            </Boton>
            <Boton
              variante="secundario"
              onClick={() => cambiarFiltros({ desde: haceDiasISO(7), hasta: hoyISO() })}
            >
              7 días
            </Boton>
            <Boton
              variante="secundario"
              onClick={() => cambiarFiltros({ desde: primerDiaDelMesISO(), hasta: hoyISO() })}
            >
              Este mes
            </Boton>
          </div>
        </div>
      </Tarjeta>

      {ventas.isPending ? (
        <Cargando texto="Buscando ventas..." />
      ) : ventas.isError ? (
        <Aviso tipo="error">{mensajeDeError(ventas.error)}</Aviso>
      ) : (
        <Tarjeta>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-600">
              {ventas.data.meta.total} venta(s) en el período
            </p>
            <p className="text-sm text-slate-600">
              Cobrado:{' '}
              <strong className="text-azul">
                <Quetzales centavos={ventas.data.resumen.totalCobradoCentavos} />
              </strong>
              <span className="ml-1 text-xs text-slate-400">(sin contar anuladas)</span>
            </p>
          </div>

          {ventas.data.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No hay ventas en esas fechas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">No.</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Comprador</th>
                    {administradora ? <th className="py-2 pr-3">Vendió</th> : null}
                    <th className="py-2 pr-3">Pago</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ventas.data.data.map((venta) => (
                    <tr
                      key={venta.id}
                      className={`border-b border-slate-100 ${
                        venta.estado === 'ANULADA' ? 'text-slate-400' : ''
                      }`}
                    >
                      <td className="py-3 pr-3 tabular-nums">{venta.correlativo}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {fechaHoraCorta(venta.creadoEn)}
                      </td>
                      <td className="py-3 pr-3">
                        {venta.comprador?.nombre ?? (
                          <span className="text-slate-400">Venta al público</span>
                        )}
                      </td>
                      {administradora ? (
                        <td className="py-3 pr-3">{venta.vendidoPor.nombre}</td>
                      ) : null}
                      <td className="py-3 pr-3 text-xs">{venta.metodoPago}</td>
                      <td className="py-3 pr-3 text-right">
                        <Quetzales centavos={venta.totalCentavos} />
                        {venta.estado === 'ANULADA' ? (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                            anulada
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setReciboDe(venta.id)}
                          className="text-xs font-medium text-marca hover:underline"
                        >
                          Recibo
                        </button>
                        {administradora && venta.estado === 'PAGADA' ? (
                          <button
                            onClick={() => {
                              setAnulando(venta);
                              setMotivo('');
                              anular.reset();
                            }}
                            className="ml-3 text-xs font-medium text-red-700 hover:underline"
                          >
                            Anular
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ventas.data.meta.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <Boton
                variante="secundario"
                disabled={pagina <= 1}
                onClick={() => setPagina((actual) => actual - 1)}
              >
                Anterior
              </Boton>
              <span className="text-sm text-slate-600">
                Página {ventas.data.meta.page} de {ventas.data.meta.totalPages}
              </span>
              <Boton
                variante="secundario"
                disabled={pagina >= ventas.data.meta.totalPages}
                onClick={() => setPagina((actual) => actual + 1)}
              >
                Siguiente
              </Boton>
            </div>
          ) : null}
        </Tarjeta>
      )}

      {reciboDe ? <Recibo ventaId={reciboDe} alCerrar={() => setReciboDe(null)} /> : null}

      {anulando ? (
        <Modal titulo={`Anular la venta No. ${anulando.correlativo}`} alCerrar={() => setAnulando(null)}>
          <p className="text-sm text-slate-600">
            Se devuelven{' '}
            <strong>
              <Quetzales centavos={anulando.totalCentavos} />
            </strong>{' '}
            al inventario. La venta no se borra: queda marcada como anulada, con su motivo.
          </p>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Motivo (obligatorio)
            </span>
            <input
              autoFocus
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Por qué se anula"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          {anular.error ? (
            <div className="mt-3">
              <Aviso tipo="error">{mensajeDeError(anular.error)}</Aviso>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-3">
            <Boton variante="secundario" onClick={() => setAnulando(null)}>
              Cancelar
            </Boton>
            <Boton
              onClick={() => anular.mutate({ id: anulando.id, motivo: motivo.trim() })}
              disabled={motivo.trim().length === 0 || anular.isPending}
            >
              {anular.isPending ? 'Anulando...' : 'Anular la venta'}
            </Boton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
