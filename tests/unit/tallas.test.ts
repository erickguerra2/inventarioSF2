import { describe, expect, it } from 'vitest';
import { normalizarTalla, ordenDeTalla } from '../../src/modules/uniformes/tallas.js';

describe('orden de tallas', () => {
  it('ordena las letras como las entiende una persona, no alfabeticamente', () => {
    const tallas = ['XL', 'S', 'M', 'XS', 'L'];
    const ordenadas = [...tallas].sort((a, b) => ordenDeTalla(a, 'LETRA') - ordenDeTalla(b, 'LETRA'));
    expect(ordenadas).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    // Alfabeticamente daria L, M, S, XL, XS, que no le sirve a nadie.
    expect([...tallas].sort()).not.toEqual(ordenadas);
  });

  it('usa el numero como orden en las tallas numericas', () => {
    expect(ordenDeTalla('28', 'NUMERO')).toBe(28);
    expect(ordenDeTalla('38', 'NUMERO')).toBe(38);
  });

  it('normaliza antes de guardar', () => {
    expect(normalizarTalla(' m ', 'LETRA')).toBe('M');
    expect(normalizarTalla('32', 'NUMERO')).toBe('32');
  });

  it('rechaza una talla que no existe', () => {
    expect(() => ordenDeTalla('mediana', 'LETRA')).toThrow();
    expect(() => normalizarTalla('treinta', 'NUMERO')).toThrow();
  });
});
