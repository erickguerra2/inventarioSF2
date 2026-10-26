import { Aviso, Tarjeta, Titulo } from '../componentes/ui.tsx';

/**
 * Las pantallas que todavia no existen. Estan en la navegacion desde ahora para
 * que se vea la forma completa del sistema y la diferencia entre los dos roles,
 * pero dicen claramente que no estan hechas.
 */
export function Pendiente({ titulo, fase, detalle }: { titulo: string; fase: number; detalle: string }) {
  return (
    <div>
      <Titulo>{titulo}</Titulo>
      <Tarjeta>
        <Aviso>
          Esta pantalla llega en la <strong>fase {fase}</strong> del frontend.
        </Aviso>
        <p className="mt-4 text-sm text-slate-600">{detalle}</p>
        <p className="mt-3 text-xs text-slate-500">
          El backend que necesita ya está listo y probado; falta la interfaz.
        </p>
      </Tarjeta>
    </div>
  );
}
