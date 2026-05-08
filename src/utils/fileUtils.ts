import { App, TFile } from 'obsidian';
import { ITableFileHandler } from '../fileHandlers/ITableFileHandler';
import { MarkdownFileHandler } from '../fileHandlers/MarkdownFileHandler';
import { JsonFileHandler } from '../fileHandlers/JsonFileHandler';
import { CsvFileHandler } from '../fileHandlers/CsvFileHandler';
import { ViewDef, JsonTableSettings } from '../types';
import { generateViewId } from './migrateUtils';

/**
 * Returns the appropriate file handler for a given file.
 * @param app The Obsidian App instance
 * @param file The file to get a handler for
 * @param settings Optional settings to check for CSV support
 * @returns The matching file handler or null if not supported
 */
export function getHandlerForFile(app: App, file: TFile, settings?: JsonTableSettings): ITableFileHandler | null {
    if (file.name.endsWith('.table.md')) {
        return new MarkdownFileHandler(app);
    } else if (file.name.endsWith('.table.json')) {
        return new JsonFileHandler(app);
    } else if (file.name.endsWith('.csv') && settings?.enableCsvSupport) {
        return new CsvFileHandler(app);
    }
    return null;
}

/**
 * Creates a default view definition.
 * Used when initializing new tables or migrating old data.
 */
export function createDefaultView(): ViewDef {
    return {
        id: generateViewId(),
        name: 'Default',
        sorts: [],
        filters: [],
        hiddenColumns: [],
        columnOrder: [],
    };
}
