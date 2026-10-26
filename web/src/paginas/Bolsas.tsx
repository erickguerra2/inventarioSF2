import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import type { Bolsa, Ciclo, Nivel } from '../api/modelos.ts';
import { EnteroEnLinea, MontoEnLinea } from '../componentes/edicion.tsx';
import {
  Aviso,
  Boton,
  Cargando,
  Modal,
  Quetzales,
  Tarjeta,
  Titulo,
} from '../componentes/ui.tsx';

type LineaContenido = { descripcion: string; cantidad: number; unidad: string };

export function Bolsas() {
  const clienteConsultas = useQueryClient();
  const [cicloId, setCicloId] = useState<string>('');
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [duplicando, setDuplicando] = useState<Bolsa | null>(null);
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);

  const ciclos = useQuery({ queryKey: ['ciclos'], queryFn: () => api<Ciclo[]>('/ciclos') });

  // Por omision, el ciclo en curso.
  useEffect(() => {
    if (!cicloId && ciclos.data) {
      const activo = ciclos.data.find((ciclo) => ciclo.activo) ?? ciclos.data[0];
      if (activo) setCicloId(activo.id);
    }
  }, [ciclos.data, cicloId]);

  const bolsas = useQuery({
    queryKey: ['bolsas', 'admin', cicloId],
    queryFn: () => api<Bolsa[]>(`/bolsas?cicloId=${cicloId}&incluirInactivas=true`),
    enabled: Boolean(cicloId),
  });

  function refrescar() {
    void clienteConsultas.invalidateQueries({ queryKey: ['bolsas'] });
  }

  const guardarBolsa = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: Record<string, unknown> }) =>
      api(`/bolsas/${id}`, { method: 'PATCH', body: datos }),
    onSuccess: refrescar,
  });

  const bolsa = bolsas.data?.find((candidata) => candidata.id === seleccionada) ?? null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Titulo ayuda="Una bolsa por grado y ciclo. La lista de útiles es opcional: se imprime, no se inventaría.">
          Bolsas de útiles
        </Titulo>
        <div className="flex items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Ciclo</span>
            <select
              value={cicloId}
              onChange={(evento) => {
                setCicloId(evento.target.value);
                setSeleccionada(null);
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {(ciclos.data ?? []).map((ciclo) => (
                <option key={ciclo.id} value={ciclo.id}>
                  {ciclo.anio}
                  {ciclo.activo ? ' (en curso)' : ''}
                </option>
              ))}
            </select>
          </label>
          <Boton onClick={() => setCreando(true)}>Nueva bolsa</Boton>
        </div>
      </div>

      {bolsas.isPending ? (
        <Cargando texto="Cargando las bolsas..." />
      ) : bolsas.isError ? (
        <Aviso tipo="error">{mensajeDeError(bolsas.error)}</Aviso>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Tarjeta>
              <ul className="divide-y divide-slate-100">
                {bolsas.data.map((candidata) => (
                  <li key={candidata.id}>
                    <button
                      onClick={() => setSeleccionada(candidata.id)}
                      className={`w-full px-2 py-3 text-left transition hover:bg-slate-50 ${
                        candidata.id === seleccionada ? 'bg-marca/5' : ''
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {candidata.grado.nombre}
                        </span>
                        <span className="text-sm text-azul">
                          <Quetzales centavos={candidata.precioCentavos} />
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {candidata.totalLineasContenido === 0
                            ? 'sin lista'
                            : `${candidata.totalLineasContenido} ${
                                candidata.totalLineasContenido === 1 ? 'útil' : 'útiles'
                              }`}
                          {!candidata.activo ? ' · inactiva' : ''}
                        </span>
                        <span>{candidata.stockActual} en existencia</span>
                      </span>
                    </button>
                  </li>
                ))}

                {bolsas.data.length === 0 ? (
                  <li className="py-6 text-center text-sm text-slate-500">
                    Este ciclo todavía no tiene bolsas.
                  </li>
                ) : null}
              </ul>
            </Tarjeta>
          </div>

          <div className="lg:col-span-3">
            {bolsa ? (
              <DetalleBolsa
                bolsa={bolsa}
                guardando={guardarBolsa.isPending}
                error={guardarBolsa.error}
                alGuardarCampo={(datos) => guardarBolsa.mutate({ id: bolsa.id, datos })}
                alDuplicar={() => setDuplicando(bolsa)}
                alImprimir={() => setImprimiendo(bolsa.id)}
                alCambiarContenido={refrescar}
              />
            ) : (
              <Tarjeta>
                <p className="py-10 text-center text-sm text-slate-500">
                  Elija una bolsa de la lista para ver y editar su contenido.
                </p>
              </Tarjeta>
            )}
          </div>
        </div>
      )}

      {creando ? (
        <ModalNuevaBolsa
          ciclos={ciclos.data ?? []}
          cicloPorDefecto={cicloId}
          alCerrar={() => setCreando(false)}
          alCrear={() => {
            setCreando(false);
            refrescar();
          }}
        />
      ) : null}

      {duplicando ? (
        <ModalDuplicar
          bolsa={duplicando}
          ciclos={ciclos.data ?? []}
          alCerrar={() => setDuplicando(null)}
          alDuplicar={() => {
            setDuplicando(null);
            refrescar();
          }}
        />
      ) : null}

      {imprimiendo ? (
        <ListaParaImprimir bolsaId={imprimiendo} alCerrar={() => setImprimiendo(null)} />
      ) : null}
    </div>
  );
}

function DetalleBolsa({
  bolsa,
  guardando,
  error,
  alGuardarCampo,
  alDuplicar,
  alImprimir,
  alCambiarContenido,
}: {
  bolsa: Bolsa;
  guardando: boolean;
  error: unknown;
  alGuardarCampo: (datos: Record<string, unknown>) => void;
  alDuplicar: () => void;
  alImprimir: () => void;
  alCambiarContenido: () => void;
}) {
  const [lineas, setLineas] = useState<LineaContenido[]>([]);
  const [sucio, setSucio] = useState(false);

  // Al cambiar de bolsa se recarga el borrador desde el servidor.
  useEffect(() => {
    setLineas(
      bolsa.contenido.map((linea) => ({
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        unidad: linea.unidad ?? '',
      })),
    );
    setSucio(false);
  }, [bolsa.id, bolsa.contenido]);

  const guardarContenido = useMutation({
    mutationFn: () =>
      api(`/bolsas/${bolsa.id}/contenido`, {
        method: 'PUT',
        body: {
          contenido: lineas
            .filter((linea) => linea.descripcion.trim().length > 0)
            .map((linea) => ({
              descripcion: linea.descripcion.trim(),
              cantidad: linea.cantidad,
              ...(linea.unidad.trim() ? { unidad: linea.unidad.trim() } : {}),
            })),
        },
      }),
    onSuccess: () => {
      setSucio(false);
      alCambiarContenido();
    },
  });

  function cambiar(indice: number, cambios: Partial<LineaContenido>) {
    setLineas((actuales) =>
      actuales.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)),
    );
    setSucio(true);
  }

  function mover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= lineas.length) return;
    const copia = [...lineas];
    const actual = copia[indice];
    const otro = copia[destino];
    if (!actual || !otro) return;
    copia[indice] = otro;
    copia[destino] = actual;
    setLineas(copia);
    setSucio(true);
  }

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{bolsa.nombre}</h2>
          <p className="text-sm text-slate-500">
            {bolsa.grado.nivel.nombre} · {bolsa.sku}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <button onClick={alImprimir} className="font-medium text-marca hover:underline">
            Imprimir lista
          </button>
          <button onClick={alDuplicar} className="font-medium text-marca hover:underline">
            Duplicar
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-slate-200 py-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase text-slate-500">Precio</dt>
          <dd className="mt-1">
            <MontoEnLinea
              etiqueta="Precio de la bolsa"
              centavos={bolsa.precioCentavos}
              guardando={guardando}
              alGuardar={(centavos) =>
                centavos !== null && alGuardarCampo({ precioCentavos: centavos })
              }
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Costo</dt>
          <dd className="mt-1">
            <MontoEnLinea
              etiqueta="Costo de la bolsa"
              centavos={bolsa.costoCentavos}
              alGuardar={(centavos) => alGuardarCampo({ costoCentavos: centavos })}
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Mínimo</dt>
          <dd className="mt-1">
            <EnteroEnLinea
              etiqueta="Mínimo de la bolsa"
              valor={bolsa.stockMinimo}
              alGuardar={(valor) => alGuardarCampo({ stockMinimo: valor })}
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Existencia</dt>
          <dd className="mt-1 px-2 py-1 tabular-nums">
            <span className={bolsa.bajoStock ? 'font-semibold text-red-700' : ''}>
              {bolsa.stockActual}
            </span>
            <span className="ml-1 text-xs text-slate-400">bolsas</span>
          </dd>
        </div>
      </dl>

      {error ? (
        <div className="mt-3">
          <Aviso tipo="error">{mensajeDeError(error)}</Aviso>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-medium text-slate-900">Lista de útiles</h3>
          <span className="text-xs text-slate-500">
            {lineas.length} línea(s) · es opcional
          </span>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          Esto es lo que se imprime y se le entrega al papá. No afecta existencias ni precio:
          la bolsa se vende completa.
        </p>

        <div className="space-y-2">
          {lineas.map((linea, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <input
                value={linea.cantidad}
                inputMode="numeric"
                onChange={(evento) =>
                  cambiar(indice, { cantidad: Number.parseInt(evento.target.value, 10) || 1 })
                }
                className="w-14 rounded border border-slate-300 px-2 py-1.5 text-center text-sm tabular-nums"
                aria-label="Cantidad"
              />
              <input
                value={linea.unidad}
                onChange={(evento) => cambiar(indice, { unidad: evento.target.value })}
                placeholder="unidad"
                className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
                aria-label="Unidad"
              />
              <input
                value={linea.descripcion}
                onChange={(evento) => cambiar(indice, { descripcion: evento.target.value })}
                placeholder="Cuaderno doble línea 80 hojas"
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                aria-label="Descripción"
              />
              <button
                onClick={() => mover(indice, -1)}
                disabled={indice === 0}
                className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                aria-label="Subir"
              >
                ↑
              </button>
              <button
                onClick={() => mover(indice, 1)}
                disabled={indice === lineas.length - 1}
                className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                aria-label="Bajar"
              >
                ↓
              </button>
              <button
                onClick={() => {
                  setLineas((actuales) => actuales.filter((_, i) => i !== indice));
                  setSucio(true);
                }}
                className="px-1 text-xs text-slate-400 hover:text-red-700"
                aria-label="Quitar"
              >
                ✕
              </button>
            </div>
          ))}

          {lineas.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              Sin lista. La bolsa se vende igual.
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Boton
            variante="secundario"
            onClick={() => {
              setLineas((actuales) => [...actuales, { descripcion: '', cantidad: 1, unidad: '' }]);
              setSucio(true);
            }}
          >
            Agregar línea
          </Boton>

          <div className="flex items-center gap-3">
            {sucio ? (
              <span className="text-xs text-amber-700">Hay cambios sin guardar</span>
            ) : null}
            {/* La lista se guarda COMPLETA de una vez, no línea por línea. */}
            <Boton
              onClick={() => guardarContenido.mutate()}
              disabled={!sucio || guardarContenido.isPending}
            >
              {guardarContenido.isPending ? 'Guardando...' : 'Guardar lista'}
            </Boton>
          </div>
        </div>

        {guardarContenido.error ? (
          <div className="mt-3">
            <Aviso tipo="error">{mensajeDeError(guardarContenido.error)}</Aviso>
          </div>
        ) : null}
      </div>
    </Tarjeta>
  );
}

type ListaImpresion = {
  titulo: string;
  grado: string;
  nivel: string;
  ciclo: number;
  precioCentavos: number;
  notas: string | null;
  items: Array<{ cantidad: number; unidad: string | null; descripcion: string }>;
  totalLineas: number;
};

function ListaParaImprimir({ bolsaId, alCerrar }: { bolsaId: string; alCerrar: () => void }) {
  const lista = useQuery({
    queryKey: ['bolsa-lista', bolsaId],
    queryFn: () => api<ListaImpresion>(`/bolsas/${bolsaId}/lista`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-md">
        <div className="para-imprimir rounded-lg bg-white p-6 shadow-lg">
          {lista.isPending ? (
            <Cargando />
          ) : lista.isError ? (
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
          ) : (
            <>
              <div className="border-b border-slate-200 pb-4 text-center">
                <img src="/logo.jpg" alt="" className="mx-auto h-16 w-16 object-contain" />
                <p className="mt-2 text-sm font-semibold text-azul">
                  Centro Cultural Sagrada Familia 2
                </p>
              </div>

              <h2 className="mt-4 text-lg font-semibold text-azul">{lista.data.titulo}</h2>
              <p className="text-sm text-slate-600">
                {lista.data.nivel} · Ciclo {lista.data.ciclo}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Precio de la bolsa: <Quetzales centavos={lista.data.precioCentavos} />
              </p>

              {lista.data.items.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">
                  Esta bolsa no tiene lista de útiles registrada.
                </p>
              ) : (
                <ul className="mt-4 space-y-1 text-sm">
                  {lista.data.items.map((item, indice) => (
                    <li key={indice} className="flex gap-2 border-b border-slate-100 py-1.5">
                      <span className="w-10 shrink-0 text-right tabular-nums">
                        {item.cantidad}
                      </span>
                      <span className="w-16 shrink-0 text-slate-500">{item.unidad ?? ''}</span>
                      <span>{item.descripcion}</span>
                    </li>
                  ))}
                </ul>
              )}

              {lista.data.notas ? (
                <p className="mt-4 text-sm text-slate-600">{lista.data.notas}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="no-imprimir mt-4 flex justify-end gap-3">
          <Boton variante="secundario" onClick={alCerrar}>
            Cerrar
          </Boton>
          <Boton onClick={() => window.print()} disabled={lista.isPending}>
            Imprimir
          </Boton>
        </div>
      </div>
    </div>
  );
}

function ModalNuevaBolsa({
  ciclos,
  cicloPorDefecto,
  alCerrar,
  alCrear,
}: {
  ciclos: Ciclo[];
  cicloPorDefecto: string;
  alCerrar: () => void;
  alCrear: () => void;
}) {
  const niveles = useQuery({ queryKey: ['niveles'], queryFn: () => api<Nivel[]>('/niveles') });

  const [datos, setDatos] = useState({
    gradoId: '',
    cicloId: cicloPorDefecto,
    precio: '',
    costo: '',
    minimo: '0',
  });

  const crear = useMutation({
    mutationFn: () =>
      api('/bolsas', {
        method: 'POST',
        body: {
          gradoId: datos.gradoId,
          cicloId: datos.cicloId,
          precioCentavos: Math.round(Number.parseFloat(datos.precio.replace(',', '.')) * 100),
          ...(datos.costo.trim()
            ? { costoCentavos: Math.round(Number.parseFloat(datos.costo.replace(',', '.')) * 100) }
            : {}),
          stockMinimo: Number.parseInt(datos.minimo, 10) || 0,
        },
      }),
    onSuccess: alCrear,
  });

  const precioValido = Number.isFinite(Number.parseFloat(datos.precio.replace(',', '.')));

  return (
    <Modal titulo="Nueva bolsa de útiles" alCerrar={alCerrar}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Grado</span>
          <select
            value={datos.gradoId}
            onChange={(evento) => setDatos({ ...datos, gradoId: evento.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Elija un grado</option>
            {(niveles.data ?? []).map((nivel) => (
              <optgroup key={nivel.id} label={nivel.nombre}>
                {nivel.grados.map((grado) => (
                  <option key={grado.id} value={grado.id}>
                    {grado.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Ciclo</span>
          <select
            value={datos.cicloId}
            onChange={(evento) => setDatos({ ...datos, cicloId: evento.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {ciclos.map((ciclo) => (
              <option key={ciclo.id} value={ciclo.id}>
                {ciclo.anio}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Precio en Q</span>
            <input
              value={datos.precio}
              inputMode="decimal"
              onChange={(evento) => setDatos({ ...datos, precio: evento.target.value })}
              placeholder="385.00"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Costo <span className="font-normal text-slate-400">(opcional)</span>
            </span>
            <input
              value={datos.costo}
              inputMode="decimal"
              onChange={(evento) => setDatos({ ...datos, costo: evento.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <p className="text-xs text-slate-500">
          El precio y el costo son de la bolsa completa, no la suma de los útiles. La lista se
          agrega después.
        </p>
      </div>

      {crear.error ? (
        <div className="mt-3">
          <Aviso tipo="error">{mensajeDeError(crear.error)}</Aviso>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton
          onClick={() => crear.mutate()}
          disabled={!datos.gradoId || !precioValido || crear.isPending}
        >
          {crear.isPending ? 'Creando...' : 'Crear'}
        </Boton>
      </div>
    </Modal>
  );
}

function ModalDuplicar({
  bolsa,
  ciclos,
  alCerrar,
  alDuplicar,
}: {
  bolsa: Bolsa;
  ciclos: Ciclo[];
  alCerrar: () => void;
  alDuplicar: () => void;
}) {
  const otros = ciclos.filter((ciclo) => ciclo.id !== bolsa.ciclo.id);
  const [cicloId, setCicloId] = useState(otros[0]?.id ?? '');

  const duplicar = useMutation({
    mutationFn: () => api(`/bolsas/${bolsa.id}/duplicar`, { method: 'POST', body: { cicloId } }),
    onSuccess: alDuplicar,
  });

  return (
    <Modal titulo={`Duplicar la bolsa de ${bolsa.grado.nombre}`} alCerrar={alCerrar}>
      <p className="text-sm text-slate-600">
        Se copia la bolsa con su lista de útiles y su precio, <strong>con 0 existencias</strong>.
        Es como se arma el catálogo del año siguiente sin volver a teclear todo.
      </p>

      {otros.length === 0 ? (
        <div className="mt-4">
          <Aviso>
            No hay otro ciclo escolar creado. Primero hay que crear el ciclo del año siguiente.
          </Aviso>
        </div>
      ) : (
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Ciclo de destino</span>
          <select
            value={cicloId}
            onChange={(evento) => setCicloId(evento.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {otros.map((ciclo) => (
              <option key={ciclo.id} value={ciclo.id}>
                {ciclo.anio}
              </option>
            ))}
          </select>
        </label>
      )}

      {duplicar.error ? (
        <div className="mt-3">
          <Aviso tipo="error">{mensajeDeError(duplicar.error)}</Aviso>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton onClick={() => duplicar.mutate()} disabled={!cicloId || duplicar.isPending}>
          {duplicar.isPending ? 'Duplicando...' : 'Duplicar'}
        </Boton>
      </div>
    </Modal>
  );
}
