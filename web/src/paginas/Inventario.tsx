import { NavLink, Outlet } from 'react-router-dom';
import { Titulo } from '../componentes/ui.tsx';

const PESTANAS = [
  { a: '/inventario', texto: 'Existencias', fin: true },
  { a: '/inventario/entradas', texto: 'Ingresar existencias' },
  { a: '/inventario/conteo', texto: 'Conteo físico' },
  { a: '/inventario/alertas', texto: 'Hay que reponer' },
];

export function Inventario() {
  return (
    <div>
      <Titulo ayuda="Uniformes y bolsas de útiles en la misma lista: para el inventario son lo mismo.">
        Inventario
      </Titulo>

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
