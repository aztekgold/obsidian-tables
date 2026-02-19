/**
 * Utility functions for handling CSV parsing and generation.
 */

import { TableData, ColumnDef, CellData } from '../types';

/**
 * Escapes a string for use in a CSV field.
 */
export function escapeCsvField(field: string): string {
    if (field === null || field === undefined) return '';
    let stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') || stringField.includes('\r')) {
        stringField = stringField.replace(/"/g, '""');
        return `"${stringField}"`;
    }
    return stringField;
}

/**
 * Parses a single CSV line, handling quoted values.
 */
export function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim()); // Trim whitespace around unquoted fields? 
            // Standard CSV parsers usually preserve whitespace unless configured otherwise.
            // But existing implementation trimmed, so keeping it consistent.
            current = '';
        } else {
            current += char;
        }
    }

    // Add last field
    result.push(current.trim());
    return result;
}

/**
 * Parses CSV content into columns and rows.
 */
export function parseCsv(content: string): { columns: string[], rows: string[][] } | null {
    try {
        // Handle different kinds of line endings
        const lines = content.split(/\r\n|\n|\r/).filter(line => line.trim());
        if (lines.length < 1) {
            return { columns: [], rows: [] };
        }

        // Parse header row
        const headers = parseCsvLine(lines[0]);

        // Parse data rows
        const rows: string[][] = [];
        for (let i = 1; i < lines.length; i++) {
            const row = parseCsvLine(lines[i]);
            // Only add rows with the correct number of columns?
            // Or allow jagged arrays? Existing implementation enforced strict column count in importCSVFile but loose in CsvFileHandler.
            // Let's implement robust handling here:
            rows.push(row);
        }

        return { columns: headers, rows };
    } catch (error) {
        console.error('Error parsing CSV:', error);
        return null;
    }
}

/**
 * Generates a CSV string from columns and rows.
 */
export function generateCsv(columns: ColumnDef[], rows: CellData[][]): string {
    const csvRows: string[] = [];

    // Header
    const headerRow = columns.map(col => escapeCsvField(col.name)).join(',');
    csvRows.push(headerRow);

    // Data
    rows.forEach(row => {
        const rowData = columns.map(col => {
            const cell = row.find((c: any) => c.column === col.id);
            return escapeCsvField(cell?.value || '');
        });
        csvRows.push(rowData.join(','));
    });

    return csvRows.join('\n');
}

/**
 * Generates a generic CSV string from raw string arrays (for simple exports not tied to TableData/CellData).
 */
export function generateSimpleCsv(headers: string[], rows: string[][]): string {
    const csvRows: string[] = [];
    csvRows.push(headers.map(escapeCsvField).join(','));
    rows.forEach(row => {
        csvRows.push(row.map(escapeCsvField).join(','));
    });
    return csvRows.join('\n');
}


/**
 * Helper to download CSV content in the browser.
 */
export function downloadCsv(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
