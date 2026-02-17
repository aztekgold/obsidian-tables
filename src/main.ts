// src/main.ts
import {
    Plugin,
    TFile,
    WorkspaceLeaf,
    App,
    PluginSettingTab,
    Setting,
    Notice,
    TAbstractFile, // Represents files OR folders
    ItemView // Base class used by JsonTableView now
} from 'obsidian';
import {
    JsonTableView
} from './JsonTableView';
import {
    VIEW_TYPE_JSON_TABLE,
    TableData,
    JsonTableSettings, // Assuming moved to types.ts
    DEFAULT_SETTINGS // Assuming moved to types.ts
} from './types'; // Central types file
// --- Import Handlers ---
import {
    ITableFileHandler
} from './fileHandlers/ITableFileHandler';
import {
    JsonFileHandler
} from './fileHandlers/JsonFileHandler';
import {
    MarkdownFileHandler
} from './fileHandlers/MarkdownFileHandler';
import {
    CsvFileHandler
} from './fileHandlers/CsvFileHandler';
import {
    InlineTableRenderer
} from './InlineTableRenderer';
import {
    EmbedTableRenderer
} from './EmbedTableRenderer';
import {
    tableEmbedExtension
} from './livePreviewExtension';
import { around } from 'monkey-around';



// --- Settings Tab Implementation ---
class JsonTableSettingTab extends PluginSettingTab {
    plugin: JsonTablePlugin;

    constructor(app: App, plugin: JsonTablePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {
            containerEl
        } = this;
        containerEl.empty();
        const mainHeading = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
        const mainInfo = mainHeading.createDiv({ cls: 'setting-item-info' });
        mainInfo.createDiv({ cls: 'setting-item-name', text: 'Tables Settings' });
        mainInfo.createDiv({ cls: 'setting-item-description' });
        mainHeading.createDiv({ cls: 'setting-item-control' });

        new Setting(containerEl)
            .setName('Default File Format')
            .setDesc(
                'By default, Tables uses .table.md to maximise compatibility and incorporate Obsidian backlink functionality. ' +
                'This setting only affects creation of new tables.'
            )
            .addDropdown(dropdown => dropdown
                .addOption('default', 'Default (.table.md)')
                .addOption('json', 'JSON (.table.json)')
                .setValue(this.plugin.settings.tableRenderer)
                .onChange(async (value) => {
                    this.plugin.settings.tableRenderer = value as 'default' | 'json';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Renderer Type')
            .setDesc('Use the legacy HTML table renderer if you experience stability issues with the default renderer.')
            .addDropdown(dropdown => dropdown
                .addOption('div', 'Default')
                .addOption('table', 'HTML Table (Legacy)')
                .setValue(this.plugin.settings.rendererType)
                .onChange(async (value) => {
                    this.plugin.settings.rendererType = value as 'table' | 'div';
                    await this.plugin.saveSettings();
                    // Reload active views? For now just save.
                }));

        new Setting(containerEl)
            .setName('Sticky Action Column')
            .setDesc('Keep the action column (add/delete row) visible when scrolling horizontally.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.stickyActionColumn)
                .onChange(async (value) => {
                    this.plugin.settings.stickyActionColumn = value;
                    await this.plugin.saveSettings();
                    // Reload active views
                    this.plugin.app.workspace.iterateAllLeaves(leaf => {
                        if (leaf.view.getViewType() === VIEW_TYPE_JSON_TABLE) {
                            (leaf.view as any).render();
                        }
                    });
                }));

        new Setting(containerEl)
            .setName('Enable CSV Support')
            .setDesc('Allow opening and editing .csv files directly in the table view. Note: Original formatting like extra whitespace might not be preserved perfectly.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableCsvSupport)
                .onChange(async (value) => {
                    this.plugin.settings.enableCsvSupport = value;
                    await this.plugin.saveSettings();
                    new Notice("Reload required for file extension changes to take full effect.", 7000);
                }));

        const experimentalHeading = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
        const experimentalInfo = experimentalHeading.createDiv({ cls: 'setting-item-info' });
        experimentalInfo.createDiv({ cls: 'setting-item-name', text: 'Experimental' });
        experimentalInfo.createDiv({ cls: 'setting-item-description' });
        experimentalHeading.createDiv({ cls: 'setting-item-control' });

        new Setting(containerEl)
            .setName('Row Reordering')
            .setDesc('Enable row reordering via drag-and-drop. This feature is experimental and may be unstable.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableBetaFeatures)
                .onChange(async (value) => {
                    this.plugin.settings.enableBetaFeatures = value;
                    await this.plugin.saveSettings();
                }));



        // Add more settings here later if needed
    }
}

export default class JsonTablePlugin extends Plugin {
    settings!: JsonTableSettings; // Store settings




    // --- Monkey Patching ---
    // Safely patch setViewState to intercept .table.md files before they open as markdown.
    // This eliminates the "flash" of the markdown view.
    patchSetViewState() {
        const self = this;
        const patch = around(WorkspaceLeaf.prototype, {
            setViewState(next) {
                return function (this: any, viewState: any, ...args: any[]) {
                    // Check if Obsidian is trying to open a file
                    if (viewState && viewState.state && viewState.state.file) {
                        const filePath = viewState.state.file;
                        if (typeof filePath === 'string') {

                            // Case 1: .table.md (Prevent Markdown Flash)
                            if (viewState.type === 'markdown' && filePath.endsWith('.table.md')) {
                                // Verify it's one of our tables using metadata cache (fast)
                                const file = self.app.vault.getAbstractFileByPath(filePath);
                                if (file instanceof TFile) {
                                    const cache = self.app.metadataCache.getFileCache(file);
                                    if (cache?.frontmatter?.['json-table-plugin']) {
                                        // FORCE the view type to be our custom view
                                        viewState.type = VIEW_TYPE_JSON_TABLE;
                                    }
                                }
                            }

                            // Case 2: .table.json (Prioritize over other JSON viewers)
                            // We intercept generic 'json' view types OR just check the extension if we want be aggressive for .table.json
                            // Obsidian defaults json to 'json' view type usually (or whatever plugin handles it).
                            if (filePath.endsWith('.table.json')) {
                                // For .table.json, we ALWAYS want to handle it.
                                viewState.type = VIEW_TYPE_JSON_TABLE;
                            }
                        }
                    }
                    return next.call(this, viewState, ...args);
                }
            }
        });
        this.register(patch); // Automatically unpatch on unload
    }

    async onload() {
        await this.loadSettings();
        this.patchSetViewState();


        // Register the custom view
        // The factory function creates the view and passes settings
        this.registerView(
            VIEW_TYPE_JSON_TABLE,
            (leaf) => {
                const view = new JsonTableView(leaf);
                // Pass loaded settings to the view instance immediately
                view.setSettings(this.settings);
                return view;
            }
        );

        // Register extensions based on settings after layout is ready
        this.app.workspace.onLayoutReady(() => {
            this.registerFileExtensions();
        });


        // Add Settings Tab
        this.addSettingTab(new JsonTableSettingTab(this.app, this));

        // Register markdown code block processor for inline tables
        this.registerMarkdownCodeBlockProcessor('jsontable', (source, el, ctx) => {
            // Get the current file from the context
            const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;

            if (!(file instanceof TFile)) {
                el.createDiv({
                    text: 'Inline table: Could not determine source file.',
                    cls: 'json-table-error'
                });
                return;
            }

            // Create and render the inline table
            const renderer = new InlineTableRenderer(el, source, this.app, file, this.settings);
            ctx.addChild(renderer);
        });

        // Register markdown post processor for embeds
        this.registerMarkdownPostProcessor((element, context) => {
            const embeds = element.querySelectorAll('.internal-embed');

            embeds.forEach((embed) => {
                const src = embed.getAttribute('src');

                if (!src) return;

                // Resolve the file using metadata cache first
                // This handles cases where src doesn't have the extension (e.g. [[MyTable.table]])
                const file = this.app.metadataCache.getFirstLinkpathDest(src, context.sourcePath);

                if (file instanceof TFile && (file.name.endsWith('.table.json') || file.name.endsWith('.table.md'))) {
                    // Clear the default content (raw JSON or link)
                    embed.empty();

                    // Create and mount the renderer
                    const renderer = new EmbedTableRenderer(embed as HTMLElement, this.app, file, this.settings);
                    context.addChild(renderer);
                }
            });
        });

        // Register Editor Extension for Live Preview
        this.registerEditorExtension(tableEmbedExtension(this.app));

        // --- Context Menus ---
        // For right-clicking on folders in the file explorer
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file, source, leaf) => { // Added leaf
                // --- Condition 1: Create New Table (Folder) ---
                const targetIsFolder = !(file instanceof TFile);
                if (targetIsFolder) {
                    menu.addItem((item) => {
                        item
                            .setTitle('New table')
                            .setIcon('table') // Use built-in table icon
                            .onClick(async () => {
                                await this.createNewTable(file); // Pass the TAbstractFile (folder)
                            });
                    });
                }
                // --- Condition 2: Open as JSON Table (File) ---
                else if (file instanceof TFile && file.name.endsWith('.table.md') && leaf) {
                    // Check if it's potentially one of our table files via frontmatter
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.frontmatter?.['json-table-plugin']) {
                        // Only add the option if the current view isn't already our table view
                        if (leaf.view.getViewType() !== VIEW_TYPE_JSON_TABLE) {
                            menu.addItem((item) => {
                                item
                                    .setTitle('Open as table') // Sentence case
                                    .setIcon('table') // Use a relevant icon
                                    .onClick(async () => {
                                        // Force the view switch on the current leaf using state
                                        await leaf.setViewState({
                                            type: VIEW_TYPE_JSON_TABLE,
                                            state: { file: file.path } // Pass file path in state
                                        }, { focus: true });
                                    });
                            });
                        }
                    }
                }
            })
        );
        // files-menu listener for folder context
        this.registerEvent(
            this.app.workspace.on('files-menu', (menu, files) => {
                // Check if the right-click target is a single item, and that item is NOT a TFile
                if (files.length === 1 && !(files[0] instanceof TFile)) {
                    const targetFolder = files[0]; // It's the folder itself
                    menu.addItem((item) => {
                        item
                            .setTitle('New table')
                            .setIcon('table')
                            .onClick(async () => {
                                await this.createNewTable(targetFolder); // Pass the TAbstractFile (folder)
                            });
                    });
                }
            })
        );


        // --- Add Commands ---
        this.addCommand({
            id: 'create-new-table',
            name: 'Create new table',
            // checkCallback only shows the command if conditions are met
            checkCallback: (checking: boolean) => {
                // Determine current folder context (active file's parent or root)
                const activeFile = this.app.workspace.getActiveFile();
                // Ensure the target is a folder-like TAbstractFile
                const targetFolder: TAbstractFile | null = activeFile ? activeFile.parent : this.app.vault.getRoot();

                if (targetFolder && !(targetFolder instanceof TFile)) {
                    if (!checking) {
                        // If not just checking, execute the creation in the determined folder
                        this.createNewTable(targetFolder);
                    }
                    return true; // Command is valid in this context
                }
                return false; // Command is not valid (no folder context)
            },
        });

        this.addCommand({
            id: 'import-csv',
            name: 'Import CSV file',
            callback: () => {
                this.importCSVFile();
            },
        });

        this.addCommand({
            id: 'add-table-inline',
            name: 'Add table inline',
            editorCallback: (editor) => {
                const skeletonTable = this.getSkeletonTableJSON();
                const cursor = editor.getCursor();
                const tableBlock = `\`\`\`jsontable\n${skeletonTable}\n\`\`\`\n\n`;
                editor.replaceRange(tableBlock, cursor);
                // Move cursor after the inserted block
                const lines = tableBlock.split('\n').length;
                editor.setCursor({ line: cursor.line + lines - 1, ch: 0 });
            },
        });




        // --- Link Updating Listeners ---
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                // Check if it's a TFile before accessing path
                if (file instanceof TFile) {
                    this.updateLinksInAllTables(oldPath, file.path);
                }
            })
        );
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                // Check if it's a TFile before accessing path
                if (file instanceof TFile) {
                    this.removeLinksInAllTables(file.path);
                }
            })
        );
        // --- End Link Listeners ---

        // --- Add File Open Listener for dynamic MD switching ---
        this.registerEvent(
            this.app.workspace.on('file-open', async (file) => { // Keep async

                if (!file) return;

                // Handle regular .md files when on a table view - switch to markdown view
                if (file.name.endsWith('.md') && !file.name.endsWith('.table.md')) {
                    // Check if currently on a table view
                    const activeTableView = this.app.workspace.getActiveViewOfType(JsonTableView);
                    if (activeTableView) {
                        // Check if file is already open in a markdown leaf
                        const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
                        for (const leaf of markdownLeaves) {
                            const viewState = leaf.getViewState();
                            if (viewState.state?.file === file.path) {
                                // Already open - just focus it
                                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                                return;
                            }
                        }

                        // Not open anywhere - switch current table leaf to markdown view
                        try {
                            await activeTableView.leaf.setViewState({
                                type: 'markdown',
                                state: { file: file.path }
                            }, { focus: true });
                            return; // Handled
                        } catch (err) {
                            console.error("file-open: Error switching table view to markdown:", err);
                            // Fall through to let Obsidian handle it
                        }
                    }
                    // If not on table view, let Obsidian handle normally
                    return;
                }

                // Handle .table.md files
                // Note: The primary handling is now done via patchSetViewState to prevent flash.
                // This listener acts as a fall back logic, but for .table.json patching handles it too.
                // We keep this for robustness.

                // 2. Check Frontmatter using Metadata Cache (Faster)
                let hasTableFrontmatter = false;
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter?.['json-table-plugin']) {
                    hasTableFrontmatter = true;
                }

                const isTableJson = file.name.endsWith('.table.json');

                if (!hasTableFrontmatter && !isTableJson) {
                    return;
                }

                // 3. Find the Correct Leaf - check multiple sources
                let targetLeaf: WorkspaceLeaf | null = null;

                // First: Check if file is already open in a table view
                const tableLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_JSON_TABLE);
                for (const leaf of tableLeaves) {
                    const viewState = leaf.getViewState();
                    if (viewState.state?.file === file.path) {
                        // Already open in table view - just focus it
                        this.app.workspace.setActiveLeaf(leaf, { focus: true });

                        // Check if we have a duplicate leaf (the one that just opened as markdown/json)
                        const leaves = this.app.workspace.getLeavesOfType('markdown');
                        // Also check generic json viewers if needed, or just iterate all leaves?
                        // For now, keeping markdown check.
                        for (const l of leaves) {
                            if (l.getViewState().state?.file === file.path && l !== leaf) {
                                // This is likely the duplicate view that just opened
                                l.detach();
                            }
                        }

                        return;
                    }
                }

                // Second: Check for markdown leaves with this file (only for .md)
                const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
                for (const leaf of markdownLeaves) {
                    const viewState = leaf.getViewState();
                    if (viewState.state?.file === file.path) {
                        targetLeaf = leaf;
                        break;
                    }
                }
                // Also check generic leaves? .table.json might open in 'json' view
                if (!targetLeaf && isTableJson) {
                    // Try to find the leaf that just opened this file
                    // Iterating all leaves is safer
                    this.app.workspace.iterateAllLeaves(leaf => {
                        if (leaf.getViewState().state?.file === file.path) {
                            targetLeaf = leaf;
                            return true; // Stop iteration
                        }
                    });
                }

                // Third: If no existing leaf found, reuse current active leaf if it's a table view
                if (!targetLeaf) {
                    const activeTableView = this.app.workspace.getActiveViewOfType(JsonTableView);
                    if (activeTableView) {
                        // Reuse the current table view leaf to switch to the new file
                        targetLeaf = activeTableView.leaf;
                    }
                }

                // 4. Perform the View Switch
                if (targetLeaf) {
                    // Check if it's alreay the correct type
                    if (targetLeaf.view.getViewType() === VIEW_TYPE_JSON_TABLE) return;

                    try {
                        await targetLeaf.setViewState({
                            type: VIEW_TYPE_JSON_TABLE,
                            state: { file: file.path }
                        }, { focus: true });
                    } catch (err) {
                        console.error("file-open: Error during setViewState:", err);
                    }
                }
            })
        );
        // --- End File Open Listener ---
    } // --- End onload ---

    onunload() {
        // Clean up resources, interval timers etc. if any were added
    }

    // --- File Extension Registration ---
    /** Registers the primary file extensions our view might handle */
    registerFileExtensions() {
        // Unregistering old handlers is complex. Register both potentially relevant
        // extensions and let the JsonTableView decide if it can handle the specific file.
        this.registerExtensions(['table.md'], VIEW_TYPE_JSON_TABLE); // For direct open attempts of MD wrappers

        try {
            this.registerExtensions(['json'], VIEW_TYPE_JSON_TABLE);     // Catches .table.json and allows view to show errors for other .json
        } catch (e) {
            console.warn('JsonTablePlugin: Could not register "json" extension. It may be handled by another plugin.', e);
        }

        if (this.settings.enableCsvSupport) {
            this.registerExtensions(['csv'], VIEW_TYPE_JSON_TABLE);
        }
    }


    // --- Settings Loading/Saving ---
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update settings in any currently open views of our type
        this.app.workspace.getLeavesOfType(VIEW_TYPE_JSON_TABLE).forEach(leaf => {
            if (leaf.view instanceof JsonTableView) {
                leaf.view.setSettings(this.settings);
            }
        });
        // Re-registration might not be strictly necessary due to the file-open listener
        // and the view's internal checks, but uncomment if needed.
        // this.registerFileExtensions();
    }


    // --- File Creation ---

    /** Returns the default empty table structure */
    getDefaultTableData(): TableData {
        const colId1 = "col" + Date.now() + "_1";
        const colId2 = "col" + Date.now() + "_2";
        return {
            columns: [{
                id: colId1, name: "Column 1", type: "text", width: 150,
                typeOptions: {}
            }, {
                id: colId2, name: "Column 2", type: "text", width: 150,
                typeOptions: {}
            }],
            rows: [
                [{ column: colId1, value: "" }, { column: colId2, value: "" }]
            ],
            views: [{
                id: 'default_' + Date.now(), name: 'Default', sort: [], filter: []
            }]
        };
    }

    /** Returns a skeleton table structure as JSON string */
    getSkeletonTableJSON(): string {
        return JSON.stringify(this.getDefaultTableData(), null, 2);
    }

    /** Creates a new table file based on settings in the target folder */
    async createNewTable(targetFolder: TAbstractFile) {
        // Ensure targetFolder is valid and is actually a folder
        if (!targetFolder || targetFolder instanceof TFile) {
            console.error("Invalid target folder provided for createNewTable. Using Vault root.");
            targetFolder = this.app.vault.getRoot();
        }

        const defaultTable = this.getDefaultTableData();

        let fileName = '';
        let fileContent = '';
        let counter = 1;
        let filePath = '';
        const baseName = 'New Table';
        // Determine folder path, handling root case correctly
        const folderPath = targetFolder.path === '/' ? '' : targetFolder.path;

        if (this.settings.tableRenderer === 'default') {
            // --- Create Markdown File ---
            const extension = '.table.md';
            fileName = `${baseName}${extension}`;
            // Construct path carefully for root vs subfolder
            filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
            // Check for existing file and increment counter
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                fileName = `${baseName} ${counter}${extension}`;
                filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
                counter++;
            }

            // Construct the initial Markdown content with frontmatter and code block
            const title = fileName.replace(extension, '');
            const jsonDataString = JSON.stringify(defaultTable, null, 2);
            // Ensure frontmatter includes the plugin key
            const frontmatter = `---\njson-table-plugin: true\ntable-links: []\n---\n`;
            const body = `\n## ${title}\n\n<!-- Do not edit the code block below manually -->\n\n\`\`\`json-table\n${jsonDataString}\n\`\`\`\n`;
            fileContent = frontmatter + body;

        } else {
            // --- Create JSON File ---
            const extension = '.table.json';
            fileName = `${baseName}${extension}`;
            filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                fileName = `${baseName} ${counter}${extension}`;
                filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
                counter++;
            }
            // Just stringify the updated defaultTable structure
            fileContent = JSON.stringify(defaultTable, null, 2);
        }

        // Create and open the file
        try {
            const file = await this.app.vault.create(filePath, fileContent);
            // Add a small delay to ensure file is fully written before opening
            await new Promise(resolve => setTimeout(resolve, 100));
            // Open in the current leaf or a new one
            const leaf = this.app.workspace.getLeaf('tab'); // Open in a new tab for clarity
            await leaf.openFile(file);
        } catch (error) {
            console.error(`Error creating table file "${filePath}":`, error);
            new Notice('Error creating table file. Check console for details.');
        }
    }

    // --- CSV Import ---
    /** Import CSV file and create a new table file */
    async importCSVFile() {
        // Create hidden file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.style.display = 'none';

        // Handle file selection
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
                input.remove();
                return;
            }

            try {
                // Read file content
                const text = await file.text();

                // Parse CSV
                const result = this.parseCSV(text);
                if (!result) {
                    new Notice('Failed to parse CSV file. Check console for details.');
                    input.remove();
                    return;
                }

                // Determine target folder
                const activeFile = this.app.workspace.getActiveFile();
                const targetFolder: TAbstractFile | null = activeFile ? activeFile.parent : this.app.vault.getRoot();
                if (!targetFolder || targetFolder instanceof TFile) {
                    new Notice('Error: Could not determine target folder.');
                    input.remove();
                    return;
                }

                // Create table file
                await this.createTableFromCSV(targetFolder, file.name, result);
                new Notice('CSV imported successfully!');

            } catch (error) {
                console.error('Error importing CSV:', error);
                new Notice('Error importing CSV file. Check console for details.');
            } finally {
                input.remove();
            }
        };

        // Trigger file picker
        document.body.appendChild(input);
        input.click();
    }

    /** Parse CSV content into columns and rows */
    parseCSV(content: string): { columns: string[], rows: string[][] } | null {
        try {
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length < 1) {
                console.error('CSV file is empty');
                return null;
            }

            // Parse header row
            const headers = this.parseCSVLine(lines[0]);

            // Parse data rows
            const rows: string[][] = [];
            for (let i = 1; i < lines.length; i++) {
                const row = this.parseCSVLine(lines[i]);
                // Only add rows with the correct number of columns
                if (row.length === headers.length) {
                    rows.push(row);
                }
            }

            return { columns: headers, rows };
        } catch (error) {
            console.error('Error parsing CSV:', error);
            return null;
        }
    }

    /** Parse a single CSV line, handling quoted values */
    parseCSVLine(line: string): string[] {
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
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Add last field
        result.push(current.trim());
        return result;
    }

    /** Create table file from CSV data */
    async createTableFromCSV(targetFolder: TAbstractFile, csvFileName: string, csvData: { columns: string[], rows: string[][] }) {
        const folderPath = targetFolder.path === '.' ? '' : targetFolder.path;

        // Generate safe filename from CSV filename
        const baseName = csvFileName.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9-_]/g, '_');
        const extension = this.settings.tableRenderer === 'default' ? '.table.md' : '.table.json';
        let fileName = `${baseName}${extension}`;
        let filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

        // Handle duplicates
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(filePath)) {
            fileName = `${baseName} ${counter}${extension}`;
            filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
            counter++;
        }

        // Create columns from CSV headers
        const columns = csvData.columns.map((header, index) => ({
            id: `col_${index}`,
            name: header,
            type: 'text' as const,
            width: 150
        }));

        // Create rows from CSV data
        const rows = csvData.rows.map((row) =>
            row.map((value, colIndex) => ({
                column: `col_${colIndex}`,
                value: value
            }))
        );

        // Create TableData structure
        const tableData: TableData = {
            columns: columns,
            rows: rows,
            views: [{
                id: 'default_' + Date.now(),
                name: 'Default',
                sort: [],
                filter: []
            }]
        };

        // Create file content based on renderer setting
        let fileContent: string;
        if (this.settings.tableRenderer === 'default') {
            // Create Markdown file with frontmatter and JSON block
            const handler = new MarkdownFileHandler(this.app);
            // We need a temporary file to use the handler, so let's construct it manually
            const frontmatter = `json-table-plugin: true\ntable-links: []\n`;
            const jsonBlock = `\`\`\`json-table\n${JSON.stringify(tableData, null, 2)}\n\`\`\`\n`;
            fileContent = `---\n${frontmatter}---\n${jsonBlock}`;
        } else {
            // Create JSON file
            fileContent = JSON.stringify(tableData, null, 2);
        }

        // Create and open the file
        try {
            const file = await this.app.vault.create(filePath, fileContent);
            // Add a small delay to ensure file is fully written and cached before opening
            await new Promise(resolve => setTimeout(resolve, 100));
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(file);
        } catch (error) {
            console.error(`Error creating table file "${filePath}":`, error);
            new Notice('Error creating table file. Check console for details.');
        }
    }


    // --- Link Updating Logic ---

    /** Determines the correct file handler based on file extension */
    getHandlerForFile(file: TFile): ITableFileHandler | null {
        if (file.name.endsWith('.table.md')) {
            // Return handler only if setting allows it? Or always return if exists?
            // Let's assume we always return if it's the right format, view handles setting.
            return new MarkdownFileHandler(this.app);
        } else if (file.name.endsWith('.table.json')) {
            return new JsonFileHandler(this.app);
        } else if (file.name.endsWith('.csv') && this.settings.enableCsvSupport) {
            return new CsvFileHandler(this.app);
        }
        return null; // Not one of our managed table files
    }

    /** Scans all relevant table files and updates links matching oldPath to newPath */
    async updateLinksInAllTables(oldPath: string, newPath: string) {
        // Get all files *once* for efficiency
        const allFiles = this.app.vault.getFiles();
        // Filter for potential table files
        // Filter for potential table files
        const tableFiles = allFiles.filter(f =>
            f.name.endsWith('.table.json') ||
            f.name.endsWith('.table.md') ||
            (this.settings.enableCsvSupport && f.name.endsWith('.csv'))
        );

        if (tableFiles.length === 0) {
            return;
        }

        // Process each potential table file
        for (const file of tableFiles) {
            // Skip the file that was just renamed — it doesn't need link updates
            if (file.path === newPath) continue;
            const handler = this.getHandlerForFile(file);
            // Skip if it's not a recognized table file type managed by a handler
            if (!handler) continue;

            let data: TableData | null = null;
            let dataChanged = false;

            try {
                data = await handler.read(file); // Use the appropriate handler to read
                // Basic validation after read
                if (!data || !data.columns || !data.rows) {
                    console.warn(`Skipping invalid data structure in ${file.path}`);
                    continue;
                }

                // Find which columns are 'notelink' type
                const linkColumns = data.columns.filter(col => col.type === 'notelink').map(col => col.id);
                // If no link columns in this table, skip the rest
                if (linkColumns.length === 0) continue;

                // Iterate through rows and cells to find and update matching links
                data.rows.forEach(row => {
                    row.forEach(cell => {
                        if (linkColumns.includes(cell.column) && cell.value === oldPath) {
                            cell.value = newPath; // Update the link value
                            dataChanged = true;
                        }
                    });
                });

                // If any links were changed, save the file using the handler
                if (dataChanged) {
                    await handler.save(file, data);
                }
            } catch (e) {
                // Log errors encountered during read/save but continue processing other files
                console.error(`Failed to process links update in ${file.path}:`, e);
            }
        }
    }

    /** Scans all relevant table files and removes links pointing to the deletedPath */
    async removeLinksInAllTables(deletedPath: string) {
        const allFiles = this.app.vault.getFiles();
        const tableFiles = allFiles.filter(f =>
            f.name.endsWith('.table.json') ||
            f.name.endsWith('.table.md') ||
            (this.settings.enableCsvSupport && f.name.endsWith('.csv'))
        );

        if (tableFiles.length === 0) {
            return;
        }

        for (const file of tableFiles) {
            const handler = this.getHandlerForFile(file);
            if (!handler) continue;

            let data: TableData | null = null;
            let dataChanged = false;

            try {
                data = await handler.read(file);
                if (!data || !data.columns || !data.rows) continue;

                const linkColumns = data.columns.filter(col => col.type === 'notelink').map(col => col.id);
                if (linkColumns.length === 0) continue;

                data.rows.forEach(row => {
                    row.forEach(cell => {
                        if (linkColumns.includes(cell.column) && cell.value === deletedPath) {
                            cell.value = ""; // Clear the cell value for the deleted link
                            dataChanged = true;
                        }
                    });
                });

                if (dataChanged) {
                    await handler.save(file, data);
                }
            } catch (e) {
                console.error(`Failed to process link removal in ${file.path}:`, e);
            }
        }
    }

} // End Plugin Class

