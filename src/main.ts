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

export default class JsonTablePlugin extends Plugin {
    settings: JsonTableSettings; // Store settings

    async onload() {
        await this.loadSettings(); // Load settings first

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
                                    .setTitle('Open as Table') // The command text
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


        // --- Add Command ---
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

            // 1. Check Setting and File Type (OK)
            if (this.settings.tableRenderer !== 'default' || !file || !file.name.endsWith('.table.md')) {
                return;
            }

            // 2. Check Frontmatter (REVERTED: Always read file content)
            let hasTableFrontmatter = false;
            try {
                 const content = await this.app.vault.read(file);
                 // Original regex check on file content
                 hasTableFrontmatter = /^---\s*\n[\s\S]*?json-table-plugin:\s*true[\s\S]*?\n---/.test(content);
            } catch (readErr) {
                 console.error("file-open: Error reading file content:", readErr);
                 return; // Exit if reading fails
            }
            // --- End Revert ---

            // If frontmatter check failed, exit
            if (!hasTableFrontmatter) {
                return;
            }

            // 3. Find the Correct Leaf (OK)
            let targetLeaf: WorkspaceLeaf | null = null;
            const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of markdownLeaves) {
                const viewState = leaf.getViewState();
                if (viewState.state?.file === file.path) {
                    targetLeaf = leaf;
                    break;
                }
            }

            // 4. Perform the View Switch (Keep try/catch and focus)
            if (targetLeaf) {
                try {
                    await targetLeaf.setViewState({
                        type: VIEW_TYPE_JSON_TABLE,
                        state: { file: file.path } // Pass file path
                    }, { focus: true }); // Keep focus option
                } catch (err) {
                    // Keep error logging
                    console.error("file-open: Error during setViewState:", err);
                }
            } else {
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
        this.registerExtensions(['json'], VIEW_TYPE_JSON_TABLE);     // Catches .table.json and allows view to show errors for other .json
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
    /** Creates a new table file based on settings in the target folder */
    async createNewTable(targetFolder: TAbstractFile) {
        // Ensure targetFolder is valid and is actually a folder
        if (!targetFolder || targetFolder instanceof TFile) {
            console.error("Invalid target folder provided for createNewTable. Using Vault root.");
            targetFolder = this.app.vault.getRoot();
        }

        // Generate unique IDs for default columns/rows for consistency
        const colId1 = "col" + Date.now() + "_1";
        const colId2 = "col" + Date.now() + "_2";
        // --- UPDATED Default table structure ---
        const defaultTable: TableData = {
            columns: [{
                id: colId1, name: "Column 1", type: "text", width: 150,
                typeOptions: {} // Add empty typeOptions
            }, {
                id: colId2, name: "Column 2", type: "text", width: 150,
                typeOptions: {} // Add empty typeOptions
            }],
            rows: [
                [{ column: colId1, value: "" }, { column: colId2, value: "" }]
            ],
            // Add the default views array
            views: [{
                id: 'default_' + Date.now(), name: 'Default', sort: [], filter: []
                // hiddenColumns: [] // Add if/when implemented
            }]
        };
        // --- END UPDATED Default structure ---

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
            while (await this.app.vault.adapter.exists(filePath)) {
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
            while (await this.app.vault.adapter.exists(filePath)) {
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
            // Open in the current leaf or a new one
            const leaf = this.app.workspace.getLeaf('tab'); // Open in a new tab for clarity
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
        }
        return null; // Not one of our managed table files
    }

    /** Scans all relevant table files and updates links matching oldPath to newPath */
    async updateLinksInAllTables(oldPath: string, newPath: string) {
        // Get all files *once* for efficiency
        const allFiles = this.app.vault.getFiles();
        // Filter for potential table files
        const tableFiles = allFiles.filter(f => f.name.endsWith('.table.json') || f.name.endsWith('.table.md'));

        if (tableFiles.length === 0) {
            return;
        }

        // Process each potential table file
        for (const file of tableFiles) {
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
        const tableFiles = allFiles.filter(f => f.name.endsWith('.table.json') || f.name.endsWith('.table.md'));

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
        containerEl.createEl('h2', {
            text: 'Tables Settings'
        });

        new Setting(containerEl)
            .setName('Table Renderer')
            .setDesc(
                'By default, Tables uses .table.md to maximise compatibility and incorporate Obsidian backlink functionality. ' +
                'JSON is an alternative - it\'s faster and uses native JSON. Use if experiencing issues with the default renderer. ' +
                'Reload Obsidian for changes to take full effect on file handling and creation.'
            )
            .addDropdown(dropdown => dropdown
                .addOption('default', 'Default (.table.md)')
                .addOption('json', 'JSON (.table.json)')
                .setValue(this.plugin.settings.tableRenderer)
                .onChange(async (value) => {
                    this.plugin.settings.tableRenderer = value as 'default' | 'json';
                    await this.plugin.saveSettings();
                    // Prompt user to reload for the change to reliably affect extension handling
                    new Notice("Reload required for file handling changes to take full effect.", 7000);
                }));

        // Add more settings here later if needed
    }
}