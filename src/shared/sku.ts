/** "3ro Primaria" -> "3RO-PRIMARIA". Sin acentos, para que el SKU sea legible y estable. */
export function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** UNI-DIARIO-POLO-INSTITUCIONAL-M */
export function skuVariante(codigoCategoria: string, nombrePrenda: string, talla: string): string {
  return `UNI-${slug(codigoCategoria)}-${slug(nombrePrenda)}-${slug(talla)}`;
}

/** BOL-4TO-PRIMARIA-2026 (y -V2 en adelante si la lista se versiona) */
export function skuBolsa(nombreGrado: string, anio: number, version: number): string {
  const base = `BOL-${slug(nombreGrado)}-${anio}`;
  return version > 1 ? `${base}-V${version}` : base;
}
