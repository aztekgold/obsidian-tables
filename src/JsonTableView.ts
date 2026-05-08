// src/JsonTableView.ts
import { ItemView, WorkspaceLeaf, TFile, Notice, ViewStateResult } from 'obsidian';
import { TableData, VIEW_TYPE_JSON_TABLE, JsonTableSettings, DEFAULT_SETTINGS } from './types';
import { AbstractTableRenderer } from './renderers/AbstractTableRenderer';
import { DivTableRenderer } from './renderers/DivTableRenderer';
import { ITableFileHandler } from './fileHandlers/ITableFileHandler';
import { getHandlerForFile } from './utils/fileUtils';

export class JsonTableView extends ItemView {
  private renderer: AbstractTableRenderer | null = null;
  private fileHandler: ITableFileHandler | null = null;
  public data: TableData | null = null;
  private settings: JsonTableSettings = DEFAULT_SETTINGS;
  // Keep track of the file associated via state
  private currentFilePath: string | null = null;
  navigation = true;

  public getFilePath(): string | null {
    return this.currentFilePath;
  }

  public getRenderer(): AbstractTableRenderer | null {
    return this.renderer;
  }

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
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
    // If view is active, re-evaluate and re-render if necessary
    const activeView = this.app.workspace.getActiveViewOfType(JsonTableView);
    if (this.currentFilePath && activeView === this) {
      this.loadFileAndRender(this.currentFilePath); // Reload based on path
    }
  }

  // --- State Management (Replaces FileView's file handling) ---

  async setState(state: any, result: ViewStateResult): Promise<void> {

    const newFilePath = state.file || null;
    const fileChanged = newFilePath !== this.currentFilePath;

    this.currentFilePath = newFilePath;

    // Call parent setState
    await super.setState(state, result);

    // Only load and render if:
    // 1. The file path has changed, OR
    // 2. We don't have data loaded yet
    if (this.currentFilePath && (fileChanged || !this.data)) {
      await this.loadFileAndRender(this.currentFilePath);
    } else if (!this.currentFilePath) {
      const container = this.containerEl.children[1];
      if (container) {
        this.showError(container, "No file specified in view state.", false);
      }
    } else {
    }
  }

  getState(): any {
    // Save the current file path
    return {
      file: this.currentFilePath
    };
  }

  // --- File Loading and Rendering (Triggered Manually) ---

  /** Loads the file based on path and triggers rendering */
  async loadFileAndRender(filePath: string) {
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
    this.fileHandler = getHandlerForFile(this.app, file, this.settings);
  }

  // --- Rendering Logic ---

  /** Reads data using the selected handler and renders the table for a specific file */
  async renderContent(file: TFile) { // Accepts TFile
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

      // Fallback for generic .json files: 
      // If we caught a .json file that is NOT a .table.json (and thus not valid),
      // we should try to open it as a regular text file (Source/Markdown view)
      // so we don't block the user from editing their JSON.
      if (file.extension === 'json' && !file.name.endsWith('.table.json')) {
        // Switch this leaf to text view
        // We use 'markdown' as it handles text editing well in Obsidian
        // or 'json' if another plugin registered it? Safe bet is 'markdown' (source).
        this.leaf.setViewState({
          type: 'markdown',
          state: { file: file.path }
        }).catch(err => {
          console.error("Failed to fallback generic JSON to markdown view:", err);
          // If fallback fails, show the error as usual
          this.showError(container, "This file is not recognized as a valid table type.", true);
        });
        return;
      }

      console.warn(`renderContent: No valid file handler for ${file.path} with current settings.`);
      // ... (Error handling logic - unchanged) ...
      // use standard error for others
      this.showError(container, "This file is not recognized as a valid table type or requires different settings.", true);
      return;
    }

    // Try reading and rendering
    try {
      this.data = await this.fileHandler.read(file);

      if (!this.data || typeof this.data !== 'object' || !Array.isArray(this.data.columns) || !Array.isArray(this.data.rows)) {
        throw new Error('Invalid table data structure received.');
      }



      // Always use DivTableRenderer
      this.renderer = new DivTableRenderer(container, this.data, this, false, this.settings);
      this.renderer.render();

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
      new Notice('Error: Cannot save, no file loaded.');
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(this.currentFilePath);

    if (!(file instanceof TFile)) {
      console.error(`Cannot save: File not found at path "${this.currentFilePath}".`);
      new Notice('Error: File to save not found.');
      return;
    }

    // Handler should be selected based on the file type
    this.selectFileHandler(file); // Ensure handler matches current file

    if (!this.fileHandler || !dataToSave || !this.checkIfHandlerIsValid(file)) {
      console.error('Cannot save: No valid handler, data, or settings mismatch.', { file: file, handler: this.fileHandler, data: dataToSave });
      new Notice('Error: Could not save table data.');
      return;
    }

    try {
      // If it's a CSV file, we do NOT save to disk (as per user request)
      if (file.name.endsWith('.csv')) {
        this.data = dataToSave; // Update internal memory only
        // Optionally notify user that changes are not saved?
        // For now, silent as requested "making changes does not save the document"
        return;
      }

      await this.fileHandler.save(file, dataToSave);
      this.data = dataToSave; // Keep internal data in sync
    } catch (e) {
      console.error('Error saving table data:', e);
      new Notice(`Error saving table: ${(e as Error).message}`);
    }
  }

  // --- Lifecycle Methods ---

  // --- Lifecycle Methods ---

  // Called when view is attached to DOM
  async onOpen() {
    // If state includes a file path, ensure it's loaded and rendered
    if (this.currentFilePath && !this.renderer) {
      await this.loadFileAndRender(this.currentFilePath);
    } else if (!this.currentFilePath) {
      this.showError(this.containerEl.children[1], "No file loaded.", false);
    }

    // Register Vault Events for Rename/Delete
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (this.currentFilePath && oldPath === this.currentFilePath) {
          // Update internal path first so setState doesn't trigger a full reload
          this.currentFilePath = file.path;
          // Persist the new path in the view state (survives restarts)
          this.leaf.setViewState({
            type: VIEW_TYPE_JSON_TABLE,
            state: { file: file.path }
          });
        }
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (this.currentFilePath && file.path === this.currentFilePath) {
          // File deleted, close the view
          this.leaf.detach();
        }
      })
    );
  }

  // Called when view is detached
  async onClose() {
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
    if (this.app.vault.getAbstractFileByPath(newPath)) {
      console.error(`Cannot rename: File "${newFileName}" already exists.`);
      return false;
    }

    try {
      // Use Obsidian's vault rename method
      // Note: Do NOT update currentFilePath here — the vault 'rename' event
      // handler will detect the change and update it properly
      await this.app.vault.rename(currentFile, newPath);

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
    // Do NOT clear currentFilePath here — it defines the view's identity/state
  }

  /** Checks if the currently selected handler is valid for the file and settings */
  private checkIfHandlerIsValid(file: TFile): boolean {
    const isMarkdownTableFile = file.name.endsWith('.table.md');
    const isJsonTableFile = file.name.endsWith('.table.json');

    if (isMarkdownTableFile) {
      return true; // Always allow reading Markdown tables
    } else if (isJsonTableFile) {
      return true; // Always allow reading JSON
    } else if (file.name.endsWith('.csv') && this.settings.enableCsvSupport) {
      return true;
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