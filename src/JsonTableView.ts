// src/JsonTableView.ts
import { ItemView, WorkspaceLeaf, TFile, App, ViewStateResult } from 'obsidian'; // Changed base class, added ViewStateResult
import { TableData, VIEW_TYPE_JSON_TABLE, JsonTableSettings, DEFAULT_SETTINGS } from './types';
import { TableRenderer } from './TableRenderer';
import { ITableFileHandler } from './fileHandlers/ITableFileHandler';
import { JsonFileHandler } from './fileHandlers/JsonFileHandler';
import { MarkdownFileHandler } from './fileHandlers/MarkdownFileHandler';

// Define the expected state structure
interface JsonTableViewState {
  file: string | null; // Store file path in state
}

// Change base class from FileView to ItemView
export class JsonTableView extends ItemView {
  private renderer: TableRenderer | null = null;
  private fileHandler: ITableFileHandler | null = null;
  public data: TableData | null = null;
  private settings: JsonTableSettings = DEFAULT_SETTINGS;
  // Keep track of the file associated via state
  private currentFilePath: string | null = null;

  public getFilePath(): string | null {
        return this.currentFilePath;
  }

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    console.log('JsonTableView constructor called');
  }

  // --- Core View Methods ---

  getViewType(): string {
    return VIEW_TYPE_JSON_TABLE;
  }

  getDisplayText(): any {
    // Get basename from path stored in state if file object isn't ready
    const path = this.currentFilePath;
    if (path) {
        // Basic basename extraction from path
        const base = path.substring(path.lastIndexOf('/') + 1);
        return base.replace(/\.(table\.json|table\.md)$/, '') || 'Table';
    }
    return 'Table';
  }

  getIcon(): string {
      return 'table'; // Provide an icon for ItemView
  }

  // --- Settings ---

  setSettings(settings: JsonTableSettings) {
    this.settings = settings;
    console.log('JsonTableView settings updated:', this.settings);
    // If view is active, re-evaluate and re-render if necessary
    if (this.currentFilePath && this.app.workspace.activeLeaf === this.leaf) {
        this.loadFileAndRender(this.currentFilePath); // Reload based on path
    }
  }

  // --- State Management (Replaces FileView's file handling) ---

async setState(state: any, result: ViewStateResult): Promise<void> {
    console.log('setState called with state:', state);
    
    const newFilePath = state.file || null;
    const fileChanged = newFilePath !== this.currentFilePath;
    
    this.currentFilePath = newFilePath;

    // Call parent setState
    await super.setState(state, result);

    // Only load and render if:
    // 1. The file path has changed, OR
    // 2. We don't have data loaded yet
    if (this.currentFilePath && (fileChanged || !this.data)) {
        console.log('setState: Loading and rendering file:', this.currentFilePath);
        await this.loadFileAndRender(this.currentFilePath);
    } else if (!this.currentFilePath) {
        console.log('setState: No file path provided');
        const container = this.containerEl.children[1];
        if (container) {
            this.showError(container, "No file specified in view state.", false);
        }
    } else {
        console.log('setState: File unchanged and data already loaded, skipping render');
    }
}

// async setState(state: any, result: ViewStateResult): Promise<void> {
//     console.log('setState called with state:', state);
    
//     const newFilePath = state.file || null;
//     const fileChanged = newFilePath !== this.currentFilePath;
    
//     this.currentFilePath = newFilePath;

//     // Call parent setState
//     await super.setState(state, result);

//     // Show loading immediately if we have a file to load
//     if (this.currentFilePath && (fileChanged || !this.data)) {
//         // Show loading screen
//         const container = this.containerEl.children[1];
//         if (container) {
//             container.empty();
//             container.addClass('json-table-view-container');
//             const loadingDiv = container.createEl('div', { cls: 'json-table-loading' });
//             loadingDiv.createEl('div', { text: 'Loading table...', cls: 'json-table-loading-text' });
//         }
        
//         console.log('setState: Loading and rendering file:', this.currentFilePath);
//         await this.loadFileAndRender(this.currentFilePath);
//     } else if (!this.currentFilePath) {
//         console.log('setState: No file path provided');
//         const container = this.containerEl.children[1];
//         if (container) {
//             this.showError(container, "No file specified in view state.", false);
//         }
//     } else {
//         console.log('setState: File unchanged and data already loaded, skipping render');
//     }
// }

  getState(): any {
    // Save the current file path
    return {
      file: this.currentFilePath
    };
  }

  // --- File Loading and Rendering (Triggered Manually) ---

  /** Loads the file based on path and triggers rendering */
  async loadFileAndRender(filePath: string) {
      console.log(`loadFileAndRender called for path: ${filePath}`);
      const file = this.app.vault.getAbstractFileByPath(filePath);

      if (file instanceof TFile) {
          this.selectFileHandler(file); // Select handler based on actual file
          await this.renderContent(file); // Render using the TFile
      } else {
          console.error(`File not found or is a folder: ${filePath}`);
          this.showError(this.containerEl.children[1], `Cannot load table: File not found at "${filePath}".`, false);
          this.clearView(); // Clear previous content if file is invalid
      }
  }


  // --- File Handler Logic ---

  /** Selects the appropriate file handler based on file extension and settings */
  private selectFileHandler(file: TFile) {
      // (This method remains largely the same as before)
      const useMarkdown = this.settings.useMarkdownWrapper;
      const isMarkdownTableFile = file.name.endsWith('.table.md');
      const isJsonTableFile = file.name.endsWith('.table.json');

      this.fileHandler = null; // Reset

      if (isMarkdownTableFile) {
          if (useMarkdown) {
              console.log('Selecting MarkdownFileHandler for', file.path);
              this.fileHandler = new MarkdownFileHandler(this.app);
          } else {
              console.log('Markdown wrapper setting is OFF for .table.md file:', file.path);
          }
      } else if (isJsonTableFile) {
          console.log('Selecting JsonFileHandler for', file.path);
          this.fileHandler = new JsonFileHandler(this.app);
      } else {
           console.log('File is not a .table.md or .table.json file:', file.path);
      }
  }

  // --- Rendering Logic ---

  /** Reads data using the selected handler and renders the table for a specific file */
  async renderContent(file: TFile) { // Accepts TFile
    console.log(`renderContent attempting for file: ${file.path}`);
    const container = this.containerEl.children[1];
    if (!container) return;
    container.empty();
    this.renderer = null;
    this.data = null;
    container.addClass('json-table-view-container');

    // Ensure handler is selected (should be called before renderContent now)
    if (!this.fileHandler) {
       this.selectFileHandler(file); // Try selecting again just in case
    }

    // Check validity based on selected handler and settings
    if (!this.fileHandler || !this.checkIfHandlerIsValid(file)) {
      console.warn(`renderContent: No valid file handler for ${file.path} with current settings.`);
      // ... (Error handling logic - unchanged) ...
       const useMarkdown = this.settings.useMarkdownWrapper;
       if (file.name.endsWith('.table.md') && !useMarkdown) {
           this.showError(container, "Enable 'Use Markdown Wrapper' in settings to view this file.", false);
       } else {
           this.showError(container, "This file is not recognized as a valid table type or requires different settings.", true);
       }
      return;
    }

    // Try reading and rendering
    try {
      console.log('Attempting to read using handler:', this.fileHandler.constructor.name);
      this.data = await this.fileHandler.read(file);
      console.log('Parsed data obtained.');

      if (!this.data || typeof this.data !== 'object' || !Array.isArray(this.data.columns) || !Array.isArray(this.data.rows)) {
        throw new Error('Invalid table data structure received.');
      }

      this.renderer = new TableRenderer(container, this.data, this);
      this.renderer.render();
      console.log('Table rendered successfully');

    } catch (e) {
      console.error(`Error rendering table for ${file.path}:`, e);
      this.clearView(); // Use helper to clear state
      this.showError(container, `Error reading table file: ${(e as Error).message}`, true);
    }
  }

  // --- Saving Logic ---

  async saveTableData(dataToSave: TableData) {
      // Use the file path stored in state to get the TFile object
      if (!this.currentFilePath) {
          console.error("Cannot save: No file path associated with the view.");
          this.app.workspace.trigger('notice', 'Error: Cannot save, no file loaded.');
          return;
      }
      const file = this.app.vault.getAbstractFileByPath(this.currentFilePath);

      if (!(file instanceof TFile)) {
            console.error(`Cannot save: File not found at path "${this.currentFilePath}".`);
            this.app.workspace.trigger('notice', 'Error: File to save not found.');
            return;
      }

      // Handler should be selected based on the file type
      this.selectFileHandler(file); // Ensure handler matches current file

      if (!this.fileHandler || !dataToSave || !this.checkIfHandlerIsValid(file)) {
        console.error('Cannot save: No valid handler, data, or settings mismatch.', { file: file, handler: this.fileHandler, data: dataToSave });
        this.app.workspace.trigger('notice', 'Error: Could not save table data.');
        return;
      }

      console.log('Attempting to save using handler:', this.fileHandler.constructor.name);
      try {
        await this.fileHandler.save(file, dataToSave);
        this.data = dataToSave; // Keep internal data in sync
      } catch (e) {
        console.error('Error saving table data:', e);
        this.app.workspace.trigger('notice', `Error saving table: ${(e as Error).message}`);
      }
  }

  // --- Lifecycle Methods ---

  // Called when view is attached to DOM
  async onOpen() {
    console.log('onOpen called');
    // If state includes a file path, ensure it's loaded and rendered
    if (this.currentFilePath && !this.renderer) {
        console.log('onOpen: File path exists but not rendered, attempting loadFileAndRender.');
        await this.loadFileAndRender(this.currentFilePath);
    } else if (!this.currentFilePath) {
         console.log('onOpen: No file path set.');
         this.showError(this.containerEl.children[1], "No file loaded.", false);
    }
  }

  // Called when view is detached
  async onClose() {
    console.log('onClose called');
    this.clearView();
  }

  // --- File Rename ---

  async renameFile(newName: string): Promise<boolean> {
    if (!this.currentFilePath) {
      console.error('Cannot rename: No file path associated with the view.');
      return false;
    }

    const currentFile = this.app.vault.getAbstractFileByPath(this.currentFilePath);
    if (!(currentFile instanceof TFile)) {
      console.error(`Cannot rename: File not found at path "${this.currentFilePath}".`);
      return false;
    }

    // Extract directory and full filename from current path
    const currentDir = currentFile.parent?.path || '';
    const currentFileName = currentFile.name;
    
    // Determine the file type (.table.json or .table.md)
    const isTableJson = currentFileName.endsWith('.table.json');
    const isTableMd = currentFileName.endsWith('.table.md');
    
    if (!isTableJson && !isTableMd) {
      console.error(`Cannot rename: File "${currentFileName}" is not a recognized table file type.`);
      return false;
    }
    
    // Clean the new name (remove any existing extension)
    const cleanName = newName.replace(/\.(table\.json|table\.md)$/, '');
    
    // Preserve the .table part of the extension
    const fileExtension = isTableJson ? '.table.json' : '.table.md';
    const newFileName = `${cleanName}${fileExtension}`;
    const newPath = currentDir ? `${currentDir}/${newFileName}` : newFileName;

    // Check if the new file already exists
    if (await this.app.vault.adapter.exists(newPath)) {
      console.error(`Cannot rename: File "${newFileName}" already exists.`);
      return false;
    }

    try {
      // Use Obsidian's vault rename method
      await this.app.vault.rename(currentFile, newPath);
      
      // Update our internal path reference
      this.currentFilePath = newPath;
      
      console.log(`File renamed successfully: ${this.currentFilePath}`);
      return true;
    } catch (error) {
      console.error('Error renaming file:', error);
      return false;
    }
  }

  // --- Utility ---

  private clearView() {
      this.containerEl.children[1]?.empty(); // Safely empty container
      this.renderer = null;
      this.fileHandler = null;
      this.data = null;
      this.currentFilePath = null; // Clear associated path
  }

   /** Checks if the currently selected handler is valid for the file and settings */
   private checkIfHandlerIsValid(file: TFile): boolean {
       const useMarkdown = this.settings.useMarkdownWrapper;
       const isMarkdownTableFile = file.name.endsWith('.table.md');
       const isJsonTableFile = file.name.endsWith('.table.json');

       if (isMarkdownTableFile) {
           return useMarkdown;
       } else if (isJsonTableFile) {
           return true; // Always allow reading JSON
       }
       return false; // Not a recognized table file
   }

   private showError(container: Element | null, message: string, showOpenAsText = false) {
       // ... (showError implementation - unchanged, but ensure it uses this.currentFilePath) ...
        if (!container) return;
        container.empty();
        container.addClass('json-table-view-container');
        const errorDiv = container.createEl('div', { cls: 'json-table-error' });
        errorDiv.createEl('p', { text: message });

        const filePathToShow = this.currentFilePath; // Use path from state

        if (showOpenAsText && filePathToShow) {
            const openAsTextBtn = errorDiv.createEl('button', {
              text: 'Open as raw text',
              cls: 'json-table-add-row'
            });
            openAsTextBtn.addEventListener('click', () => {
              if (this.leaf) {
                  this.leaf.setViewState({
                    type: 'plaintext',
                    state: { file: filePathToShow } // Pass file path
                  });
              }
            });
        }
   }

} // End JsonTableView class