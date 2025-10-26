// src/main.ts
import { Plugin, TFile, WorkspaceLeaf, App, PluginSettingTab, Setting, Notice, TAbstractFile } from 'obsidian';
import { JsonTableView, JsonTableSettings, DEFAULT_SETTINGS } from './JsonTableView'; // Import settings from view for now
import { VIEW_TYPE_JSON_TABLE, TableData } from './types';
// --- Import Handlers ---
import { ITableFileHandler } from './fileHandlers/ITableFileHandler';
import { JsonFileHandler } from './fileHandlers/JsonFileHandler';
import { MarkdownFileHandler } from './fileHandlers/MarkdownFileHandler';

export default class JsonTablePlugin extends Plugin {
  settings: JsonTableSettings; // Store settings

  async onload() {
    console.log('Loading JSON Table Plugin');
    await this.loadSettings(); // Load settings first

    // Register the custom view, passing settings
    this.registerView(
      VIEW_TYPE_JSON_TABLE,
      (leaf) => {
          const view = new JsonTableView(leaf);
          // Pass loaded settings to the view instance
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
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, source) => {
        // Check if it's a folder or the root
        const targetIsFolder = !(file instanceof TFile);
        if (targetIsFolder) {
            menu.addItem((item) => {
                item
                    .setTitle('New table')
                    .setIcon('table')
                    .onClick(async () => {
                        await this.createNewTable(file); // Pass the TAbstractFile (folder)
                    });
            });
        }
      })
    );
this.registerEvent(
      this.app.workspace.on('files-menu', (menu, files) => {
        // Check if the right-click target is a single item, and that item is NOT a TFile
        // (meaning it's likely a folder)
        if (files.length === 1 && !(files[0] instanceof TFile)) {
             // files[0] is now confirmed to be a TFolder or potentially the vault root
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
        // If you ALSO wanted to allow creating a table when right-clicking a file
        // (to create it in the same folder as that file), you'd add an else if:
        // else if (files.length === 1 && files[0] instanceof TFile) {
        //     const targetFolder = files[0].parent;
        //     if (targetFolder) { ... add item ... }
        // }
      })
    );

    // --- Add Command ---
    this.addCommand({
      id: 'create-new-table',
      name: 'Create new table',
      // Check callback ensures command only runs if a folder context is available
      checkCallback: (checking: boolean) => {
          // Determine current folder context (active file's parent or root)
          const activeFile = this.app.workspace.getActiveFile();
          const targetFolder = activeFile?.parent || this.app.vault.getRoot();

          if (targetFolder) {
              if (!checking) {
                  // If not just checking, execute the creation
                  this.createNewTable(targetFolder);
              }
              return true; // Command is valid in this context
          }
          return false; // Command is not valid (e.g., no active file, error getting root)
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
  }

  onunload() {
    console.log('Unloading JSON Table Plugin');
  }

  // --- File Extension Registration ---
  /** Registers file extensions based on current settings */
  registerFileExtensions() {
    console.log('Registering extensions. Markdown Wrapper:', this.settings.useMarkdownWrapper); // Add log
    // Unregistering previous handlers is complex in Obsidian's API.
    // We register both potential extensions and let the JsonTableView
    // decide which files it can *actually* handle based on settings.
    console.log('Registering extensions for table view: .table.md and .json');
    this.registerExtensions(['table.md'], VIEW_TYPE_JSON_TABLE); // For Markdown wrapper files
    this.registerExtensions(['json'], VIEW_TYPE_JSON_TABLE);     // To catch .table.json and potentially show errors for other json
  }


  // --- Settings Loading/Saving ---
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update settings in any open views
    this.app.workspace.getLeavesOfType(VIEW_TYPE_JSON_TABLE).forEach(leaf => {
        if (leaf.view instanceof JsonTableView) {
            leaf.view.setSettings(this.settings);
        }
    });
    // Maybe trigger re-registration if needed, or rely on view logic
    // this.registerFileExtensions();
  }


  // --- File Creation ---
  /** Creates a new table file based on settings */
  async createNewTable(targetFolder: TAbstractFile) {
     // Ensure targetFolder is valid
    if (!targetFolder || !(targetFolder instanceof TAbstractFile)) {
         console.error("Invalid target folder provided for createNewTable.");
         targetFolder = this.app.vault.getRoot(); // Fallback to root
    }

    // Default table structure
    const defaultTable: TableData = {
      columns: [
        { id: "col" + Date.now() + "1", name: "Column 1", type: "text", width: 150 },
        { id: "col" + Date.now() + "2", name: "Column 2", type: "text", width: 150 }
      ],
      rows: [
        [ { column: "col" + Date.now() + "1", value: "" }, { column: "col" + Date.now() + "2", value: "" } ]
      ]
    };

    let fileName = '';
    let fileContent = '';
    let counter = 1;
    let filePath = '';
    const baseName = 'New Table';
    // Determine folder path, handling root case
    const folderPath = targetFolder.path === '/' ? '' : targetFolder.path;

    if (this.settings.useMarkdownWrapper) {
      // --- Create Markdown File ---
      const extension = '.table.md';
      fileName = `${baseName}${extension}`;
      filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
      while (await this.app.vault.adapter.exists(filePath)) {
        fileName = `${baseName} ${counter}${extension}`;
        filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
        counter++;
      }
      // Use Markdown handler to create initial content
      const mdHandler = new MarkdownFileHandler(this.app);
      // Accessing internal method is fragile; consider making it static or public helper
      fileContent = (mdHandler as any).updateMarkdownContent('', JSON.stringify(defaultTable, null, 2), []);
      // Basic fallback structure
      if (!fileContent || !fileContent.includes('```json-table')) {
          fileContent = `---\ntable-links: []\n---\n\n## ${fileName.replace(extension, '')}\n\n\n\n\`\`\`json-table\n${JSON.stringify(defaultTable, null, 2)}\n\`\`\``;
      }

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
      fileContent = JSON.stringify(defaultTable, null, 2);
    }

    try {
        console.log(`Creating table file at: ${filePath}`);
        const file = await this.app.vault.create(filePath, fileContent);
        // Open the newly created file in a new leaf/tab
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
          return new MarkdownFileHandler(this.app);
      } else if (file.name.endsWith('.table.json')) {
          return new JsonFileHandler(this.app);
      }
      return null; // Not one of our table files
  }

  /** Scans all relevant table files and updates links */
  async updateLinksInAllTables(oldPath: string, newPath: string) {
    console.log(`Checking for links to update: ${oldPath} -> ${newPath}`);
    // Get all files *once*
    const allFiles = this.app.vault.getFiles();
    const tableFiles = allFiles.filter(f => f.name.endsWith('.table.json') || f.name.endsWith('.table.md'));

    if (tableFiles.length === 0) {
        console.log("No table files found to scan for links.");
        return;
    }

    console.log(`Scanning ${tableFiles.length} table files for links...`);

    for (const file of tableFiles) {
      const handler = this.getHandlerForFile(file);
      if (!handler) continue; // Skip if not a recognized table file

      let data: TableData | null = null;
      let dataChanged = false;

      try {
        data = await handler.read(file);
        if (!data || !data.columns || !data.rows) continue; // Skip invalid data

        const linkColumns = data.columns.filter(col => col.type === 'notelink').map(col => col.id);
        if (linkColumns.length === 0) continue; // Skip if no link columns in this table

        data.rows.forEach(row => {
          row.forEach(cell => {
            if (linkColumns.includes(cell.column) && cell.value === oldPath) {
              cell.value = newPath;
              dataChanged = true;
            }
          });
        });

        if (dataChanged) {
          await handler.save(file, data);
          console.log(`Updated links in: ${file.path}`);
        }
      } catch (e) {
        // Log errors but continue processing other files
        console.error(`Failed to process links update in ${file.path}:`, e);
      }
    }
    console.log(`Finished link update scan.`);
  }

  /** Scans all relevant table files and removes links to deleted files */
  async removeLinksInAllTables(deletedPath: string) {
     console.log(`Checking for links to remove: ${deletedPath}`);
    const allFiles = this.app.vault.getFiles();
    const tableFiles = allFiles.filter(f => f.name.endsWith('.table.json') || f.name.endsWith('.table.md'));

    if (tableFiles.length === 0) {
        console.log("No table files found to scan for links.");
        return;
    }

     console.log(`Scanning ${tableFiles.length} table files for links...`);

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
                       cell.value = ""; // Clear the cell value
                       dataChanged = true;
                   }
               });
           });

           if (dataChanged) {
               await handler.save(file, data);
               console.log(`Removed links in: ${file.path}`);
           }
       } catch (e) {
            console.error(`Failed to process link removal in ${file.path}:`, e);
       }
    }
     console.log(`Finished link removal scan.`);
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
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'JSON Table Settings'});

		new Setting(containerEl)
			.setName('Use Markdown Wrapper (.table.md)')
			.setDesc('Store table data inside Markdown files (.table.md) with links in frontmatter for graph view integration. If disabled, uses simpler .table.json files (not visible in graph view). Requires restart or reload for changes to take full effect on file creation and opening.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useMarkdownWrapper)
				.onChange(async (value) => {
					console.log('Markdown Wrapper setting changed:', value);
					this.plugin.settings.useMarkdownWrapper = value;
					await this.plugin.saveSettings();
                    // Prompt user to reload
                    new Notice("Reload required for file handling changes to take full effect.", 5000);
				}));

        // Add more settings here later if needed
	}
}