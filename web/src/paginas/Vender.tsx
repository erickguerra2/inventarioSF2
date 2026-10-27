import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api, ErrorApi } from '../api/cliente.ts';
import { mensajeDeError } from '../api/errores.ts';
import type { MetodoPago } from '../api/modelos.ts';
import { Recibo } from '../componentes/Recibo.tsx';
import { Aviso, Boton, Cargando, Quetzales, Tarjeta, Titulo } from '../componentes/ui.tsx';
import { aCentavos, useCarrito } from '../venta/carrito.ts';
import { buscar, useVendibles } from '../venta/vendibles.ts';

type VentaCreada = { id: string; correlativo: number; totalCentavos: number };

/**
 * En el colegio se cobra en efectivo o por transferencia. El deposito y la
 * tarjeta siguen existiendo en el backend —por si alguna vez se usan— pero no
 * tienen por que estorbar en cada venta: los dos comunes son botones de un clic
 * y los otros quedan detras de un enlace.
 */
const METODOS_COMUNES: Array<{ valor: MetodoPago; texto: string }> = [
  { valor: 'EFECTIVO', texto: 'Efectivo' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
];

const METODOS_OTROS: Array<{ valor: MetodoPago; texto: string }> = [
  { valor: 'DEPOSITO', texto: 'Depósito' },
  { valor: 'TARJETA', texto: 'Tarjeta' },
];

export function Vender() {
  const clienteConsultas = useQueryClient();
  const { vendibles, cargando, error } = useVendibles();
  const carrito = useCarrito();

  const [consulta, setConsulta] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [mostrarOtrosMetodos, setMostrarOtrosMetodos] = useState(false);
  const [compradorNombre, setCompradorNombre] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [descuento, setDescuento] = useState('');
  const [ventaId, setVentaId] = useState<string | null>(null);

  const campoBusqueda = useRef<HTMLInputElement>(null);

  /**
   * UNA clave por intento de venta, reusada en todos los reintentos. Es lo que
   * hace que el doble clic en "Cobrar" no cobre dos veces: si la clave ya se
   * uso, el backend responde la venta original en vez de crear otra.
   * Se renueva solo cuando empieza una venta nueva.
   */
  const [claveIdempotencia, setClaveIdempotencia] = useState(() => crypto.randomUUID());

  const resultados = useMemo(() => buscar(vendibles, consulta), [vendibles, consulta]);

  const descuentoCentavos = Math.min(aCentavos(descuento), carrito.subtotalCentavos);
  const totalCentavos = carrito.subtotalCentavos - descuentoCentavos;

  const cobrar = useMutation({
    mutationFn: () =>
      api<VentaCreada>('/ventas', {
        method: 'POST',
        idempotencyKey: claveIdempotencia,
        body: {
          metodoPago,
          lineas: carrito.lineas.map((linea) => ({
            itemId: linea.itemId,
            cantidad: linea.cantidad,
          })),
          ...(compradorNombre.trim() ? { compradorNombre: compradorNombre.trim() } : {}),
          ...(referenciaPago.trim() ? { referenciaPago: referenciaPago.trim() } : {}),
          ...(descuentoCentavos > 0 ? { descuentoCentavos } : {}),
        },
      }),
    onSuccess: (venta) => {
      setVentaId(venta.id);
      carrito.limpiar();
      setConsulta('');
      setCompradorNombre('');
      setReferenciaPago('');
      setDescuento('');
      setClaveIdempotencia(crypto.randomUUID());

      // El stock cambio, y el corte del dia tambien.
      void clienteConsultas.invalidateQueries({ queryKey: ['prendas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['bolsas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['corte-caja'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['alertas'] });
    },
    onError: (fallo) => {
      // Si fue por existencias, lo que tenemos en pantalla ya esta viejo.
      if (fallo instanceof ErrorApi && fallo.code === 'STOCK_INSUFICIENTE') {
        void clienteConsultas.invalidateQueries({ queryKey: ['prendas'] });
        void clienteConsultas.invalidateQueries({ queryKey: ['bolsas'] });
      }
    },
  });

  function alEscribir(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();

    // Enter agrega el primero disponible y limpia la busqueda: escribir, Enter,
    // escribir, Enter. Se vende con cola de gente esperando.
    const primero = resultados.find((vendible) => vendible.disponible);
    if (primero) {
      carrito.agregar(primero);
      setConsulta('');
    }
  }

  if (cargando) return <Cargando texto="Cargando el catálogo..." />;
  if (error) return <Aviso tipo="error">{mensajeDeError(error)}</Aviso>;

  return (
    <div>
      <Titulo ayuda="Busque, agregue y cobre. Enter agrega el primer resultado.">Vender</Titulo>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Buscador y resultados */}
        <div className="lg:col-span-3">
          <Tarjeta>
            <input
              ref={campoBusqueda}
              autoFocus
              value={consulta}
              onChange={(evento) => setConsulta(evento.target.value)}
              onKeyDown={alEscribir}
              placeholder="Buscar: polo m, pantalón 32, 4to primaria..."
              className="w-full rounded-md border border-slate-300 px-4 py-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
            />

            <p className="mt-2 text-xs text-slate-500">
              {resultados.length} de {vendibles.length} productos
            </p>

            <ul className="mt-3 max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
              {resultados.map((vendible) => (
                <li key={vendible.itemId}>
                  <button
                    type="button"
                    disabled={!vendible.disponible}
                    onClick={() => {
                      carrito.agregar(vendible);
                      // El foco vuelve al buscador: lo siguiente que va a hacer
                      // quien vende es escribir el siguiente producto.
                      campoBusqueda.current?.focus();
                    }}
                    className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {/* Miniatura de 200 px (~7 KB). La lista carga 37 de estas:
                          con los originales de 2.7 MB serian 100 MB. */}
                      {vendible.miniatura ? (
                        <img
                          src={vendible.miniatura}
                          alt=""
                          loading="lazy"
                          width={40}
                          height={40}
                          className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-white object-contain"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-400">
                          bolsa
                        </span>
                      )}

                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">
                          {vendible.titulo}
                        </span>
                        <span className="block text-sm text-slate-500">{vendible.detalle}</span>
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block font-medium text-azul">
                        <Quetzales centavos={vendible.precioCentavos} />
                      </span>
                      {vendible.disponible ? (
                        <span className="block text-xs text-slate-500">
                          quedan {vendible.stockActual}
                        </span>
                      ) : (
                        <span className="block text-xs font-medium text-red-700">Agotado</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}

              {resultados.length === 0 ? (
                <li className="py-6 text-center text-sm text-slate-500">
                  No se encontró nada con “{consulta}”.
                </li>
              ) : null}
            </ul>
          </Tarjeta>
        </div>

        {/* Carrito y cobro */}
        <div className="lg:col-span-2">
          <Tarjeta>
            <h2 className="mb-3 font-semibold text-azul">
              Venta {carrito.unidades > 0 ? `· ${carrito.unidades} unidad(es)` : ''}
            </h2>

            {carrito.lineas.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Todavía no hay nada. Busque un producto y agréguelo.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {carrito.lineas.map((linea) => (
                  <li key={linea.itemId} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {linea.titulo}
                        </p>
                        <p className="text-xs text-slate-500">{linea.detalle}</p>
                      </div>
                      <button
                        onClick={() => carrito.quitar(linea.itemId)}
                        className="shrink-0 text-xs text-slate-400 hover:text-red-700"
                        aria-label={`Quitar ${linea.titulo}`}
                      >
                        Quitar
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => carrito.cambiarCantidad(linea.itemId, linea.cantidad - 1)}
                          className="h-8 w-8 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                          aria-label="Menos uno"
                        >
                          −
                        </button>
                        <span className="w-10 text-center tabular-nums">{linea.cantidad}</span>
                        <button
                          onClick={() => carrito.cambiarCantidad(linea.itemId, linea.cantidad + 1)}
                          disabled={linea.cantidad >= linea.stockActual}
                          className="h-8 w-8 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          aria-label="Uno más"
                        >
                          +
                        </button>
                        {linea.cantidad >= linea.stockActual ? (
                          <span className="ml-1 text-xs text-slate-400">es todo lo que hay</span>
                        ) : null}
                      </div>

                      <span className="font-medium text-slate-900">
                        <Quetzales centavos={linea.precioCentavos * linea.cantidad} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700">Pago</span>

                <div className="flex gap-2">
                  {METODOS_COMUNES.map((metodo) => (
                    <button
                      key={metodo.valor}
                      type="button"
                      onClick={() => setMetodoPago(metodo.valor)}
                      aria-pressed={metodoPago === metodo.valor}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                        metodoPago === metodo.valor
                          ? 'border-marca bg-marca text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {metodo.texto}
                    </button>
                  ))}
                </div>

                {mostrarOtrosMetodos ? (
                  <select
                    value={
                      METODOS_OTROS.some((metodo) => metodo.valor === metodoPago)
                        ? metodoPago
                        : ''
                    }
                    onChange={(evento) => setMetodoPago(evento.target.value as MetodoPago)}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="" disabled>
                      Otro método...
                    </option>
                    {METODOS_OTROS.map((metodo) => (
                      <option key={metodo.valor} value={metodo.valor}>
                        {metodo.texto}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMostrarOtrosMetodos(true)}
                    className="mt-2 text-xs text-slate-500 underline hover:text-slate-700"
                  >
                    Otro método de pago
                  </button>
                )}
              </div>

              {metodoPago !== 'EFECTIVO' ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    No. de boleta o referencia
                  </span>
                  <input
                    value={referenciaPago}
                    onChange={(evento) => setReferenciaPago(evento.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Comprador <span className="font-normal text-slate-400">(opcional)</span>
                </span>
                <input
                  value={compradorNombre}
                  onChange={(evento) => setCompradorNombre(evento.target.value)}
                  placeholder="Nombre de quien compra"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Descuento en Q <span className="font-normal text-slate-400">(opcional)</span>
                </span>
                <input
                  value={descuento}
                  onChange={(evento) => setDescuento(evento.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <Quetzales centavos={carrito.subtotalCentavos} />
              </div>
              {descuentoCentavos > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <span>Descuento</span>
                  <span>
                    − <Quetzales centavos={descuentoCentavos} />
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between text-xl font-semibold text-azul">
                <span>Total</span>
                <Quetzales centavos={totalCentavos} />
              </div>
            </div>

            {cobrar.error ? (
              <div className="mt-3">
                <Aviso tipo="error">{mensajeDeError(cobrar.error)}</Aviso>
              </div>
            ) : null}

            <Boton
              onClick={() => cobrar.mutate()}
              disabled={carrito.lineas.length === 0 || cobrar.isPending}
              className="mt-4 w-full py-3 text-base"
            >
              {cobrar.isPending ? 'Cobrando...' : 'Cobrar'}
            </Boton>
          </Tarjeta>
        </div>
      </div>

      {ventaId ? <Recibo ventaId={ventaId} alCerrar={() => setVentaId(null)} /> : null}
    </div>
  );
}
