/**
 * NIT guatemalteco: normalizacion, forma canonica y una comprobacion honesta.
 *
 * Para que sirve: la directora emite las facturas en el portal de la SAT al
 * final del dia, usando los recibos. El NIT hay que pedirlo EN LA VENTANILLA,
 * porque despues ya no hay a quien preguntarle.
 *
 * ===========================================================================
 * HOY CONVIVEN TRES FORMAS DE NIT, y esto es lo que manda el diseno:
 *
 *   1. CLASICO      cuerpo numerico + digito verificador 0-9 o K, con guion.
 *                   Es el de los contribuyentes inscritos de antes.
 *   2. DPI DE 9     los primeros 9 digitos del CUI del DPI (los 8 asignados
 *                   mas su verificador, sin el codigo de departamento ni el de
 *                   municipio). Desde octubre de 2023, todo contribuyente
 *                   individual nuevo recibe este.
 *   3. DPI DE 13    el CUI completo. La SAT esta completando la armonizacion
 *                   hacia esta forma.
 *
 * POR QUE NO SE RECHAZA UN NIT POR SU DIGITO VERIFICADOR:
 *
 * El verificador del NIT clasico se calcula por modulo 11 y esta comprobado
 * aqui con dos NIT conocidos (ver `verificadorClasico`). El del CUI se calcula
 * de OTRA forma —no puede ser la misma, porque la clasica a veces exige una K y
 * un CUI es todo numerico— y ni la SAT ni el RENAP publican el algoritmo.
 *
 * Entonces: comprobar el verificador del CUI a la adivinanza rechazaria DPI
 * validos, y rechazar un NIT significa no poder cobrar con el papa enfrente.
 * Eso es peor que no comprobar. Asi que de este modulo NADA bloquea una venta
 * por el verificador: se valida el formato, y el verificador se comprueba solo
 * cuando la forma del dato dice sin ambiguedad que es un NIT clasico. Lo demas
 * se guarda y, si algo huele raro, la pantalla de venta lo avisa sin frenar.
 *
 * La salida de emergencia de siempre sigue ahi: dejar el campo vacio es
 * consumidor final, que es el caso normal y perfectamente valido.
 * ===========================================================================
 */

/** Lo que la gente escribe cuando no va a dar NIT. */
const CONSUMIDOR_FINAL = new Set(['CF', 'C/F', 'CONSUMIDORFINAL']);

export const ETIQUETA_CONSUMIDOR_FINAL = 'C/F';

/** El RENAP asigna del 01 al 22; no hay departamento 00 ni 23. */
const DEPARTAMENTOS = 22;

export type FormaNit =
  | 'CLASICO' // cuerpo + verificador; el verificador SI se comprueba
  | 'DPI_9' // primeros 9 digitos del CUI
  | 'DPI_13' // CUI completo
  | 'AMBIGUO'; // 9 digitos: puede ser clasico o DPI, no hay como saber

/**
 * Verificador del NIT clasico, por modulo 11: cada digito del cuerpo se
 * multiplica por su posicion contada DESDE LA DERECHA empezando en 2, se suman,
 * y el verificador es `11 - (suma % 11)`.
 *
 * Comprobado con dos NIT conocidos:
 *   42932-5    -> 2*2 + 3*3 + 9*4 + 2*5 + 4*6 = 83;  83 % 11 = 6;  11-6 = 5  ✔
 *   3602978-5  -> 8*2 + 7*3 + 9*4 + 2*5 + 0*6 + 6*7 + 3*8 = 149; 149 % 11 = 6; 11-6 = 5  ✔
 *
 * Los dos casos de borde: resto 0 da 11, que es el verificador `0`; resto 1 da
 * 10, que se escribe `K`.
 */
function verificadorClasico(cuerpo: string): string {
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i += 1) {
    const digito = Number(cuerpo[cuerpo.length - 1 - i]);
    suma += digito * (i + 2);
  }

  const resultado = 11 - (suma % 11);
  if (resultado === 11) return '0';
  if (resultado === 10) return 'K';
  return String(resultado);
}

/**
 * Que forma tiene este NIT ya normalizado.
 *
 * La K solo existe en el NIT clasico, asi que delata la forma. Un dato de 9
 * digitos es genuinamente ambiguo: encaja igual de bien como clasico de 8 mas
 * verificador que como los primeros 9 del CUI, y no hay forma de distinguirlos
 * mirando el numero.
 */
function formaDe(normalizado: string): FormaNit {
  if (normalizado.endsWith('K')) return 'CLASICO';
  if (normalizado.length === 13) return 'DPI_13';
  if (normalizado.length === 9) return 'AMBIGUO';
  return 'CLASICO';
}

export type Nit = {
  /** Forma canonica guardada: solo digitos y, si acaso, la K final. */
  valor: string;
  forma: FormaNit;
  /**
   * `true` el verificador cuadra · `false` no cuadra · `null` no se pudo
   * comprobar, porque la forma es DPI o ambigua. `false` NO impide vender: es
   * para que la pantalla avise que conviene revisarlo.
   */
  verificado: boolean | null;
};

export type ResultadoNit =
  /** Consumidor final: el campo venia vacio o decia CF. Se guarda null. */
  | { ok: true; nit: null }
  | { ok: true; nit: Nit }
  /** Esto no se parece a un NIT en absoluto. Es lo UNICO que se rechaza. */
  | { ok: false; motivo: string };

/**
 * Normaliza y clasifica. Devuelve `null` para consumidor final, o el NIT en
 * forma canonica.
 *
 * Se guarda sin guiones a proposito: los NIT nuevos salen del DPI y ya no se
 * escriben con guion, asi que meterle uno a unos y no a otros solo daria dos
 * formas del mismo dato. Sin separadores hay una sola, y es la que se teclea
 * en el portal de la SAT.
 */
export function interpretarNit(valor: string | null | undefined): ResultadoNit {
  if (valor === null || valor === undefined) return { ok: true, nit: null };

  // Se quitan espacios, guiones y puntos: la gente escribe el NIT de todas las
  // formas posibles y ninguna esta mal.
  const limpio = valor.replace(/[\s.-]/g, '').toUpperCase();

  if (limpio === '') return { ok: true, nit: null };
  if (CONSUMIDOR_FINAL.has(limpio)) return { ok: true, nit: null };

  if (!/^[0-9]+[0-9K]$/.test(limpio)) {
    return {
      ok: false,
      motivo: 'debe ser solo numeros, y si lleva K va al final',
    };
  }

  // Menos de 2 no alcanza para cuerpo y verificador; mas de 13 no existe,
  // porque 13 es el CUI completo.
  if (limpio.length > 13) {
    return { ok: false, motivo: 'tiene mas digitos de los que puede tener un NIT' };
  }

  const forma = formaDe(limpio);

  if (forma === 'DPI_13') {
    // El algoritmo del verificador del CUI no lo publica el RENAP, pero la
    // estructura si: 8 asignados + 1 verificador + 2 departamento + 2 municipio.
    // El departamento es lo unico comprobable con datos oficiales.
    const departamento = Number(limpio.slice(9, 11));
    if (departamento < 1 || departamento > DEPARTAMENTOS) {
      return {
        ok: false,
        motivo: `los digitos 10 y 11 son el departamento del DPI y deben estar entre 01 y ${DEPARTAMENTOS}`,
      };
    }
    return { ok: true, nit: { valor: limpio, forma, verificado: null } };
  }

  if (forma === 'AMBIGUO') {
    return { ok: true, nit: { valor: limpio, forma, verificado: null } };
  }

  const cuerpo = limpio.slice(0, -1);
  const verificador = limpio.slice(-1);

  return {
    ok: true,
    nit: { valor: limpio, forma, verificado: verificadorClasico(cuerpo) === verificador },
  };
}

/** Para el recibo: el NIT, o la etiqueta de consumidor final. */
export function nitParaMostrar(nit: string | null): string {
  return nit ?? ETIQUETA_CONSUMIDOR_FINAL;
}

/**
 * Para la lista de ventas y la pantalla de venta: si este NIT guardado merece
 * un aviso. Solo dice `true` cuando la comprobacion es confiable.
 */
export function nitSospechoso(nit: string | null): boolean {
  if (nit === null) return false;
  const resultado = interpretarNit(nit);
  if (!resultado.ok || resultado.nit === null) return true;
  return resultado.nit.verificado === false;
}
