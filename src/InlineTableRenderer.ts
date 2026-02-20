// src/InlineTableRenderer.ts
import { MarkdownRenderChild, MarkdownView } from 'obsidian';
import { TableData, ColumnDef, CellData, JsonTableSettings, DEFAULT_SETTINGS } from './types';
import { DivTableRenderer } from './renderers/DivTableRenderer';
import { AbstractTableRenderer } from './renderers/AbstractTableRenderer';
import { JsonTableView } from './JsonTableView';
import { App, TFile } from 'obsidian';
import { createMockView } from './utils/viewUtils';

/**
 * Renders a table inline within a markdown note using a code block.
 * This is a read-only view that embeds the table data from the code block itself.
 */
export class InlineTableRenderer extends MarkdownRenderChild {
  private renderer: AbstractTableRenderer | null = null;
  private data: TableData | null = null;
  private tableViewId: string = ''; // Store the view ID to uniquely identify this table instance
  private originalSourceHash: string = ''; // Store a hash of original source as fallback for duplicate IDs

  constructor(
    containerEl: HTMLElement,
    private source: string, // The JSON string from the code block
    private app: App,
    private file: TFile, // The file containing this inline table
    private settings: JsonTableSettings
  ) {
    super(containerEl);
    if (!this.settings) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
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
      const mockView = createMockView({
        app: this.app,
        saveTableData: async (data: TableData) => {
          // Save back to the code block in the file
          await this.saveToCodeBlock(data);
        },
        getFilePath: () => this.file.path,
        getRenderer: () => this.renderer
      });

      // Create and render the table
      this.containerEl.addClass('json-table-inline-container');
      this.containerEl.addClass('json-table-inline-container');
      this.renderer = new DivTableRenderer(this.containerEl, this.data, mockView, true, this.settings);
      this.renderer?.render();

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

      const jsonString = JSON.stringify(data, null, 2);
      const newCodeBlock = `\`\`\`jsontable\n${jsonString}\n\`\`\``;
      let foundMatch = false;

      // Use vault.process for atomic update
      await this.app.vault.process(this.file, (content) => {
        // Find and replace the SPECIFIC code block that matches this instance's view ID
        const codeBlockRegex = /```jsontable\s*\n([\s\S]*?)\n```/g;

        // Collect all matches first to handle duplicate view IDs
        const matches: Array<{ match: RegExpExecArray, parsed: TableData, hash: string }> = [];
        codeBlockRegex.lastIndex = 0;

        let match;
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

        // Match logic
        let targetMatch: RegExpExecArray | null = null;
        if (matches.length === 1) {
          targetMatch = matches[0].match;
        } else if (matches.length > 1) {
          const matchingByHash = matches.find(m => m.hash === this.originalSourceHash);
          targetMatch = matchingByHash ? matchingByHash.match : matches[0].match;
        }

        if (targetMatch) {
          const startPos = targetMatch.index;
          const endPos = startPos + targetMatch[0].length;
          // Return updated content
          foundMatch = true;
          return content.substring(0, startPos) + newCodeBlock + content.substring(endPos);
        }

        console.warn(`Could not find matching code block with view ID: ${this.tableViewId}`);
        return content; // No change
      });

      if (foundMatch) {
        this.data = data; // Update local reference
        this.source = jsonString; // Update source reference
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

