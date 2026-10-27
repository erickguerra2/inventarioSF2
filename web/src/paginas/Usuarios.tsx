import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import type { Rol } from '../api/modelos.ts';
import { Aviso, Boton, Cargando, Modal, Tarjeta, Titulo } from '../componentes/ui.tsx';
import { useSesion } from '../sesion/sesion.ts';

type Usuario = {
  id: string;
  usuario: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
};

export function Usuarios() {
  const clienteConsultas = useQueryClient();
  const { usuario: yo } = useSesion();

  const [incluirInactivos, setIncluirInactivos] = useState(true);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [cambiandoPassword, setCambiandoPassword] = useState<Usuario | null>(null);

  const usuarios = useQuery({
    queryKey: ['usuarios', incluirInactivos],
    queryFn: () => api<Usuario[]>(`/usuarios?incluirInactivos=${incluirInactivos}`),
  });

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['usuarios'] });
  }

  const cambiarActivo = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      api(`/usuarios/${id}`, { method: 'PATCH', body: { activo } }),
    onSuccess: refrescar,
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Titulo ayuda="Las maestras solo registran ventas. Un usuario nunca se borra: se desactiva.">
          Usuarios
        </Titulo>
        <Boton onClick={() => setCreando(true)}>Nuevo usuario</Boton>
      </div>

      {cambiarActivo.error ? (
        <div className="mb-4">
          <Aviso tipo="error">{mensajeDeError(cambiarActivo.error)}</Aviso>
        </div>
      ) : null}

      <Tarjeta>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(evento) => setIncluirInactivos(evento.target.checked)}
          />
          Mostrar también los inactivos
        </label>

        {usuarios.isPending ? (
          <Cargando texto="Cargando usuarios..." />
        ) : usuarios.isError ? (
          <Aviso tipo="error">{mensajeDeError(usuarios.error)}</Aviso>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Nombre</th>
                  <th className="py-2 pr-3">Usuario</th>
                  <th className="py-2 pr-3">Rol</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {usuarios.data.map((persona) => {
                  const soyYo = persona.id === yo?.id;

                  return (
                    <tr
                      key={persona.id}
                      className={`border-b border-slate-100 ${persona.activo ? '' : 'opacity-50'}`}
                    >
                      <td className="py-3 pr-3">
                        <span className="font-medium text-slate-900">{persona.nombre}</span>
                        {soyYo ? (
                          <span className="ml-2 text-xs text-slate-400">(usted)</span>
                        ) : null}
                        {persona.email ? (
                          <span className="block text-xs text-slate-500">{persona.email}</span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs text-slate-600">
                        {persona.usuario}
                      </td>
                      <td className="py-3 pr-3">
                        {persona.rol === 'ADMIN' ? 'Administradora' : 'Maestra'}
                      </td>
                      <td className="py-3 pr-3">
                        {persona.activo ? (
                          <span className="text-marca">activo</span>
                        ) : (
                          <span className="text-slate-400">inactivo</span>
                        )}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditando(persona)}
                          className="text-xs font-medium text-marca hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setCambiandoPassword(persona)}
                          className="ml-3 text-xs font-medium text-marca hover:underline"
                        >
                          Contraseña
                        </button>
                        {persona.activo ? (
                          <button
                            onClick={() =>
                              cambiarActivo.mutate({ id: persona.id, activo: false })
                            }
                            // El backend lo rechaza igual; deshabilitarlo evita
                            // que alguien se cierre la puerta por error.
                            disabled={soyYo || cambiarActivo.isPending}
                            className="ml-3 text-xs font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                            title={soyYo ? 'No puede desactivar su propio usuario' : undefined}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            onClick={() => cambiarActivo.mutate({ id: persona.id, activo: true })}
                            disabled={cambiarActivo.isPending}
                            className="ml-3 text-xs font-medium text-marca hover:underline"
                          >
                            Reactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Al desactivar a alguien se cierran sus sesiones de inmediato. Sus ventas y
          movimientos quedan tal cual: siguen atribuidos a esa persona.
        </p>
      </Tarjeta>

      {creando ? (
        <ModalUsuario
          alCerrar={() => setCreando(false)}
          alGuardar={() => {
            setCreando(false);
            refrescar();
          }}
        />
      ) : null}

      {editando ? (
        <ModalUsuario
          usuario={editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            refrescar();
          }}
        />
      ) : null}

      {cambiandoPassword ? (
        <ModalPassword
          usuario={cambiandoPassword}
          alCerrar={() => setCambiandoPassword(null)}
          alGuardar={() => setCambiandoPassword(null)}
        />
      ) : null}
    </div>
  );
}

function ModalUsuario({
  usuario,
  alCerrar,
  alGuardar,
}: {
  usuario?: Usuario;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const editando = Boolean(usuario);

  const [datos, setDatos] = useState({
    usuario: usuario?.usuario ?? '',
    nombre: usuario?.nombre ?? '',
    email: usuario?.email ?? '',
    rol: usuario?.rol ?? ('VENDEDOR' as Rol),
    password: '',
  });

  const guardar = useMutation({
    mutationFn: () =>
      editando && usuario
        ? api(`/usuarios/${usuario.id}`, {
            method: 'PATCH',
            body: {
              nombre: datos.nombre.trim(),
              rol: datos.rol,
              email: datos.email.trim() ? datos.email.trim() : null,
            },
          })
        : api('/usuarios', {
            method: 'POST',
            body: {
              usuario: datos.usuario.trim(),
              nombre: datos.nombre.trim(),
              rol: datos.rol,
              password: datos.password,
              ...(datos.email.trim() ? { email: datos.email.trim() } : {}),
            },
          }),
    onSuccess: alGuardar,
  });

  const completo =
    datos.nombre.trim().length > 0 &&
    (editando || (datos.usuario.trim().length >= 3 && datos.password.length >= 8));

  return (
    <Modal titulo={editando ? `Editar a ${usuario?.nombre}` : 'Nuevo usuario'} alCerrar={alCerrar}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Nombre completo</span>
          <input
            autoFocus
            value={datos.nombre}
            onChange={(evento) => setDatos({ ...datos, nombre: evento.target.value })}
            placeholder="Lucía Méndez"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Es lo que aparece en los reportes y en los recibos.
          </span>
        </label>

        {editando ? null : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Usuario</span>
            <input
              value={datos.usuario}
              onChange={(evento) => setDatos({ ...datos, usuario: evento.target.value })}
              placeholder="lucia.m"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Corto y sin espacios. No es un correo, y después no se puede cambiar: es la
              identidad con la que quedan firmadas sus ventas.
            </span>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Rol</span>
          <select
            value={datos.rol}
            onChange={(evento) => setDatos({ ...datos, rol: evento.target.value as Rol })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="VENDEDOR">Maestra — solo registra ventas</option>
            <option value="ADMIN">Administradora — todo</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Correo <span className="font-normal text-slate-400">(opcional)</span>
          </span>
          <input
            value={datos.email}
            onChange={(evento) => setDatos({ ...datos, email: evento.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Solo como dato de contacto: no se usa para entrar ni para recuperar la contraseña.
          </span>
        </label>

        {editando ? null : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Contraseña</span>
            <input
              type="password"
              value={datos.password}
              onChange={(evento) => setDatos({ ...datos, password: evento.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Mínimo 8 caracteres. Désela en persona; después ella no puede cambiarla sola,
              se la resetea usted.
            </span>
          </label>
        )}
      </div>

      {guardar.error ? (
        <div className="mt-3">
          <Aviso tipo="error">{mensajeDeError(guardar.error)}</Aviso>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton onClick={() => guardar.mutate()} disabled={!completo || guardar.isPending}>
          {guardar.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
        </Boton>
      </div>
    </Modal>
  );
}

function ModalPassword({
  usuario,
  alCerrar,
  alGuardar,
}: {
  usuario: Usuario;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [password, setPassword] = useState('');

  const cambiar = useMutation({
    mutationFn: () =>
      api<{ sesionesCerradas: number }>(`/usuarios/${usuario.id}/password`, {
        method: 'POST',
        body: { password },
      }),
  });

  if (cambiar.isSuccess) {
    return (
      <Modal titulo="Contraseña cambiada" alCerrar={alGuardar}>
        <p className="text-sm text-slate-600">
          La contraseña de <strong>{usuario.nombre}</strong> quedó cambiada, y se cerraron{' '}
          {cambiar.data.sesionesCerradas} sesión(es) suya(s). Tiene que volver a entrar con la
          nueva.
        </p>
        <div className="mt-5 flex justify-end">
          <Boton onClick={alGuardar}>Entendido</Boton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={`Cambiar la contraseña de ${usuario.nombre}`} alCerrar={alCerrar}>
      <p className="text-sm text-slate-600">
        No hay recuperación por correo: la contraseña la pone usted y se la entrega en
        persona.
      </p>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Nueva contraseña</span>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(evento) => setPassword(evento.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Mínimo 8 caracteres. Al cambiarla se cierran todas sus sesiones abiertas.
        </span>
      </label>

      {cambiar.error ? (
        <div className="mt-3">
          <Aviso tipo="error">{mensajeDeError(cambiar.error)}</Aviso>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton onClick={() => cambiar.mutate()} disabled={password.length < 8 || cambiar.isPending}>
          {cambiar.isPending ? 'Cambiando...' : 'Cambiar'}
        </Boton>
      </div>
    </Modal>
  );
}
