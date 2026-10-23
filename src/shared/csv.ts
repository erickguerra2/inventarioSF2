export type Columna<T> = {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
};

function escapar(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  // Comillas dobles duplicadas y el campo entre comillas si trae separador,
  // comillas o salto de linea.
  if (/[";\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/**
 * CSV para abrir en Excel sin pelear:
 *
 * - **BOM UTF-8** al inicio: sin el, Excel en Windows abre "Lucía" como "LucÃ­a".
 * - **Punto y coma** como separador: Excel en configuracion regional de
 *   Guatemala/España parte por `;`, no por coma, y con coma todo cae en una celda.
 * - **CRLF** como fin de linea, que es lo que espera Excel.
 */
export function aCsv<T>(filas: T[], columnas: Array<Columna<T>>): string {
  const encabezado = columnas.map((columna) => escapar(columna.titulo)).join(';');
  const cuerpo = filas.map((fila) =>
    columnas.map((columna) => escapar(columna.valor(fila))).join(';'),
  );
  return `﻿${[encabezado, ...cuerpo].join('\r\n')}\r\n`;
}

export function nombreDeArchivo(base: string, sufijo?: string): string {
  const fecha = new Date().toISOString().slice(0, 10);
  return `${base}${sufijo ? `-${sufijo}` : ''}-${fecha}.csv`;
}
