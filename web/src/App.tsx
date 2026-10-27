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
import { Reportes } from './paginas/Reportes.tsx';
import { Usuarios } from './paginas/Usuarios.tsx';
import { Vender } from './paginas/Vender.tsx';
import { Ventas } from './paginas/Ventas.tsx';
import { BolsasPorGrado } from './reportes/BolsasPorGrado.tsx';
import { ExistenciasValorizadas } from './reportes/ExistenciasValorizadas.tsx';
import { TallasMasVendidas } from './reportes/TallasMasVendidas.tsx';
import { VentasAgrupadas } from './reportes/VentasAgrupadas.tsx';
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
              <Reportes />
            </RutaPrivada>
          }
        >
          <Route index element={<VentasAgrupadas />} />
          <Route path="tallas" element={<TallasMasVendidas />} />
          <Route path="existencias" element={<ExistenciasValorizadas />} />
          <Route path="bolsas" element={<BolsasPorGrado />} />
        </Route>

        <Route
          path="/usuarios"
          element={
            <RutaPrivada soloAdmin>
              <Usuarios />
            </RutaPrivada>
          }
        />

        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
