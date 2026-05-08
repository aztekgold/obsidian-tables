import { App, TFile, Notice } from 'obsidian';
import { TableData } from '../types';
import { JsonTableView } from '../JsonTableView';
import { AbstractTableRenderer } from '../renderers/AbstractTableRenderer';

export interface MockViewOptions {
    app: App;
    saveTableData: (data: TableData) => Promise<void>;
    getFilePath: () => string;
    getRenderer: () => AbstractTableRenderer | null;
    onRender?: () => void;
}

/**
 * Creates a mock implementation of JsonTableView for use in embedded or inline renderers.
 */
export function createMockView(options: MockViewOptions): JsonTableView {
    const { app, saveTableData, getFilePath, getRenderer, onRender } = options;

    return {
        app,
        saveTableData,
        getFilePath,
        renameFile: (newName: string): Promise<boolean> => {
            // Renaming is generally not supported in embedded/inline contexts
            // or should be handled by the parent view/file explorer
            new Notice("Renaming from within this view is not supported.");
            return Promise.resolve(false);
        },
        getRenderer,
        renderContent: (file: TFile): Promise<void> => {
            // Trigger a re-render of the table component
            const renderer = getRenderer();
            if (renderer) {
                renderer.render();
            }
            if (onRender) onRender();
            return Promise.resolve();
        },
        // Mock other methods if necessary, defaulting to no-ops or appropriate behavior
    } as unknown as JsonTableView;
}
