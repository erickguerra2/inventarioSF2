export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** "Polo institucional - M" -> ["polo", "institucional", "m"] */
export function enPalabras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Cada palabra escrita tiene que calzar con el PRINCIPIO de alguna palabra del
 * objeto, no en cualquier parte.
 *
 * La diferencia no es teorica: buscando por subcadena, "polo m" tambien encuentra
 * la talla L, porque "Uniforme de diario" contiene una m. En una pantalla donde
 * Enter agrega el primer resultado, eso despacha la talla equivocada.
 */
export function calzaPorPalabras(palabrasDelObjeto: string[], consulta: string): boolean {
  return enPalabras(consulta).every((buscada) =>
    palabrasDelObjeto.some((palabra) => palabra.startsWith(buscada)),
  );
}
