import { useEffect, useState } from 'react';

/**
 * Edicion en linea dentro de una tabla. La administradora va a corregir los 31
 * precios del catalogo de una sentada: abrir un modal por talla haria el trabajo
 * tres veces mas largo.
 *
 * Enter o salir del campo guarda; Escape cancela. No guarda si el valor no
 * cambio, para no mandar peticiones de mas ni ensuciar el historial de precios.
 */
function EnLinea({
  valorInicial,
  alGuardar,
  guardando,
  formato,
  etiqueta,
  ancho = 'w-24',
  sufijo,
}: {
  valorInicial: string;
  alGuardar: (texto: string) => void;
  guardando?: boolean;
  formato: (texto: string) => string;
  /** Qué se edita ("Precio", "Costo"...). Sin esto, una tabla con 15 campos
   *  editables tiene 15 botones que se llaman igual. */
  etiqueta: string;
  ancho?: string;
  sufijo?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valorInicial);

  // Si el dato cambia por fuera (otra pestana, un refetch), se refleja.
  useEffect(() => {
    if (!editando) setTexto(valorInicial);
  }, [valorInicial, editando]);

  function terminar() {
    setEditando(false);
    if (texto !== valorInicial) alGuardar(texto);
  }

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        disabled={guardando}
        aria-label={`${etiqueta}: ${formato(valorInicial)}. Clic para editar`}
        className={`rounded px-2 py-1 text-right tabular-nums hover:bg-slate-100 disabled:opacity-50 ${ancho}`}
      >
        {guardando ? '...' : formato(valorInicial)}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {sufijo ? <span className="text-xs text-slate-400">{sufijo}</span> : null}
      <input
        autoFocus
        value={texto}
        inputMode="decimal"
        onChange={(evento) => setTexto(evento.target.value)}
        onBlur={terminar}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') terminar();
          if (evento.key === 'Escape') {
            setTexto(valorInicial);
            setEditando(false);
          }
        }}
        className={`rounded border border-marca px-2 py-1 text-right tabular-nums outline-none ${ancho}`}
      />
    </span>
  );
}

/** Dinero: se muestra en quetzales y se guarda en centavos enteros. */
export function MontoEnLinea({
  centavos,
  alGuardar,
  guardando,
  etiqueta,
}: {
  centavos: number | null;
  alGuardar: (centavos: number | null) => void;
  guardando?: boolean;
  etiqueta: string;
}) {
  return (
    <EnLinea
      valorInicial={centavos === null ? '' : (centavos / 100).toFixed(2)}
      guardando={guardando}
      etiqueta={etiqueta}
      sufijo="Q"
      formato={(texto) => (texto === '' ? '—' : `Q ${texto}`)}
      alGuardar={(texto) => {
        const limpio = texto.trim();
        if (limpio === '') return alGuardar(null);
        const numero = Number.parseFloat(limpio.replace(',', '.'));
        if (!Number.isFinite(numero) || numero < 0) return;
        alGuardar(Math.round(numero * 100));
      }}
    />
  );
}

export function EnteroEnLinea({
  valor,
  alGuardar,
  guardando,
  etiqueta,
}: {
  valor: number;
  alGuardar: (valor: number) => void;
  guardando?: boolean;
  etiqueta: string;
}) {
  return (
    <EnLinea
      valorInicial={String(valor)}
      guardando={guardando}
      etiqueta={etiqueta}
      ancho="w-16"
      formato={(texto) => texto}
      alGuardar={(texto) => {
        const numero = Number.parseInt(texto.trim(), 10);
        if (!Number.isFinite(numero) || numero < 0) return;
        alGuardar(numero);
      }}
    />
  );
}
