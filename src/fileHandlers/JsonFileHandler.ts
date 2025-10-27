// src/fileHandlers/JsonFileHandler.ts
import { App, TFile } from 'obsidian';
import { TableData, DateFormat, DropdownOption, TypeOptions, DateTypeOptions, SelectTypeOptions, NoteLinkTypeOptions } from '../types'; // Adjust path if needed
import { ITableFileHandler } from './ITableFileHandler'; // Adjust path if needed

/**
 * Handles reading and writing table data directly as JSON files (.table.json).
 * Includes migration logic for older file formats.
 */
export class JsonFileHandler implements ITableFileHandler {

  constructor(private app: App) {}

  async read(file: TFile): Promise<TableData> {
    const content = await this.app.vault.read(file);

    // Handle empty file - return default structure
    if (!content) {
      console.warn(`File is empty: ${file.path}. Returning default structure.`);
      return {
          columns: [],
          rows: [],
          views: [{ id: 'default_' + Date.now(), name: 'Default', sort: [], filter: [] }]
      };
    }

    try {
      let data: TableData = JSON.parse(content);

      // --- Migration Logic ---

      // 1. Ensure 'views' array and default view exist
      if (!data.views || !Array.isArray(data.views) || data.views.length === 0) {
        data.views = [{
            id: 'default_' + Date.now(),
            name: 'Default',
            sort: [],
            filter: []
            // hiddenColumns: [] // Add if implementing hidden columns later
        }];
        // Ensure the first view has necessary properties if migrating
        if (!data.views[0].sort) data.views[0].sort = [];
        if (!data.views[0].filter) data.views[0].filter = [];
      } else {
        // Ensure existing first view has sort/filter arrays
        if (!data.views[0].sort) data.views[0].sort = [];
        if (!data.views[0].filter) data.views[0].filter = [];
      }


      // 2. Ensure 'typeOptions' exists and migrate old properties
      let migrationNeeded = false;
      data.columns.forEach(col => {
        if (!col.typeOptions) {
          migrationNeeded = true;
          col.typeOptions = {}; // Initialize empty object

          // Migrate known properties based on column type
          const oldCol = col as any; // Use 'any' temporarily for migration access
          if (col.type === 'date' && oldCol.dateFormat) {
            (col.typeOptions as DateTypeOptions).dateFormat = oldCol.dateFormat;
            delete oldCol.dateFormat;
          }
          if ((col.type === 'dropdown' || col.type === 'multiselect') && oldCol.options) {
             (col.typeOptions as SelectTypeOptions).options = oldCol.options;
             delete oldCol.options;
          }
          if (col.type === 'notelink' && oldCol.suggestAllFiles !== undefined) {
             (col.typeOptions as NoteLinkTypeOptions).suggestAllFiles = oldCol.suggestAllFiles;
             delete oldCol.suggestAllFiles;
          }
        }
      });

      // If migration happened, log it (saving happens separately if needed)
      if (migrationNeeded) {
      }
      // --- End Migration Logic ---


      // Basic validation after potential migration
      if (!data.columns || !data.rows || !data.views) { // Check views again
        throw new Error('Invalid table JSON structure: missing columns, rows, or views after migration.');
      }
      return data;

    } catch (e) {
      console.error(`Error parsing JSON file ${file.path}:`, e);
      throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }
  }

  async save(file: TFile, data: TableData): Promise<void> {
    try {
      // Ensure required structures exist before saving (belt-and-suspenders)
       if (!data.views || data.views.length === 0) {
           data.views = [{ id: 'default_'+Date.now(), name: 'Default', sort: [], filter: [] }];
       }
       if (!data.views[0].sort) data.views[0].sort = [];
       if (!data.views[0].filter) data.views[0].filter = [];
       data.columns.forEach(col => { if (!col.typeOptions) col.typeOptions = {}; });

      const jsonString = JSON.stringify(data, null, 2); // Pretty print
      await this.app.vault.modify(file, jsonString);
    } catch (e) {
      console.error(`Error saving JSON file ${file.path}:`, e);
      throw new Error(`Failed to save file: ${(e as Error).message}`);
    }
  }
}