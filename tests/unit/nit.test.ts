import { describe, expect, it } from 'vitest';
import { interpretarNit, nitParaMostrar, nitSospechoso } from '../../src/shared/nit.js';

/**
 * Azucar para las pruebas: el NIT ya interpretado. Falla si se rechazo o si
 * salio consumidor final, que son casos con sus propias pruebas.
 */
function nit(valor: string) {
  const resultado = interpretarNit(valor);
  if (!resultado.ok) throw new Error(`se rechazo ${valor}: ${resultado.motivo}`);
  if (resultado.nit === null) throw new Error(`${valor} se leyo como consumidor final`);
  return resultado.nit;
}

describe('interpretarNit, NIT clasico', () => {
  /**
   * Estos son NIT conocidos, con la cuenta hecha a mano en el comentario de
   * nit.ts. Son los que fijan que el algoritmo del verificador clasico sea el
   * correcto: si alguien lo "mejora" y estos fallan, lo que se rompio es el
   * algoritmo, no la prueba.
   */
  it.each([
    ['42932-5', '429325'],
    ['3602978-5', '36029785'],
  ])('acepta %s y lo guarda como %s', (escrito, guardado) => {
    expect(nit(escrito)).toEqual({ valor: guardado, forma: 'CLASICO', verificado: true });
  });

  it('acepta el verificador K, que vale 10', () => {
    expect(nit('1000002-K')).toEqual({ valor: '1000002K', forma: 'CLASICO', verificado: true });
  });

  it('acepta el verificador 0, que es el resto 11', () => {
    // 8 digitos, asi que no choca con la forma ambigua de 9.
    expect(nit('14-0')).toEqual({ valor: '140', forma: 'CLASICO', verificado: true });
  });

  /**
   * Un verificador que no cuadra se GUARDA y se marca, no se rechaza: rechazarlo
   * seria no poder cobrar con el papa enfrente. El aviso es de la pantalla.
   */
  it('marca pero no rechaza un verificador que no cuadra', () => {
    const resultado = interpretarNit('42932-6');
    expect(resultado.ok).toBe(true);
    expect(nit('42932-6')).toEqual({ valor: '429326', forma: 'CLASICO', verificado: false });
    expect(nitSospechoso('429326')).toBe(true);
  });
});

describe('interpretarNit, NIT que sale del DPI', () => {
  /**
   * Los 13 digitos del CUI completo. El verificador NO se comprueba porque el
   * RENAP no publica su algoritmo; lo que si es oficial es la estructura, y de
   * ahi sale la unica comprobacion posible: el departamento.
   */
  it('acepta el CUI completo de 13 digitos sin opinar del verificador', () => {
    expect(nit('2510863450101')).toEqual({
      valor: '2510863450101',
      forma: 'DPI_13',
      verificado: null,
    });
  });

  it('acepta los 22 departamentos', () => {
    for (let departamento = 1; departamento <= 22; departamento += 1) {
      const codigo = String(departamento).padStart(2, '0');
      expect(nit(`251086345${codigo}01`).forma).toBe('DPI_13');
    }
  });

  it.each(['2510863450001', '2510863452301', '2510863459901'])(
    'rechaza %s porque ese departamento no existe',
    (valor) => {
      const resultado = interpretarNit(valor);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.motivo).toContain('departamento');
    },
  );

  /**
   * Nueve digitos es genuinamente ambiguo: encaja igual como clasico de 8 mas
   * verificador que como los primeros 9 del CUI. Por eso no se opina del
   * verificador, para no avisar en falso sobre un DPI que esta bien.
   */
  it('no opina del verificador cuando hay 9 digitos', () => {
    expect(nit('251086345')).toEqual({
      valor: '251086345',
      forma: 'AMBIGUO',
      verificado: null,
    });
    expect(nitSospechoso('251086345')).toBe(false);
  });
});

describe('interpretarNit, normalizacion', () => {
  it.each([
    ['429325', '429325'],
    [' 3602978 - 5 ', '36029785'],
    ['3.602.978-5', '36029785'],
    ['1000002k', '1000002K'],
    ['2510 86345 0101', '2510863450101'],
  ])('normaliza %s a %s', (escrito, esperado) => {
    expect(nit(escrito).valor).toBe(esperado);
  });

  /**
   * Vacio, CF o nada significan consumidor final, que es el caso normal: la
   * mayoria de los papas no da NIT. Se guarda null, no la cadena "CF", para que
   * "no dio NIT" sea un solo valor en la base y no tres.
   */
  it.each(['', '   ', 'CF', 'C/F', 'c/f', 'consumidor final', null, undefined])(
    'trata %s como consumidor final',
    (valor) => {
      expect(interpretarNit(valor)).toEqual({ ok: true, nit: null });
    },
  );
});

describe('interpretarNit, lo que si se rechaza', () => {
  it.each(['abc', '5', 'K', '1234-X', '1234567A', '12 34 ab'])('rechaza %s', (valor) => {
    expect(interpretarNit(valor).ok).toBe(false);
  });

  /**
   * El guion no significa nada: se quita antes de mirar el dato. Asi que "12-34"
   * no es un NIT raro, es el NIT 1234 escrito con un guion de mas, y se acepta
   * como cualquier otro clasico corto.
   */
  it('no le da significado a donde iba el guion', () => {
    expect(nit('12-34').valor).toBe('1234');
    expect(nit('1-234').valor).toBe('1234');
  });

  it('rechaza algo mas largo que un CUI', () => {
    const resultado = interpretarNit('12345678901234');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain('digitos');
  });
});

describe('presentacion', () => {
  it('muestra C/F cuando no hay NIT', () => {
    expect(nitParaMostrar(null)).toBe('C/F');
  });

  it('muestra el NIT tal cual cuando hay', () => {
    expect(nitParaMostrar('36029785')).toBe('36029785');
  });

  it('no marca como sospechoso lo que no se puede comprobar', () => {
    expect(nitSospechoso(null)).toBe(false);
    expect(nitSospechoso('2510863450101')).toBe(false);
    expect(nitSospechoso('429325')).toBe(false);
  });
});
