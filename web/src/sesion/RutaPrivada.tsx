import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { mensajeDeError } from '../api/errores.ts';
import { Aviso, Cargando, Tarjeta, Titulo } from '../componentes/ui.tsx';
import { useSesion } from './sesion.ts';

/**
 * Esconder una pantalla es cortesia, no seguridad: el backend responde 403
 * igual si alguien llama el endpoint a mano. Esto es para que la maestra no vea
 * botones que no le sirven, no para proteger nada.
 */
export function RutaPrivada({
  children,
  soloAdmin = false,
}: {
  children: ReactNode;
  soloAdmin?: boolean;
}) {
  const { usuario, cargando, errorInesperado } = useSesion();

  if (cargando) return <Cargando texto="Verificando sesión..." />;

  if (errorInesperado) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Aviso tipo="error">{mensajeDeError(errorInesperado)}</Aviso>
      </div>
    );
  }

  if (!usuario) return <Navigate to="/login" replace />;

  if (soloAdmin && usuario.rol !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Tarjeta>
          <Titulo>Solo para la administradora</Titulo>
          <p className="text-sm text-slate-600">
            Esta pantalla no le corresponde a su usuario. Si necesita algo de aquí, pídaselo a
            la administradora.
          </p>
        </Tarjeta>
      </div>
    );
  }

  return children;
}
