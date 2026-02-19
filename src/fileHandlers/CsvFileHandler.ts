import { TFile, App } from 'obsidian';
import { ITableFileHandler } from './ITableFileHandler';
import { TableData, ColumnDef, CellData } from '../types';
import { parseCsv, generateCsv } from '../utils/csv';

export class CsvFileHandler implements ITableFileHandler {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async read(file: TFile): Promise<TableData> {
        const content = await this.app.vault.read(file);
        const result = parseCsv(content);

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
        const csvContent = generateCsv(data.columns, data.rows);
        await this.app.vault.process(file, () => csvContent);
    }
}
