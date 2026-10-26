import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import { Aviso, Boton, Modal } from '../componentes/ui.tsx';
import type { ItemInventario } from './items.ts';

/**
 * La cantidad va SIEMPRE positiva y el tipo define si entra o sale: asi no
 * existe el caso absurdo de un "ajuste positivo de −5". Es la misma regla que
 * impone el backend.
 */
const TIPOS = [
  { valor: 'ENTRADA', texto: 'Entrada (compra, donación)', signo: 1, exigeMotivo: false },
  { valor: 'DEVOLUCION', texto: 'Devolución (regresa al inventario)', signo: 1, exigeMotivo: false },
  { valor: 'AJUSTE_POS', texto: 'Ajuste: había de más', signo: 1, exigeMotivo: true },
  { valor: 'AJUSTE_NEG', texto: 'Ajuste: había de menos', signo: -1, exigeMotivo: true },
  { valor: 'MERMA', texto: 'Merma (daño, pérdida)', signo: -1, exigeMotivo: true },
] as const;

export function MovimientoManual({
  item,
  alCerrar,
  alGuardar,
}: {
  item: ItemInventario;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['valor']>('ENTRADA');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');

  const definicion = TIPOS.find((candidato) => candidato.valor === tipo) ?? TIPOS[0];
  const unidades = Number.parseInt(cantidad, 10);
  const valida = Number.isFinite(unidades) && unidades >= 1;
  const saldoResultante = item.stockActual + (valida ? unidades * definicion.signo : 0);

  const registrar = useMutation({
    mutationFn: () =>
      api(`/inventario/${item.id}/movimientos`, {
        method: 'POST',
        body: {
          cantidad: unidades,
          tipo,
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        },
      }),
    onSuccess: alGuardar,
  });

  const faltaMotivo = definicion.exigeMotivo && motivo.trim().length === 0;
  const dejariaNegativo = saldoResultante < 0;

  return (
    <Modal titulo={`Movimiento · ${item.nombre}`} alCerrar={alCerrar}>
      <p className="text-sm text-slate-600">
        Hoy hay <strong>{item.stockActual}</strong> en existencia.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Qué pasó</span>
          <select
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value as typeof tipo)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {TIPOS.map((candidato) => (
              <option key={candidato.valor} value={candidato.valor}>
                {candidato.texto}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Cuántas unidades</span>
          <input
            autoFocus
            value={cantidad}
            inputMode="numeric"
            onChange={(evento) => setCantidad(evento.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Motivo{' '}
            {definicion.exigeMotivo ? (
              <span className="text-red-700">(obligatorio)</span>
            ) : (
              <span className="font-normal text-slate-400">(opcional)</span>
            )}
          </span>
          <input
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            placeholder={
              definicion.exigeMotivo ? 'Por qué cambia' : 'Compra a proveedor, factura 1182'
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {definicion.exigeMotivo ? (
            <span className="mt-1 block text-xs text-slate-500">
              Un ajuste sin explicación es un descuadre futuro que nadie va a poder reconstruir.
            </span>
          ) : null}
        </label>
      </div>

      <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Quedaría en{' '}
        <strong className={dejariaNegativo ? 'text-red-700' : 'text-slate-900'}>
          {saldoResultante}
        </strong>{' '}
        {dejariaNegativo ? '— no se puede: no hay tantas.' : 'en existencia.'}
      </p>

      {registrar.error ? (
        <div className="mt-3">
          <Aviso tipo="error">{mensajeDeError(registrar.error)}</Aviso>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton
          onClick={() => registrar.mutate()}
          disabled={!valida || faltaMotivo || dejariaNegativo || registrar.isPending}
        >
          {registrar.isPending ? 'Registrando...' : 'Registrar'}
        </Boton>
      </div>
    </Modal>
  );
}
