import { describe, expect, it } from 'vitest';
import { skuBolsa, skuVariante, slug } from '../../src/shared/sku.js';

describe('sku', () => {
  it('quita acentos y normaliza', () => {
    expect(slug('Pantalón formal')).toBe('PANTALON-FORMAL');
    expect(slug('3ro Primaria')).toBe('3RO-PRIMARIA');
  });

  it('distingue prendas con el mismo nombre en categorias distintas', () => {
    const diario = skuVariante('DIARIO', 'Chumpa institucional', 'M');
    const fisica = skuVariante('FISICA', 'Chumpa deportiva', 'M');
    expect(diario).toBe('UNI-DIARIO-CHUMPA-INSTITUCIONAL-M');
    expect(fisica).not.toBe(diario);
  });

  it('incluye el anio en el sku de la bolsa, y la version solo desde la 2', () => {
    expect(skuBolsa('4to Primaria', 2026, 1)).toBe('BOL-4TO-PRIMARIA-2026');
    expect(skuBolsa('4to Primaria', 2026, 2)).toBe('BOL-4TO-PRIMARIA-2026-V2');
  });
});
