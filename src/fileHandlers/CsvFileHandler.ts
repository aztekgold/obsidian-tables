import { TFile, App } from 'obsidian';
import { ITableFileHandler } from './ITableFileHandler';
import { TableData, ColumnDef, CellData } from '../types';

export class CsvFileHandler implements ITableFileHandler {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async read(file: TFile): Promise<TableData> {
        const content = await this.app.vault.read(file);
        const result = this.parseCSV(content);

        if (!result) {
            throw new Error("Failed to parse CSV file");
        }

        const { columns, rows } = result;

        // Create column definitions
        const columnDefs: ColumnDef[] = columns.map((name, index) => ({
            id: `col_${index}`,
            name: name,
            type: 'text',
            width: 150
        }));

        // Transform rows to CellData
        const rowData: CellData[][] = rows.map(row => {
            return row.map((value, index) => ({
                column: `col_${index}`,
                value: value
            }));
        });

        return {
            columns: columnDefs,
            rows: rowData,
            views: [{
                id: 'default',
                name: 'Default',
                sort: [],
                filter: []
            }]
        };
    }

    async save(file: TFile, data: TableData): Promise<void> {
        const csvContent = this.generateCSV(data);
        await this.app.vault.modify(file, csvContent);
    }

    private parseCSV(content: string): { columns: string[], rows: string[][] } | null {
        // Handle different kinds of line endings
        const lines = content.split(/\r\n|\n|\r/).filter(line => line.trim());
        if (lines.length < 1) {
            return { columns: [], rows: [] };
        }

        // Parse header row
        const headers = this.parseCSVLine(lines[0]);

        // Parse data rows
        const rows: string[][] = [];
        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i]);
            // Attempt to match column count, or just take what we get
            // Ideally we pad or truncate to match headers, but for now just push
            // If row is shorter, subsequent columns will be undefined/empty when mapped
            rows.push(row);
        }

        return { columns: headers, rows };
    }

    private parseCSVLine(line: string): string[] {
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
                result.push(current); // Don't trim inside quotes? usually CSV parsers don't trim preserved spaces
                current = '';
            } else {
                current += char;
            }
        }

        // Add last field
        result.push(current);
        return result;
    }

    private generateCSV(data: TableData): string {
        const columns = data.columns;
        const rows = data.rows;

        const csvRows: string[] = [];

        // Header Row
        const headerRow = columns.map(col => this.escapeCsvField(col.name)).join(',');
        csvRows.push(headerRow);

        // Data Rows
        rows.forEach(row => {
            const rowData = columns.map(col => {
                const cell = row.find(c => c.column === col.id);
                return this.escapeCsvField(cell?.value || '');
            });
            csvRows.push(rowData.join(','));
        });

        return csvRows.join('\n');
    }

    private escapeCsvField(field: string): string {
        if (field === null || field === undefined) return '';
        let stringField = String(field);

        // Check if field contains comma, quote, or newline
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') || stringField.includes('\r')) {
            // Escape double quotes by doubling them
            stringField = stringField.replace(/"/g, '""');
            // Wrap in double quotes
            return `"${stringField}"`;
        }
        return stringField;
    }
}
