// src/InlineTableRenderer.ts
import { MarkdownRenderChild, MarkdownView } from 'obsidian';
import { TableData, ColumnDef, CellData } from './types';
import { TableRenderer } from './TableRenderer';
import { JsonTableView } from './JsonTableView';
import { App, TFile } from 'obsidian';

/**
 * Renders a table inline within a markdown note using a code block.
 * This is a read-only view that embeds the table data from the code block itself.
 */
export class InlineTableRenderer extends MarkdownRenderChild {
  private renderer: TableRenderer | null = null;
  private data: TableData | null = null;
  private tableViewId: string; // Store the view ID to uniquely identify this table instance
  private originalSourceHash: string; // Store a hash of original source as fallback for duplicate IDs

  constructor(
    containerEl: HTMLElement,
    private source: string, // The JSON string from the code block
    private app: App,
    private file: TFile // The file containing this inline table
  ) {
    super(containerEl);
  }

  onload() {
    try {
      // Parse the JSON from the code block
      this.data = JSON.parse(this.source);

      // Validate the structure
      if (!this.data || typeof this.data !== 'object' || !Array.isArray(this.data.columns) || !Array.isArray(this.data.rows)) {
        this.containerEl.createDiv({ text: 'Invalid table data structure.', cls: 'json-table-error' });
        return;
      }

      // Store the view ID immediately - this uniquely identifies this table instance
      this.tableViewId = this.data.views?.[0]?.id || '';
      
      if (!this.tableViewId) {
        console.error('Inline table missing view ID - cannot uniquely identify this table');
        this.containerEl.createDiv({ text: 'Invalid table: missing view ID.', cls: 'json-table-error' });
        return;
      }

      // Store a hash of the original source as fallback for duplicate view IDs
      // Simple hash: first column ID + first column name (should be unique enough)
      const firstColId = this.data.columns?.[0]?.id || '';
      const firstColName = this.data.columns?.[0]?.name || '';
      this.originalSourceHash = `${firstColId}:${firstColName}`;

      // Create a mock view for the renderer
      // Inline tables don't support renaming, but we provide the interface
      const mockView = {
        app: this.app,
        saveTableData: async (data: TableData) => {
          // Save back to the code block in the file
          await this.saveToCodeBlock(data);
        },
        getFilePath: () => this.file.path,
        renameFile: async (newName: string): Promise<boolean> => {
          // Inline tables don't support renaming (they're part of the file)
          return false;
        }
      } as unknown as JsonTableView;

      // Create and render the table
      this.containerEl.addClass('json-table-inline-container');
      this.renderer = new TableRenderer(this.containerEl, this.data, mockView);
      this.renderer.render();

    } catch (error) {
      console.error('Error rendering inline table:', error);
      this.containerEl.createDiv({ 
        text: `Error parsing table JSON: ${(error as Error).message}`, 
        cls: 'json-table-error' 
      });
    }
  }

  /** Saves table data back to the code block in the file */
  async saveToCodeBlock(data: TableData): Promise<void> {
    try {
      if (!this.tableViewId) {
        console.error('Cannot save: Table instance missing view ID');
        return;
      }

      // Ensure the data being saved has the same view ID (preserve identity)
      if (!data.views || data.views.length === 0) {
        data.views = [{ id: this.tableViewId, name: 'Default', sort: [], filter: [] }];
      } else {
        // Preserve the view ID
        data.views[0].id = this.tableViewId;
      }

      // Read the current file content
      let content = await this.app.vault.read(this.file);
      
      // Find and replace the SPECIFIC code block that matches this instance's view ID
      const codeBlockRegex = /```jsontable\s*\n([\s\S]*?)\n```/g;
      const jsonString = JSON.stringify(data, null, 2);
      const newCodeBlock = `\`\`\`jsontable\n${jsonString}\n\`\`\``;

      // Find the code block that matches this instance's view ID
      let match;
      let foundMatch = false;
      
      // Collect all matches first to handle duplicate view IDs
      const matches: Array<{match: RegExpExecArray, parsed: TableData, hash: string}> = [];
      codeBlockRegex.lastIndex = 0;
      
      while ((match = codeBlockRegex.exec(content)) !== null) {
        const matchedContent = match[1].trim();
        
        try {
          const parsedMatch = JSON.parse(matchedContent);
          const matchViewId = parsedMatch.views?.[0]?.id;
          
          if (matchViewId === this.tableViewId) {
            // Calculate hash for this match
            const matchFirstColId = parsedMatch.columns?.[0]?.id || '';
            const matchFirstColName = parsedMatch.columns?.[0]?.name || '';
            const matchHash = `${matchFirstColId}:${matchFirstColName}`;
            
            matches.push({ match, parsed: parsedMatch, hash: matchHash });
          }
        } catch (e) {
          // Skip invalid JSON blocks
          continue;
        }
      }

      // If multiple matches found (duplicate view IDs), match by hash
      // Otherwise, match by view ID only
      let targetMatch: RegExpExecArray | null = null;
      
      if (matches.length === 1) {
        // Unique match by view ID
        targetMatch = matches[0].match;
      } else if (matches.length > 1) {
        // Duplicate view IDs - match by hash (original column ID + name)
        const matchingByHash = matches.find(m => m.hash === this.originalSourceHash);
        if (matchingByHash) {
          targetMatch = matchingByHash.match;
        } else {
          // Hash doesn't match - fallback to first match (shouldn't happen, but safety)
          targetMatch = matches[0].match;
        }
      }

      if (targetMatch) {
        const startPos = targetMatch.index;
        const endPos = startPos + targetMatch[0].length;
        content = content.substring(0, startPos) + newCodeBlock + content.substring(endPos);
        foundMatch = true;
      }

      if (foundMatch) {
        await this.app.vault.modify(this.file, content);
        this.data = data; // Update local reference
        this.source = jsonString; // Update source reference
      } else {
        console.warn(`Could not find matching code block with view ID: ${this.tableViewId}`);
      }
    } catch (error) {
      console.error('Error saving inline table:', error);
    }
  }

  onunload() {
    // Cleanup if needed
    this.renderer = null;
    this.data = null;
  }
}

