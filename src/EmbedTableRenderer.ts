import { MarkdownRenderChild, App, TFile } from 'obsidian';
import { TableData, JsonTableSettings, DEFAULT_SETTINGS } from './types';
import { DivTableRenderer } from './renderers/DivTableRenderer';
import { AbstractTableRenderer } from './renderers/AbstractTableRenderer';
import { getHandlerForFile } from './utils/fileUtils';
import { createMockView } from './utils/viewUtils';
import { generateViewId } from './utils/migrateUtils';

export class EmbedTableRenderer extends MarkdownRenderChild {
    private renderer: AbstractTableRenderer | null = null;
    private data: TableData | null = null;
    private _active = true;

    constructor(
        containerEl: HTMLElement,
        private app: App,
        private file: TFile,
        private settings: JsonTableSettings,
        private viewName: string | null = null
    ) {
        super(containerEl);
        if (!this.settings) {
            this.settings = Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    onload() {
        void (async () => {
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
                const mockView = createMockView({
                    app: this.app,
                    saveTableData: async (data: TableData) => {
                        await this.saveToFile(data);
                    },
                    getFilePath: () => this.file.path,
                    getRenderer: () => this.renderer
                });

                // Clear the container (Obsidian might have put some default embed content)
                this.containerEl.empty();
                this.containerEl.addClass('json-table-embed-container');

                // --- Add Title Header ---
                const headerEl = this.containerEl.createEl('h3', { cls: 'json-table-embed-title' });
                const linkEl = headerEl.createEl('a', {
                    text: this.file.basename,
                    cls: 'internal-link'
                });
                if (this.viewName) {
                    headerEl.createSpan({ text: ' › ', cls: 'json-table-embed-title-sep' });
                    headerEl.createSpan({ text: this.viewName, cls: 'json-table-embed-title-view' });
                }

                // Handle click to open file
                linkEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    void this.app.workspace.openLinkText(this.file.path, '', true);
                });
                // ------------------------

                // Resolve or create the requested view
                let lockedViewId: string | undefined;
                if (this.viewName) {
                    const existing = this.data.views.find(
                        v => v.name.toLowerCase() === this.viewName!.toLowerCase()
                    );
                    if (existing) {
                        lockedViewId = existing.id;
                    } else {
                        // Create the view immediately — the live preview extension only calls onload()
                        // once the cursor has moved outside the ![[...]] range, so the name is complete
                        const newId = generateViewId(new Set(this.data.views.map(v => v.id)));
                        this.data.views.push({
                            id: newId,
                            name: this.viewName,
                            sorts: [],
                            filters: [],
                            hiddenColumns: [],
                            columnOrder: [],
                        });
                        await this.saveToFile(this.data);
                        lockedViewId = newId;
                    }
                }

                // Create a specific container for the table renderer so it doesn't clear our title
                const tableContainer = this.containerEl.createDiv();

                // Render the table
                this.renderer = new DivTableRenderer(tableContainer, this.data, mockView, true, this.settings);
                if (lockedViewId) {
                    this.renderer.activeViewId = lockedViewId;
                    this.renderer.lockToView = true;
                }
                this.renderer?.render();

            } catch (error) {
                console.error('Error rendering embedded table:', error);
                this.containerEl.createDiv({
                    text: `Error rendering table: ${(error as Error).message}`,
                    cls: 'json-table-error'
                });
            }
        })();
    }

    private getHandlerForFile(file: TFile) {
        return getHandlerForFile(this.app, file, this.settings);
    }

    private async saveToFile(data: TableData) {
        const handler = this.getHandlerForFile(this.file);
        if (handler) {
            await handler.save(this.file, data);
            this.data = data;
        }
    }

    onunload() {
        this._active = false;
        this.renderer = null;
        this.data = null;
    }
}
