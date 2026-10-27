import { Boton } from './ui.tsx';
import { haceDiasISO, hoyISO, primerDiaDelMesISO } from '../utilidades/fechas.ts';

export type Rango = { desde: string; hasta: string };

/**
 * Desde / hasta con atajos. Las fechas se mandan como YYYY-MM-DD y el backend
 * resuelve los limites del dia en hora de Guatemala; aqui no se hace aritmetica
 * de zonas.
 */
export function FiltroFechas({
  rango,
  alCambiar,
}: {
  rango: Rango;
  alCambiar: (rango: Rango) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Desde</span>
        <input
          type="date"
          value={rango.desde}
          max={rango.hasta}
          onChange={(evento) => alCambiar({ ...rango, desde: evento.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Hasta</span>
        <input
          type="date"
          value={rango.hasta}
          min={rango.desde}
          onChange={(evento) => alCambiar({ ...rango, hasta: evento.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <Boton variante="secundario" onClick={() => alCambiar({ desde: hoyISO(), hasta: hoyISO() })}>
          Hoy
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => alCambiar({ desde: haceDiasISO(7), hasta: hoyISO() })}
        >
          7 días
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => alCambiar({ desde: primerDiaDelMesISO(), hasta: hoyISO() })}
        >
          Este mes
        </Boton>
      </div>
    </div>
  );
}

export function rangoDelMes(): Rango {
  return { desde: primerDiaDelMesISO(), hasta: hoyISO() };
}
