import { MarkdownRenderChild, App, TFile, Notice } from 'obsidian';
import { TableData, JsonTableSettings } from './types';
import { DivTableRenderer } from './renderers/DivTableRenderer';
import { HtmlTableRenderer } from './renderers/HtmlTableRenderer';
import { AbstractTableRenderer } from './renderers/AbstractTableRenderer';
import { JsonTableView } from './JsonTableView';
import { MarkdownFileHandler } from './fileHandlers/MarkdownFileHandler';
import { JsonFileHandler } from './fileHandlers/JsonFileHandler';

export class EmbedTableRenderer extends MarkdownRenderChild {
    private renderer: AbstractTableRenderer | null = null;
    private data: TableData | null = null;

    constructor(
        containerEl: HTMLElement,
        private app: App,
        private file: TFile,
        private settings: JsonTableSettings
    ) {
        super(containerEl);
    }

    async onload() {
        try {
            // Read the file content
            const handler = this.getHandlerForFile(this.file);
            if (!handler) {
                this.containerEl.createDiv({ text: 'Unsupported file type for table embed.', cls: 'json-table-error' });
                return;
            }

            this.data = await handler.read(this.file);

            if (!this.data) {
                this.containerEl.createDiv({ text: 'Failed to read table data.', cls: 'json-table-error' });
                return;
            }

            // Create a mock view for the renderer
            const mockView = {
                app: this.app,
                saveTableData: async (data: TableData) => {
                    await this.saveToFile(data);
                },
                getFilePath: () => this.file.path,
                renameFile: async (newName: string): Promise<boolean> => {
                    // Renaming the embedded file from within the embed might be confusing or risky
                    // For now, let's disable it or just return false
                    new Notice("Renaming embedded files is not supported.");
                    return false;
                },
                getRenderer: () => this.renderer,
                renderContent: async (file: TFile) => {
                    // Re-render the table
                    if (this.renderer) {
                        this.renderer.render();
                    }
                }
            } as unknown as JsonTableView;

            // Clear the container (Obsidian might have put some default embed content)
            this.containerEl.empty();
            this.containerEl.addClass('json-table-embed-container');

            // --- Add Title Header ---
            const headerEl = this.containerEl.createEl('h3', { cls: 'json-table-embed-title' });
            const linkEl = headerEl.createEl('a', {
                text: this.file.basename,
                cls: 'internal-link'
            });

            // Handle click to open file
            linkEl.addEventListener('click', (e) => {
                e.preventDefault();
                this.app.workspace.openLinkText(this.file.path, '', true);
            });
            // ------------------------

            // Create a specific container for the table renderer so it doesn't clear our title
            const tableContainer = this.containerEl.createDiv();

            // Render the table
            if (this.settings.rendererType === 'div') {
                this.renderer = new DivTableRenderer(tableContainer, this.data, mockView, true, this.settings);
            } else {
                this.renderer = new HtmlTableRenderer(tableContainer, this.data, mockView, true, this.settings);
            }
            this.renderer.render();

        } catch (error) {
            console.error('Error rendering embedded table:', error);
            this.containerEl.createDiv({
                text: `Error rendering table: ${(error as Error).message}`,
                cls: 'json-table-error'
            });
        }
    }

    private getHandlerForFile(file: TFile) {
        if (file.name.endsWith('.table.md')) {
            return new MarkdownFileHandler(this.app);
        } else if (file.name.endsWith('.table.json')) {
            return new JsonFileHandler(this.app);
        }
        return null;
    }

    private async saveToFile(data: TableData) {
        const handler = this.getHandlerForFile(this.file);
        if (handler) {
            await handler.save(this.file, data);
            this.data = data;
        }
    }

    onunload() {
        this.renderer = null;
        this.data = null;
    }
}
