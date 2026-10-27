import { NavLink, Outlet } from 'react-router-dom';
import { Titulo } from '../componentes/ui.tsx';

const PESTANAS = [
  { a: '/reportes', texto: 'Ventas', fin: true },
  { a: '/reportes/tallas', texto: 'Tallas más vendidas' },
  { a: '/reportes/existencias', texto: 'Existencias valorizadas' },
  { a: '/reportes/bolsas', texto: 'Bolsas por grado' },
];

export function Reportes() {
  return (
    <div>
      <Titulo ayuda="Todos se pueden exportar a Excel.">Reportes</Titulo>

      <nav className="mb-5 border-b border-slate-200">
        <ul className="flex flex-wrap gap-1">
          {PESTANAS.map((pestana) => (
            <li key={pestana.a}>
              <NavLink
                to={pestana.a}
                end={pestana.fin}
                className={({ isActive }) =>
                  `block border-b-2 px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'border-marca text-marca'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`
                }
              >
                {pestana.texto}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
}
