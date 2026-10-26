import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { esAdmin, useCerrarSesion, useSesion } from '../sesion/sesion.ts';
import { EtiquetaRol } from './ui.tsx';

type Enlace = { a: string; texto: string; soloAdmin?: boolean; textoMaestra?: string };

/**
 * La navegacion refleja la asimetria de los dos roles: la administradora tiene
 * ocho entradas, la maestra tres. Esa diferencia es el diseno, no un descuido.
 */
const ENLACES: Enlace[] = [
  { a: '/', texto: 'Inicio' },
  { a: '/vender', texto: 'Vender' },
  { a: '/ventas', texto: 'Ventas', textoMaestra: 'Mis ventas' },
  { a: '/corte', texto: 'Corte de caja', textoMaestra: 'Mi corte' },
  { a: '/catalogo', texto: 'Uniformes', soloAdmin: true },
  { a: '/bolsas', texto: 'Bolsas', soloAdmin: true },
  { a: '/inventario', texto: 'Inventario', soloAdmin: true },
  { a: '/reportes', texto: 'Reportes', soloAdmin: true },
  { a: '/usuarios', texto: 'Usuarios', soloAdmin: true },
];

export function Layout() {
  const { usuario } = useSesion();
  const cerrarSesion = useCerrarSesion();
  const navegar = useNavigate();

  const administradora = esAdmin(usuario);
  const enlaces = ENLACES.filter((enlace) => administradora || !enlace.soloAdmin);

  async function salir() {
    await cerrarSesion.mutateAsync().catch(() => undefined);
    navegar('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-fondo">
      <header className="bg-marca text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-semibold tracking-wide">INVENTARIO CCSF2</p>
            <p className="text-xs text-white/70">Uniformes y bolsas de útiles</p>
          </div>

          <div className="flex items-center gap-3">
            {usuario ? (
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">{usuario.nombre}</p>
                <EtiquetaRol rol={usuario.rol} />
              </div>
            ) : null}

            {/* Grande y visible a proposito: si la computadora es compartida,
                cerrar sesion tiene que ser lo mas facil de encontrar. */}
            <button
              onClick={salir}
              disabled={cerrarSesion.isPending}
              className="rounded-md border border-white/30 px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-60"
            >
              {cerrarSesion.isPending ? 'Saliendo...' : 'Cerrar sesión'}
            </button>
          </div>
        </div>

        <nav className="mx-auto max-w-7xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {enlaces.map((enlace) => (
              <li key={enlace.a}>
                <NavLink
                  to={enlace.a}
                  end={enlace.a === '/'}
                  className={({ isActive }) =>
                    `block whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition ${
                      isActive ? 'bg-fondo text-marca' : 'text-white/80 hover:bg-white/10'
                    }`
                  }
                >
                  {!administradora && enlace.textoMaestra ? enlace.textoMaestra : enlace.texto}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
