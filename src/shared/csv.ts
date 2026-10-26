import { diaLocal } from './fechas.js';

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

/**
 * Cuando el reporte ya trae su propia etiqueta (el dia del corte, el
 * agrupamiento), esa es la que nombra el archivo. Solo cuando no hay ninguna se
 * usa la fecha de hoy, en hora de Guatemala (ver shared/fechas.ts).
 */
export function nombreDeArchivo(base: string, sufijo?: string): string {
  return `${base}-${sufijo ?? diaLocal()}.csv`;
}
