/**
 * Las fechas se mandan al backend como YYYY-MM-DD y el backend resuelve los
 * limites del dia en hora de Guatemala. Aqui no se hace aritmetica de zonas.
 */

/** YYYY-MM-DD de hoy, en la zona del navegador. */
export function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function haceDiasISO(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toLocaleDateString('en-CA');
}

export function primerDiaDelMesISO(): string {
  const fecha = new Date();
  fecha.setDate(1);
  return fecha.toLocaleDateString('en-CA');
}

/** "25/10, 10:50 p. m." — compacto para una tabla. */
export function fechaHoraCorta(iso: string): string {
  const fecha = new Date(iso);
  return `${fecha.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit' })}, ${fecha.toLocaleTimeString(
    'es-GT',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

export function fechaLarga(isoDia: string): string {
  // isoDia es YYYY-MM-DD; se arma como fecha local, no UTC.
  const [anio, mes, dia] = isoDia.split('-').map(Number);
  if (!anio || !mes || !dia) return isoDia;
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-GT', { dateStyle: 'full' });
}
