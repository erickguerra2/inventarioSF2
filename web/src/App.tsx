import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout.tsx';
import { Tarjeta, Titulo } from './componentes/ui.tsx';
import { Inicio } from './paginas/Inicio.tsx';
import { Login } from './paginas/Login.tsx';
import { Alertas } from './inventario/Alertas.tsx';
import { Conteo } from './inventario/Conteo.tsx';
import { Entradas } from './inventario/Entradas.tsx';
import { Existencias } from './inventario/Existencias.tsx';
import { Bolsas } from './paginas/Bolsas.tsx';
import { Catalogo } from './paginas/Catalogo.tsx';
import { Corte } from './paginas/Corte.tsx';
import { Inventario } from './paginas/Inventario.tsx';
import { Pendiente } from './paginas/Pendiente.tsx';
import { Vender } from './paginas/Vender.tsx';
import { Ventas } from './paginas/Ventas.tsx';
import { RutaPrivada } from './sesion/RutaPrivada.tsx';

function NoEncontrada() {
  return (
    <div>
      <Titulo>Esta página no existe</Titulo>
      <Tarjeta>
        <Link to="/" className="text-sm font-medium text-marca underline">
          Volver al inicio
        </Link>
      </Tarjeta>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RutaPrivada>
            <Layout />
          </RutaPrivada>
        }
      >
        <Route path="/" element={<Inicio />} />

        <Route path="/vender" element={<Vender />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/corte" element={<Corte />} />

        <Route
          path="/catalogo"
          element={
            <RutaPrivada soloAdmin>
              <Catalogo />
            </RutaPrivada>
          }
        />
        <Route
          path="/bolsas"
          element={
            <RutaPrivada soloAdmin>
              <Bolsas />
            </RutaPrivada>
          }
        />
        <Route
          path="/inventario"
          element={
            <RutaPrivada soloAdmin>
              <Inventario />
            </RutaPrivada>
          }
        >
          <Route index element={<Existencias />} />
          <Route path="entradas" element={<Entradas />} />
          <Route path="conteo" element={<Conteo />} />
          <Route path="alertas" element={<Alertas />} />
        </Route>
        <Route
          path="/reportes"
          element={
            <RutaPrivada soloAdmin>
              <Pendiente
                titulo="Reportes"
                fase={6}
                detalle="Ventas por día, maestra, tipo o grado; tallas más vendidas; existencias valorizadas; bolsas por grado. Todos exportan a CSV."
              />
            </RutaPrivada>
          }
        />
        <Route
          path="/usuarios"
          element={
            <RutaPrivada soloAdmin>
              <Pendiente
                titulo="Usuarios"
                fase={6}
                detalle="Alta de maestras, baja (nunca borrado) y reseteo de contraseñas."
              />
            </RutaPrivada>
          }
        />

        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
