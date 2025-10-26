// src/JsonTableView.ts
import { FileView, WorkspaceLeaf, TFile, App } from 'obsidian';
import { TableData, VIEW_TYPE_JSON_TABLE } from './types'; // Assuming settings are moved or imported
import { TableRenderer } from './TableRenderer';
// --- Import Handlers ---
import { ITableFileHandler } from './fileHandlers/ITableFileHandler';
import { JsonFileHandler } from './fileHandlers/JsonFileHandler';
import { MarkdownFileHandler } from './fileHandlers/MarkdownFileHandler';

// --- Settings ---
// Consider moving this interface and DEFAULT_SETTINGS to types.ts
export interface JsonTableSettings {
  useMarkdownWrapper: boolean;
}
export const DEFAULT_SETTINGS: JsonTableSettings = {
  useMarkdownWrapper: false // Default to JSON
}
// --- End Settings ---

export class JsonTableView extends FileView {
  private renderer: TableRenderer | null = null;
  private fileHandler: ITableFileHandler | null = null;
  public data: TableData | null = null; // Store loaded data, accessible by editors
  private settings: JsonTableSettings = DEFAULT_SETTINGS; // Store plugin settings

  constructor(leaf: WorkspaceLeaf) {
    console.log("JsonTableView constructor called");
    super(leaf);
    // Settings will be updated via setSettings by the main plugin
  }

  // --- Core View Methods ---

  getViewType(): string {
    return VIEW_TYPE_JSON_TABLE;
  }

  getDisplayText(): string {
    // Attempt to remove custom extensions for display
    return this.file?.basename.replace(/\.(table\.json|table\.md)$/, '') || 'JSON Table';
  }

  // --- Settings ---

  /** Called by the main plugin to pass loaded settings */
  setSettings(settings: JsonTableSettings) {
    this.settings = settings;
    console.log('JsonTableView settings updated:', this.settings);
    // If a file is already open, re-evaluate the handler and potentially re-render
    if (this.file) {
        this.selectFileHandler(this.file);
        this.renderContent(); // Re-render if handler changes or might be invalid now
    }
  }

  // --- File Handling Lifecycle ---

  async onLoadFile(file: TFile): Promise<void> {
    console.log("onLoadFile START")
    console.log('onLoadFile called with:', file.path);
    this.selectFileHandler(file); // Select handler based on extension/setting
    await this.renderContent();
  }

   async onUnloadFile(file: TFile): Promise<void> {
     console.log('onUnloadFile called');
     // Cleanup if needed, e.g., destroy renderer, clear data
     this.containerEl.children[1].empty(); // Clear content area
     this.renderer = null;
     this.fileHandler = null;
     this.data = null;
   }

  //  async onOpen() {
  //    console.log('onOpen called');
  //    // Called when the view is opened or revealed
  //    // Ensure content is rendered if a file is loaded
  //    if (this.file && !this.renderer) {
  //       this.renderContent();
  //    }
  //  }
  onload() {
    super.onload(); // Call the parent class's onload
    console.log('JsonTableView onload called');
    // At this point, this.file should be assigned if the view is linked to a file.
    if (this.file) {
      console.log('JsonTableView onload: File found, ensuring content is rendered.');
      // Select handler and render content
      this.selectFileHandler(this.file);
      this.renderContent();
    } else {
      console.log('JsonTableView onload: No file associated with this view instance.');
      // Show an appropriate error or empty state if no file is expected
      this.showError(this.containerEl.children[1], "No file loaded.", false);
    }
  }

async onOpen() {
    console.log('onOpen called - view is becoming active.');
    // We don't need to manually trigger rendering here anymore.
    // If content wasn't rendered during onload, there might be another issue.
  }

   async onClose() {
     console.log('onClose called');
     // Cleanup if needed
     this.containerEl.children[1].empty();
     this.renderer = null;
     this.fileHandler = null;
     this.data = null;
   }


  // --- File Handler Logic ---

  /** Selects the appropriate file handler based on file extension and settings */
  private selectFileHandler(file: TFile) {
      const useMarkdown = this.settings.useMarkdownWrapper;
      // Use specific extensions for clarity
      const isMarkdownTableFile = file.name.endsWith('.table.md');
      const isJsonTableFile = file.name.endsWith('.table.json');
      const isGenericJsonFile = file.extension === 'json' && !isJsonTableFile;
      const isGenericMdFile = file.extension === 'md' && !isMarkdownTableFile;

      this.fileHandler = null; // Reset handler

      if (isMarkdownTableFile) {
          if (useMarkdown) {
              console.log('Using MarkdownFileHandler for', file.path);
              this.fileHandler = new MarkdownFileHandler(this.app);
          } else {
              console.log('Markdown wrapper setting is OFF for', file.path);
              // Show error, handled in renderContent
          }
      } else if (isJsonTableFile) {
          console.log('Using JsonFileHandler for', file.path);
          this.fileHandler = new JsonFileHandler(this.app);
          // Optional: Handle conversion if useMarkdown is ON? For now, just read it.
      } else if (isGenericJsonFile) {
           console.log('File is generic JSON, not a table file:', file.path);
           // Show error, handled in renderContent
      } else if (isGenericMdFile) {
            console.log('File is generic MD, not a table file:', file.path);
            // This case shouldn't happen if extension registration is specific,
            // but handle defensively. Show error in renderContent.
      } else {
           console.log('Unknown file type for table view:', file.path);
           // Show error, handled in renderContent
      }
  }

  // --- Rendering Logic ---

  /** Reads data using the selected handler and renders the table */
  async renderContent() {
    console.log('renderContent called, file:', this.file?.path);

    // --- ADD EXPLICIT FILE CHECK ---
    // The view's 'file' property should be set automatically by Obsidian
    // when the view is attached to the leaf after setViewState.
    if (!this.file) {
        console.error("renderContent: this.file is null or undefined!");
        this.showError(this.containerEl.children[1], "Cannot load table: File not available.", false);
        return; // Stop execution if file isn't set
    }

    console.log('renderContent - File available:', this.file.path); // Log file confirmation
    const container = this.containerEl.children[1]; // Target the content area
    container.empty(); // Clear previous content
    this.renderer = null; // Clear old renderer instance
    this.data = null; // Clear old data

    container.addClass('json-table-view-container'); // Ensure base class is present

    if (!this.file) {
      this.showError(container, "No file loaded.", false);
      return;
    }

    // Check if a valid handler was selected based on settings and file type
    if (!this.fileHandler) {
      const useMarkdown = this.settings.useMarkdownWrapper;
      if (this.file.name.endsWith('.table.md') && !useMarkdown) {
          this.showError(container, "Enable 'Use Markdown Wrapper' in settings to view this file.", false);
      } else if (this.file.name.endsWith('.table.json') && useMarkdown){
          // Allow opening JSON even if MD is preferred - use JSON handler temporarily
          console.log('Opening .table.json with setting ON, using JsonFileHandler.');
          this.fileHandler = new JsonFileHandler(this.app);
          // Fall through to try reading with the JSON handler...
      }
      else {
          this.showError(container, "This file is not recognized as a valid table type or requires different settings.", true);
      }
       // If still no handler after potential fallback, exit.
      if (!this.fileHandler) return;
    }

    // Try reading and rendering
    try {
      console.log('Attempting to read using handler:', this.fileHandler.constructor.name);
      this.data = await this.fileHandler.read(this.file);
      console.log('Parsed data obtained.');

      if (!this.data || !this.data.columns || !this.data.rows) {
        throw new Error('Invalid table data structure received from handler.');
      }

      // Pass data to renderer
      this.renderer = new TableRenderer(container, this.data, this);
      this.renderer.render();
      console.log('Table rendered successfully');

    } catch (e) {
      console.error('Error rendering table:', e);
      this.data = null; // Clear data on error
      this.showError(
        container,
        'Error reading table file: ' + (e as Error).message,
        true // Show "Open as text" button
      );
    }
  }

  // --- Saving Logic ---

  /** Public method called by components to save data */
  async saveTableData(dataToSave: TableData) { // Accept data argument
    // Use the currently loaded file and selected handler
    if (!this.file || !this.fileHandler || !dataToSave) {
      console.error('Cannot save: No file, handler, or data provided.');
      // Maybe show a notice to the user?
      this.app.workspace.trigger('notice', 'Error: Could not save table data.');
      return;
    }

    console.log('Attempting to save using handler:', this.fileHandler.constructor.name);
    try {
      await this.fileHandler.save(this.file, dataToSave);
      // Update internal data state *after* successful save
      this.data = dataToSave;
    } catch (e) {
      console.error('Error saving table data:', e);
      this.app.workspace.trigger('notice', `Error saving table: ${(e as Error).message}`);
    }
  }

  // --- Utility ---

  /** Helper function to display errors */
  private showError(container: Element, message: string, showOpenAsText = false) {
    container.empty(); // Clear previous content before showing error
    const errorDiv = container.createEl('div', { cls: 'json-table-error' });
    errorDiv.createEl('p', { text: message });

    if (showOpenAsText && this.file) { // Only show button if a file exists
      const openAsTextBtn = errorDiv.createEl('button', {
        text: 'Open as raw text',
        cls: 'json-table-add-row' // Re-using style
      });

      openAsTextBtn.addEventListener('click', () => {
        // Use setViewState on the current leaf to change view type
        this.leaf.setViewState({
          type: 'plaintext',
          state: { file: this.file?.path }
        });
      });
    }
  }

} // End JsonTableView class