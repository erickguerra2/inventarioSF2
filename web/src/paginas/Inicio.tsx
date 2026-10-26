import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, apiConMeta } from '../api/cliente.ts';
import { Quetzales, Tarjeta, Titulo } from '../componentes/ui.tsx';
import { esAdmin, useSesion } from '../sesion/sesion.ts';

type Corte = {
  fecha: string;
  alcance: 'TODAS' | 'SOLO_MIS_VENTAS';
  totales: {
    ventas: number;
    cobradoCentavos: number;
    efectivoCentavos: number;
    anuladas: number;
    anuladoCentavos: number;
  };
};

type Alertas = {
  data: Array<{ id: string; nombre: string; stockActual: number; faltante: number }>;
  resumen: { total: number; agotados: number };
};

export function Inicio() {
  const { usuario } = useSesion();
  const administradora = esAdmin(usuario);

  // El MISMO endpoint para los dos roles: al backend le toca decidir que
  // devuelve. A una maestra le llega solo su corte.
  const corte = useQuery({
    queryKey: ['corte-caja', 'hoy'],
    queryFn: () => api<Corte>('/reportes/corte-caja'),
  });

  const alertas = useQuery({
    queryKey: ['alertas'],
    queryFn: () => apiConMeta<Alertas>('/inventario/alertas'),
    enabled: administradora, // a la maestra el backend le responderia 403
  });

  return (
    <div>
      <Titulo ayuda={`Hoy es ${new Date().toLocaleDateString('es-GT', { dateStyle: 'full' })}`}>
        Hola, {usuario?.nombre.split(' ')[0]}
      </Titulo>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/vender" className="sm:col-span-2 lg:col-span-1">
          <Tarjeta className="h-full border-marca/30 transition hover:border-marca hover:shadow">
            <p className="text-lg font-semibold text-marca">Vender</p>
            <p className="mt-1 text-sm text-slate-600">
              Uniformes y bolsas de útiles. Es lo que más se usa.
            </p>
          </Tarjeta>
        </Link>

        <Tarjeta>
          <p className="text-sm font-medium text-slate-500">
            {corte.data?.alcance === 'SOLO_MIS_VENTAS' ? 'Mis ventas de hoy' : 'Ventas de hoy'}
          </p>
          {corte.isPending ? (
            <p className="mt-2 text-sm text-slate-400">Cargando...</p>
          ) : corte.isError ? (
            <p className="mt-2 text-sm text-slate-400">Sin datos</p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-marca">
                <Quetzales centavos={corte.data.totales.cobradoCentavos} />
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {corte.data.totales.ventas} venta(s)
                {corte.data.totales.anuladas > 0
                  ? `, ${corte.data.totales.anuladas} anulada(s)`
                  : ''}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                A entregar en efectivo:{' '}
                <strong className="text-slate-900">
                  <Quetzales centavos={corte.data.totales.efectivoCentavos} />
                </strong>
              </p>
            </>
          )}
        </Tarjeta>

        {administradora ? (
          <Link to="/inventario">
            <Tarjeta className="h-full transition hover:shadow">
              <p className="text-sm font-medium text-slate-500">Hay que reponer</p>
              {alertas.isPending ? (
                <p className="mt-2 text-sm text-slate-400">Cargando...</p>
              ) : alertas.isError ? (
                <p className="mt-2 text-sm text-slate-400">Sin datos</p>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-semibold text-marca">
                    {alertas.data.resumen.total}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {alertas.data.resumen.agotados} agotado(s) por completo
                  </p>
                  {alertas.data.data.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-sm text-slate-600">
                      {alertas.data.data.slice(0, 3).map((item) => (
                        <li key={item.id} className="truncate">
                          {item.nombre} — faltan {item.faltante}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </Tarjeta>
          </Link>
        ) : null}
      </div>

      {!administradora ? (
        <p className="mt-6 text-sm text-slate-600">
          Su usuario registra ventas y consulta las suyas. Para ingresar existencias, cambiar
          precios o anular una venta, hay que pedírselo a la administradora.
        </p>
      ) : null}
    </div>
  );
}
