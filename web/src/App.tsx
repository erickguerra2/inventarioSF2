import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout.tsx';
import { Tarjeta, Titulo } from './componentes/ui.tsx';
import { Inicio } from './paginas/Inicio.tsx';
import { Login } from './paginas/Login.tsx';
import { Corte } from './paginas/Corte.tsx';
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
              <Pendiente
                titulo="Uniformes"
                fase={4}
                detalle="Prendas con sus tallas: precio, costo y mínimo de cada una. Las existencias no se editan aquí: se mueven desde Inventario."
              />
            </RutaPrivada>
          }
        />
        <Route
          path="/bolsas"
          element={
            <RutaPrivada soloAdmin>
              <Pendiente
                titulo="Bolsas de útiles"
                fase={4}
                detalle="Una bolsa por grado y ciclo, con su lista de útiles (opcional) y el botón para duplicarla al ciclo siguiente."
              />
            </RutaPrivada>
          }
        />
        <Route
          path="/inventario"
          element={
            <RutaPrivada soloAdmin>
              <Pendiente
                titulo="Inventario"
                fase={5}
                detalle="Existencias de uniformes y bolsas juntas, ingresar existencias, conteo físico, kardex y alertas de reposición."
              />
            </RutaPrivada>
          }
        />
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
