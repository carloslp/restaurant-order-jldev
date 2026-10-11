import { describe, it, expect } from 'vitest';
import { parseCsv, generateCsv, detectDelimiter, escapeCsvField } from '@/lib/csv';

describe('CSV Utility (RFC 4180)', () => {
  it('detecta correctamente delimitadores de coma y punto y coma', () => {
    expect(detectDelimiter('categoria,producto,precio')).toBe(',');
    expect(detectDelimiter('categoria;producto;precio')).toBe(';');
    expect(detectDelimiter('categoria,"producto; con coma",precio')).toBe(',');
  });

  it('escapa campos con comas, comillas y saltos de línea', () => {
    expect(escapeCsvField('Hamburguesa simple')).toBe('Hamburguesa simple');
    expect(escapeCsvField('Hamburguesa, con papas')).toBe('"Hamburguesa, con papas"');
    expect(escapeCsvField('Carne 100% "Angus"')).toBe('"Carne 100% ""Angus"""');
    expect(escapeCsvField('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"');
  });

  it('parsea CSV con comas estándar y remueve BOM UTF-8', () => {
    const csvContent = '\uFEFFcategoria,producto,precio\nHamburguesas,Clásica,120\nBebidas,Refresco,35';
    const { headers, rows } = parseCsv(csvContent);

    expect(headers).toEqual(['categoria', 'producto', 'precio']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      categoria: 'Hamburguesas',
      producto: 'Clásica',
      precio: '120',
    });
    expect(rows[1]).toEqual({
      categoria: 'Bebidas',
      producto: 'Refresco',
      precio: '35',
    });
  });

  it('parsea CSV delimitado por punto y coma (formato Excel ES)', () => {
    const csvContent = 'categoria;producto;precio\nHamburguesas;Doble Carne;150,50';
    const { headers, rows } = parseCsv(csvContent);

    expect(headers).toEqual(['categoria', 'producto', 'precio']);
    expect(rows).toHaveLength(1);
    expect(rows[0].producto).toBe('Doble Carne');
  });

  it('soporta comillas escapadas y saltos de línea dentro de campos entrecomillados', () => {
    const csvContent = 'categoria,producto,descripcion\nComida,"Hamburguesa ""Especial""", "Con lechuga,\ntomate y queso"';
    const { rows } = parseCsv(csvContent);

    expect(rows).toHaveLength(1);
    expect(rows[0].producto).toBe('Hamburguesa "Especial"');
    expect(rows[0].descripcion).toBe('Con lechuga,\ntomate y queso');
  });

  it('genera CSV con BOM UTF-8 y preserva caracteres en español', () => {
    const columns = [
      { key: 'categoria', label: 'Categoría' },
      { key: 'producto', label: 'Platillo / Bebida' },
      { key: 'precio', label: 'Precio ($)' },
    ];
    const data = [
      { categoria: 'Acompañamientos', producto: 'Papas con jalapeños', precio: 65 },
    ];

    const result = generateCsv(columns, data, { includeBom: true });
    expect(result.startsWith('\uFEFF')).toBe(true);
    expect(result).toContain('Categoría,Platillo / Bebida,Precio ($)');
    expect(result).toContain('Acompañamientos,Papas con jalapeños,65');
  });
});
