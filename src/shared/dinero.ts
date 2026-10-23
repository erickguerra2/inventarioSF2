/**
 * El dinero vive en centavos enteros en toda la aplicacion. Esto solo existe
 * para los bordes: CSV y recibos, donde hay que escribir "170.00".
 */
export function aQuetzales(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** "Q 170.00" para textos legibles. El frontend normalmente formatea por su cuenta. */
export function conSimbolo(centavos: number): string {
  return `Q ${aQuetzales(centavos)}`;
}
