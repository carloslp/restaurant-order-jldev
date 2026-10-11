// src/lib/csv.ts
// Utilidades de parseo y serialización CSV conformes a RFC 4180
// con soporte para BOM UTF-8 y auto-detección de delimitadores (, y ;).

export interface CsvParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
}

export interface CsvGenerateColumn {
  key: string;
  label: string;
}

export interface CsvGenerateOptions {
  delimiter?: string;
  includeBom?: boolean;
}

/**
 * Detecta el delimitador más probable en el encabezado (coma o punto y coma).
 */
export function detectDelimiter(csvText: string): string {
  // Tomamos la primera línea no vacía
  const firstLine = csvText.split(/\r\n|\n|\r/)[0] ?? '';
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;

  for (let i = 0; i < firstLine.length; i++) {
    const char = firstLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ',') commas++;
      else if (char === ';') semicolons++;
    }
  }

  return semicolons > commas ? ';' : ',';
}

/**
 * Parsea un texto CSV respetando RFC 4180 (comillas, comillas escapadas "", saltos de línea).
 */
export function parseCsv(
  csvText: string,
  options?: CsvParseOptions
): { headers: string[]; rows: Record<string, string>[] } {
  // Remover BOM si está presente
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  const delimiter = options?.delimiter ?? detectDelimiter(cleanText);
  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < cleanText.length) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Comilla escapada ("")
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Fin de comillas
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }

    // Fuera de comillas
    if (char === '"') {
      inQuotes = true;
      i++;
    } else if (char === delimiter) {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
    } else if (char === '\r' && nextChar === '\n') {
      currentRow.push(currentField.trim());
      matrix.push(currentRow);
      currentRow = [];
      currentField = '';
      i += 2;
    } else if (char === '\n' || char === '\r') {
      currentRow.push(currentField.trim());
      matrix.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
    } else {
      currentField += char;
      i++;
    }
  }

  // Si quedó campo pendiente o fila sin cerrar
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    matrix.push(currentRow);
  }

  // Filtrar filas completamente vacías
  const validRows = matrix.filter((row) => row.some((cell) => cell.length > 0));

  if (validRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = validRows[0];
  const headers = rawHeaders.map((h) => h.trim());
  const dataRows = validRows.slice(1);

  const rows: Record<string, string>[] = [];
  for (const row of dataRows) {
    const record: Record<string, string> = {};
    for (let hIdx = 0; hIdx < headers.length; hIdx++) {
      const headerKey = headers[hIdx];
      record[headerKey] = row[hIdx] ?? '';
    }
    rows.push(record);
  }

  return { headers, rows };
}

/**
 * Escapa un valor individual para CSV según RFC 4180.
 */
export function escapeCsvField(val: unknown, delimiter = ','): string {
  if (val === null || val === undefined) return '';
  const str = String(val);

  // Si contiene comillas, saltos de línea o el delimitador, se envuelve entre comillas y se duplican las comillas internas
  if (str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(delimiter)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Genera un string CSV a partir de columnas y registros.
 */
export function generateCsv(
  columns: CsvGenerateColumn[],
  data: Record<string, any>[],
  options?: CsvGenerateOptions
): string {
  const delimiter = options?.delimiter ?? ',';
  const includeBom = options?.includeBom ?? true;

  const headerLine = columns
    .map((col) => escapeCsvField(col.label, delimiter))
    .join(delimiter);

  const lines: string[] = [headerLine];

  for (const item of data) {
    const rowLine = columns
      .map((col) => escapeCsvField(item[col.key], delimiter))
      .join(delimiter);
    lines.push(rowLine);
  }

  const csvBody = lines.join('\r\n');
  return includeBom ? `\uFEFF${csvBody}` : csvBody;
}
