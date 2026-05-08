import { TFile, App } from 'obsidian';
import { ITableFileHandler } from './ITableFileHandler';
import { TableData, ColumnDef, AgentableRow, AGENTABLE_VERSION } from '../types';
import { parseCsv, generateCsv } from '../utils/csv';
import { createDefaultView } from '../utils/fileUtils';
import { generateRowId } from '../utils/migrateUtils';

export class CsvFileHandler implements ITableFileHandler {
  constructor(private app: App) {}

  async read(file: TFile): Promise<TableData> {
    const content = await this.app.vault.read(file);
    const result = parseCsv(content);

    if (!result) throw new Error('Failed to parse CSV file');

    const { columns, rows } = result;

    const columnDefs: ColumnDef[] = columns.map((name, index) => ({
      id: `col_${index.toString(36)}`,
      name,
      type: 'text',
      display: { width: 150 },
    }));

    const rowData: AgentableRow[] = rows.map(row => ({
      id: generateRowId(),
      cells: Object.fromEntries(row.map((value, i) => [`col_${i.toString(36)}`, value])),
    }));

    return {
      version: AGENTABLE_VERSION,
      metadata: { title: file.basename },
      columns: columnDefs,
      rows: rowData,
      views: [createDefaultView()],
    };
  }

  async save(file: TFile, data: TableData): Promise<void> {
    const csvContent = generateCsv(data.columns, data.rows);
    await this.app.vault.process(file, () => csvContent);
  }
}
