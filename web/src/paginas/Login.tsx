import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../api/errores.ts';
import { Aviso, Boton, Campo, Cargando } from '../componentes/ui.tsx';
import { useIniciarSesion, useSesion } from '../sesion/sesion.ts';

export function Login() {
  const { usuario, cargando } = useSesion();
  const iniciarSesion = useIniciarSesion();
  const navegar = useNavigate();

  const [datos, setDatos] = useState({ usuario: '', password: '' });

  if (cargando) return <Cargando texto="Verificando sesión..." />;
  if (usuario) return <Navigate to="/" replace />;

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    iniciarSesion.mutate(datos, {
      onSuccess: () => navegar('/', { replace: true }),
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-fondo p-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-6 text-center">
          <img
            src="/logo.jpg"
            alt="Centro Cultural Sagrada Familia 2"
            className="mx-auto h-24 w-24 object-contain"
          />
          <h1 className="mt-3 text-xl font-semibold text-azul">Inventario</h1>
          <p className="mt-1 text-sm text-slate-600">Uniformes y bolsas de útiles</p>
        </div>

        <div className="space-y-4">
          <Campo
            etiqueta="Usuario"
            name="usuario"
            autoComplete="username"
            autoFocus
            required
            value={datos.usuario}
            onChange={(e) => setDatos({ ...datos, usuario: e.target.value })}
            placeholder="lucia.m"
          />

          <Campo
            etiqueta="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={datos.password}
            onChange={(e) => setDatos({ ...datos, password: e.target.value })}
          />

          {/* El backend no dice si el usuario existe: contrasena mala y usuario
              inventado dan la misma respuesta. No hay que "mejorarlo" aqui. */}
          {iniciarSesion.error ? (
            <Aviso tipo="error">{mensajeDeError(iniciarSesion.error)}</Aviso>
          ) : null}

          <Boton type="submit" disabled={iniciarSesion.isPending} className="w-full">
            {iniciarSesion.isPending ? 'Entrando...' : 'Entrar'}
          </Boton>
        </div>

        <p className="mt-5 text-xs text-slate-500">
          El usuario es corto, como <code className="font-mono">lucia.m</code>, no un correo.
        </p>
      </form>
    </div>
  );
}
