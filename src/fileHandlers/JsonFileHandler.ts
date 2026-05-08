import { App, TFile } from 'obsidian';
import { TableData, AGENTABLE_VERSION } from '../types';
import { ITableFileHandler } from './ITableFileHandler';
import { createDefaultView } from '../utils/fileUtils';
import { isOldFormat, migrateToAgentable, ensureViewsValid } from '../utils/migrateUtils';

export class JsonFileHandler implements ITableFileHandler {

  constructor(private app: App) {}

  async read(file: TFile): Promise<TableData> {
    const content = await this.app.vault.read(file);

    if (!content) {
      return {
        version: AGENTABLE_VERSION,
        metadata: { title: file.basename },
        columns: [],
        rows: [],
        views: [createDefaultView()],
      };
    }

    try {
      const raw = JSON.parse(content);

      let data: TableData;
      if (isOldFormat(raw)) {
        data = migrateToAgentable(raw, file.name);
      } else {
        data = raw as TableData;
      }

      ensureViewsValid(data);

      if (!data.columns || !data.rows || !data.views) {
        throw new Error('Invalid table JSON: missing columns, rows, or views.');
      }

      return data;
    } catch (e) {
      console.error(`Error reading JSON file ${file.path}:`, e);
      throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }
  }

  async save(file: TFile, data: TableData): Promise<void> {
    try {
      ensureViewsValid(data);
      const jsonString = JSON.stringify(data, null, 2);
      await this.app.vault.process(file, () => jsonString);
    } catch (e) {
      console.error(`Error saving JSON file ${file.path}:`, e);
      throw new Error(`Failed to save file: ${(e as Error).message}`);
    }
  }
}
