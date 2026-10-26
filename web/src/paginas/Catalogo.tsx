import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import type { CategoriaUniforme, Prenda } from '../api/modelos.ts';
import { EnteroEnLinea, MontoEnLinea } from '../componentes/edicion.tsx';
import { Aviso, Boton, Cargando, Modal, Tarjeta, Titulo } from '../componentes/ui.tsx';

type CambioVariante = {
  varianteId: string;
  datos: Record<string, number | boolean | null>;
};

export function Catalogo() {
  const clienteConsultas = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [agregandoTallaA, setAgregandoTallaA] = useState<Prenda | null>(null);
  const [desactivando, setDesactivando] = useState<Prenda | null>(null);

  const prendas = useQuery({
    queryKey: ['prendas', 'admin'],
    queryFn: () => api<Prenda[]>('/uniformes/prendas?incluirInactivas=true'),
  });

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api<CategoriaUniforme[]>('/uniformes/categorias'),
  });

  function refrescar() {
    // Invalida tambien el catalogo de la pantalla de venta.
    void clienteConsultas.invalidateQueries({ queryKey: ['prendas'] });
  }

  const guardarVariante = useMutation({
    mutationFn: ({ varianteId, datos }: CambioVariante) =>
      api(`/uniformes/variantes/${varianteId}`, { method: 'PATCH', body: datos }),
    onSuccess: refrescar,
  });

  const desactivarPrenda = useMutation({
    mutationFn: (prendaId: string) =>
      api(`/uniformes/prendas/${prendaId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDesactivando(null);
      refrescar();
    },
  });

  const reactivarPrenda = useMutation({
    mutationFn: (prendaId: string) =>
      api(`/uniformes/prendas/${prendaId}`, { method: 'PATCH', body: { activo: true } }),
    onSuccess: refrescar,
  });

  if (prendas.isPending) return <Cargando texto="Cargando el catálogo..." />;
  if (prendas.isError) return <Aviso tipo="error">{mensajeDeError(prendas.error)}</Aviso>;

  const porCategoria = (categorias.data ?? []).map((categoria) => ({
    categoria,
    prendas: prendas.data.filter((prenda) => prenda.categoria.id === categoria.id),
  }));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Titulo ayuda="Clic en un precio, un costo o un mínimo para editarlo.">
          Uniformes
        </Titulo>
        <Boton onClick={() => setCreando(true)}>Nueva prenda</Boton>
      </div>

      {guardarVariante.error ? (
        <div className="mb-4">
          <Aviso tipo="error">{mensajeDeError(guardarVariante.error)}</Aviso>
        </div>
      ) : null}

      <Aviso>
        Las <strong>existencias no se editan aquí</strong>: se mueven desde Inventario, con un
        motivo. Esta pantalla define qué se vende y a qué precio.
      </Aviso>

      <div className="mt-5 space-y-8">
        {porCategoria.map(({ categoria, prendas: delGrupo }) => (
          <section key={categoria.id}>
            <h2 className="mb-3 text-lg font-semibold text-azul">{categoria.nombre}</h2>

            <div className="space-y-4">
              {delGrupo.map((prenda) => (
                <Tarjeta key={prenda.id} className={prenda.activo ? '' : 'opacity-60'}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {prenda.nombre}
                        {!prenda.activo ? (
                          <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                            inactiva
                          </span>
                        ) : null}
                      </h3>
                      {prenda.descripcion ? (
                        <p className="text-sm text-slate-500">{prenda.descripcion}</p>
                      ) : null}
                    </div>

                    <div className="flex gap-3 text-sm">
                      <button
                        onClick={() => setAgregandoTallaA(prenda)}
                        className="font-medium text-marca hover:underline"
                      >
                        Agregar talla
                      </button>
                      {prenda.activo ? (
                        <button
                          onClick={() => setDesactivando(prenda)}
                          className="font-medium text-red-700 hover:underline"
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivarPrenda.mutate(prenda.id)}
                          className="font-medium text-marca hover:underline"
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                          <th className="py-2 pr-3">Talla</th>
                          <th className="py-2 pr-3 text-right">Precio</th>
                          <th className="py-2 pr-3 text-right">Costo</th>
                          <th className="py-2 pr-3 text-right">Mínimo</th>
                          <th className="py-2 pr-3 text-right">Existencia</th>
                          <th className="py-2 pr-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prenda.variantes.map((variante) => (
                          <tr key={variante.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium">{variante.talla}</td>

                            <td className="py-2 pr-3 text-right">
                              <MontoEnLinea
                                etiqueta={`Precio de la talla ${variante.talla}`}
                                centavos={variante.precioCentavos}
                                guardando={
                                  guardarVariante.isPending &&
                                  guardarVariante.variables?.varianteId === variante.id
                                }
                                alGuardar={(centavos) =>
                                  centavos !== null &&
                                  guardarVariante.mutate({
                                    varianteId: variante.id,
                                    datos: { precioCentavos: centavos },
                                  })
                                }
                              />
                            </td>

                            <td className="py-2 pr-3 text-right">
                              <MontoEnLinea
                                etiqueta={`Costo de la talla ${variante.talla}`}
                                centavos={variante.costoCentavos}
                                alGuardar={(centavos) =>
                                  guardarVariante.mutate({
                                    varianteId: variante.id,
                                    datos: { costoCentavos: centavos },
                                  })
                                }
                              />
                            </td>

                            <td className="py-2 pr-3 text-right">
                              <EnteroEnLinea
                                etiqueta={`Mínimo de la talla ${variante.talla}`}
                                valor={variante.stockMinimo}
                                alGuardar={(valor) =>
                                  guardarVariante.mutate({
                                    varianteId: variante.id,
                                    datos: { stockMinimo: valor },
                                  })
                                }
                              />
                            </td>

                            <td className="py-2 pr-3 text-right tabular-nums">
                              <span className={variante.bajoStock ? 'font-semibold text-red-700' : ''}>
                                {variante.stockActual}
                              </span>
                            </td>

                            <td className="py-2 pr-3">
                              {variante.activo ? (
                                variante.disponible ? (
                                  <span className="text-slate-500">a la venta</span>
                                ) : (
                                  <span className="text-red-700">agotada</span>
                                )
                              ) : (
                                <span className="text-slate-400">inactiva</span>
                              )}
                            </td>
                          </tr>
                        ))}

                        {prenda.variantes.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-500">
                              Esta prenda todavía no tiene tallas.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Tarjeta>
              ))}
            </div>
          </section>
        ))}
      </div>

      {creando ? (
        <ModalNuevaPrenda
          categorias={categorias.data ?? []}
          alCerrar={() => setCreando(false)}
          alCrear={() => {
            setCreando(false);
            refrescar();
          }}
        />
      ) : null}

      {agregandoTallaA ? (
        <ModalNuevaTalla
          prenda={agregandoTallaA}
          alCerrar={() => setAgregandoTallaA(null)}
          alCrear={() => {
            setAgregandoTallaA(null);
            refrescar();
          }}
        />
      ) : null}

      {desactivando ? (
        <Modal titulo={`Desactivar ${desactivando.nombre}`} alCerrar={() => setDesactivando(null)}>
          <p className="text-sm text-slate-600">
            Deja de venderse, con todas sus tallas. No se borra nada: las ventas y los
            movimientos anteriores se conservan, y se puede reactivar después.
          </p>
          {desactivarPrenda.error ? (
            <div className="mt-3">
              <Aviso tipo="error">{mensajeDeError(desactivarPrenda.error)}</Aviso>
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-3">
            <Boton variante="secundario" onClick={() => setDesactivando(null)}>
              Cancelar
            </Boton>
            <Boton
              onClick={() => desactivarPrenda.mutate(desactivando.id)}
              disabled={desactivarPrenda.isPending}
            >
              {desactivarPrenda.isPending ? 'Desactivando...' : 'Desactivar'}
            </Boton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function ModalNuevaPrenda({
  categorias,
  alCerrar,
  alCrear,
}: {
  categorias: CategoriaUniforme[];
  alCerrar: () => void;
  alCrear: () => void;
}) {
  const [datos, setDatos] = useState({
    categoriaId: categorias[0]?.id ?? '',
    nombre: '',
    descripcion: '',
    tipoTalla: 'LETRA' as 'LETRA' | 'NUMERO',
  });

  const crear = useMutation({
    mutationFn: () =>
      api('/uniformes/prendas', {
        method: 'POST',
        body: {
          categoriaId: datos.categoriaId,
          nombre: datos.nombre.trim(),
          tipoTalla: datos.tipoTalla,
          ...(datos.descripcion.trim() ? { descripcion: datos.descripcion.trim() } : {}),
        },
      }),
    onSuccess: alCrear,
  });

  return (
    <Modal titulo="Nueva prenda" alCerrar={alCerrar}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Categoría</span>
          <select
            value={datos.categoriaId}
            onChange={(evento) => setDatos({ ...datos, categoriaId: evento.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Nombre</span>
          <input
            autoFocus
            value={datos.nombre}
            onChange={(evento) => setDatos({ ...datos, nombre: evento.target.value })}
            placeholder="Polo institucional"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Descripción <span className="font-normal text-slate-400">(opcional)</span>
          </span>
          <input
            value={datos.descripcion}
            onChange={(evento) => setDatos({ ...datos, descripcion: evento.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Tipo de talla</span>
          <select
            value={datos.tipoTalla}
            onChange={(evento) =>
              setDatos({ ...datos, tipoTalla: evento.target.value as 'LETRA' | 'NUMERO' })
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="LETRA">Letras (XS, S, M, L, XL)</option>
            <option value="NUMERO">Números (28, 30, 32...)</option>
          </select>
        </label>

        <p className="text-xs text-slate-500">
          Las tallas se agregan después, una por una, con su precio.
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
          disabled={datos.nombre.trim().length === 0 || crear.isPending}
        >
          {crear.isPending ? 'Creando...' : 'Crear'}
        </Boton>
      </div>
    </Modal>
  );
}

function ModalNuevaTalla({
  prenda,
  alCerrar,
  alCrear,
}: {
  prenda: Prenda;
  alCerrar: () => void;
  alCrear: () => void;
}) {
  const [talla, setTalla] = useState('');
  const [precio, setPrecio] = useState('');
  const [minimo, setMinimo] = useState('0');

  const crear = useMutation({
    mutationFn: () =>
      api(`/uniformes/prendas/${prenda.id}/variantes`, {
        method: 'POST',
        body: {
          talla: talla.trim(),
          precioCentavos: Math.round(Number.parseFloat(precio.replace(',', '.')) * 100),
          stockMinimo: Number.parseInt(minimo, 10) || 0,
        },
      }),
    onSuccess: alCrear,
  });

  const precioValido = Number.isFinite(Number.parseFloat(precio.replace(',', '.')));

  return (
    <Modal titulo={`Agregar talla a ${prenda.nombre}`} alCerrar={alCerrar}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Talla{' '}
            <span className="font-normal text-slate-400">
              ({prenda.tipoTalla === 'LETRA' ? 'XS, S, M, L, XL' : '28, 30, 32...'})
            </span>
          </span>
          <input
            autoFocus
            value={talla}
            onChange={(evento) => setTalla(evento.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Precio en Q</span>
          <input
            value={precio}
            inputMode="decimal"
            onChange={(evento) => setPrecio(evento.target.value)}
            placeholder="85.00"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Mínimo para avisar
          </span>
          <input
            value={minimo}
            inputMode="numeric"
            onChange={(evento) => setMinimo(evento.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <p className="text-xs text-slate-500">
          Arranca sin existencias. Para ingresarlas se usa Inventario.
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
          disabled={talla.trim().length === 0 || !precioValido || crear.isPending}
        >
          {crear.isPending ? 'Agregando...' : 'Agregar'}
        </Boton>
      </div>
    </Modal>
  );
}
