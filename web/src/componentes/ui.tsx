import type { ReactNode } from 'react';

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Titulo({ children, ayuda }: { children: ReactNode; ayuda?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold text-marca">{children}</h1>
      {ayuda ? <p className="mt-1 text-sm text-slate-600">{ayuda}</p> : null}
    </div>
  );
}

type TipoAviso = 'error' | 'info' | 'exito';

const ESTILOS_AVISO: Record<TipoAviso, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
  exito: 'border-green-200 bg-green-50 text-green-900',
};

export function Aviso({ tipo = 'info', children }: { tipo?: TipoAviso; children: ReactNode }) {
  return (
    <div
      role={tipo === 'error' ? 'alert' : undefined}
      className={`rounded-md border px-4 py-3 text-sm ${ESTILOS_AVISO[tipo]}`}
    >
      {children}
    </div>
  );
}

export function Boton({
  children,
  variante = 'primario',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' }) {
  const estilos =
    variante === 'primario'
      ? 'bg-marca text-white hover:bg-marca-claro disabled:bg-slate-400'
      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400';

  return (
    <button
      {...props}
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${estilos} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Campo({
  etiqueta,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{etiqueta}</span>
      <input
        {...props}
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-marca/30 ${
          error ? 'border-red-400' : 'border-slate-300'
        }`}
      />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-3 p-6 text-sm text-slate-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-marca" />
      {texto}
    </div>
  );
}

/** Q 125.50 a partir de 12550. El dinero viaja en centavos enteros. */
export function Quetzales({ centavos }: { centavos: number }) {
  return <span className="tabular-nums">Q {(centavos / 100).toFixed(2)}</span>;
}

export function EtiquetaRol({ rol }: { rol: string }) {
  const esAdmin = rol === 'ADMIN';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        esAdmin ? 'bg-marca/10 text-marca' : 'bg-green-100 text-green-900'
      }`}
    >
      {esAdmin ? 'Administradora' : 'Maestra'}
    </span>
  );
}
