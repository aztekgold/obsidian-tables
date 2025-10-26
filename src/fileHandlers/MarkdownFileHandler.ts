// src/fileHandlers/MarkdownFileHandler.ts
import { App, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { TableData } from '../types'; // Adjust path if needed
import { ITableFileHandler } from './ITableFileHandler'; // Adjust path if needed

// Define constants for code block delimiters
const CODE_BLOCK_START = '```json-table';
const CODE_BLOCK_END = '```';
// Use constants in the Regex - make whitespace matching flexible
const JSON_CODE_BLOCK_REGEX = new RegExp(
    // Match start, optional whitespace/newline, capture content (non-greedy), optional whitespace/newline, match end
    `${CODE_BLOCK_START}\\s*\\n?([\\s\\S]*?)\\n?\\s*${CODE_BLOCK_END}`
);

// Define the frontmatter key for identification
const FRONTMATTER_PLUGIN_KEY = 'json-table-plugin';
const FRONTMATTER_LINKS_KEY = 'table-links';

/**
 * Handles reading/writing table data embedded within a Markdown file (.table.md).
 * Stores table identification and links in the frontmatter.
 * Embeds table JSON data within a specific code block.
 */
export class MarkdownFileHandler implements ITableFileHandler {

  constructor(private app: App) {}

  /**
   * Reads the .table.md file, verifies frontmatter, and extracts JSON data.
   */
  async read(file: TFile): Promise<TableData> {
    const content = await this.app.vault.read(file);
    console.log(`Reading MD file: ${file.path}. Content length: ${content.length}`);

    // --- Verify Frontmatter ---
    // Although the file-open listener checks, this ensures direct opening works too
    // and provides a check if the listener somehow fails.
    let frontmatter: any = {};
    if (content.startsWith('---')) {
        const fmMatch = content.match(/^---\s*([\s\\S]*?)\s*---/);
        if (fmMatch && fmMatch[1]) {
            try {
                frontmatter = parseYaml(fmMatch[1]);
            } catch (e) {
                console.warn(`Could not parse frontmatter in ${file.path}, proceeding without check.`);
            }
        }
    }
    // Check if the file identifies itself as one of ours
    if (frontmatter?.[FRONTMATTER_PLUGIN_KEY] !== true) {
         // This check might be redundant if the view's selectFileHandler already does it,
         // but provides safety. Adjust error handling as needed.
         console.warn(`File ${file.path} is missing '${FRONTMATTER_PLUGIN_KEY}: true' in frontmatter.`);
         // Depending on desired behavior, could throw error or try parsing anyway
         // throw new Error(`File is not marked as a JSON Table file in frontmatter.`);
    }
    // --- End Frontmatter Verification ---


    // --- Extract JSON from Code Block ---
    const match = content.match(JSON_CODE_BLOCK_REGEX);
    console.log("Regex match result:", match ? `Found match, group 1 length: ${match[1]?.length}` : "No match found");

    if (!match || match[1] === undefined || match[1] === null) {
        // Provide more detailed error messages
        if (!content.includes(CODE_BLOCK_START)) {
            throw new Error(`Could not find '${CODE_BLOCK_START}' code block start in ${file.path}`);
        } else if (!content.substring(content.indexOf(CODE_BLOCK_START)).includes(CODE_BLOCK_END)) {
            throw new Error(`Found '${CODE_BLOCK_START}' but no closing '${CODE_BLOCK_END}' in ${file.path}`);
        } else {
             const startIndex = content.indexOf(CODE_BLOCK_START);
             console.error("Regex failed despite markers present. Content around block:\n", content.substring(Math.max(0, startIndex-20), startIndex+100));
            throw new Error(`Could not extract content from '${CODE_BLOCK_START}' code block in ${file.path}. Check for malformed block or unexpected characters.`);
        }
    }

    const jsonContent = match[1].trim();
    // Handle case where code block is present but empty
    if (!jsonContent) {
        console.warn(`Empty json-table code block found in ${file.path}. Returning default structure.`);
        // Return a valid empty table structure
        return { columns: [], rows: [], views: [{ id: 'default_'+Date.now(), name: 'Default', sort: [], filter: [] }] };
    }

    console.log("Attempting to parse JSON content...");
    try {
      const data: TableData = JSON.parse(jsonContent);
      // Basic validation
      if (!data || typeof data !== 'object' || !Array.isArray(data.columns) || !Array.isArray(data.rows)) {
        throw new Error('Invalid table JSON structure: missing columns or rows.');
      }

      // --- Ensure views array and default view exist (migration for older files) ---
      if (!data.views || !Array.isArray(data.views) || data.views.length === 0) {
        console.log("No views found in file data, creating default view.");
        data.views = [{
            id: 'default_' + Date.now(),
            name: 'Default',
            sort: [],
            filter: []
            // hiddenColumns: [] // Add if needed
        }];
      }
      // Ensure the first view has a sort array
      if (!data.views[0].sort) {
          data.views[0].sort = [];
      }
      // Ensure typeOptions exists on columns (migration)
       data.columns.forEach(col => {
           if (!col.typeOptions) {
               col.typeOptions = {};
               // Migrate old direct properties if they exist
               if ((col as any).dateFormat) {
                    (col.typeOptions as any).dateFormat = (col as any).dateFormat;
                    delete (col as any).dateFormat;
               }
               if ((col as any).options) {
                   (col.typeOptions as any).options = (col as any).options;
                   delete (col as any).options;
               }
                if ((col as any).suggestAllFiles !== undefined) { // Check for undefined for boolean
                   (col.typeOptions as any).suggestAllFiles = (col as any).suggestAllFiles;
                   delete (col as any).suggestAllFiles;
               }
           }
       });
       // --- End Migration ---

      console.log("JSON parsed successfully.");
      return data;
    } catch (e) {
      console.error(`Error parsing embedded JSON in ${file.path}:`, jsonContent.substring(0, 500), e); // Log more context on error
      throw new Error(`Invalid embedded JSON: ${(e as Error).message}`);
    }
  }

  /**
   * Saves the TableData into the .table.md file, updating frontmatter and code block.
   */
  async save(file: TFile, data: TableData): Promise<void> {
    try {
      // 1. Stringify the table data cleanly
      const jsonString = JSON.stringify(data, null, 2);

      // 2. Extract unique links from 'notelink' columns
      const linkPaths = this.extractLinkPaths(data);

      // 3. Read the existing markdown content
      const existingContent = await this.app.vault.read(file);

      // 4. Update the frontmatter and JSON block within the content
      let newContent = this.updateMarkdownContent(existingContent, jsonString, linkPaths);

      // 5. Write the updated content back to the file
      await this.app.vault.modify(file, newContent);
      console.log(`Table data saved successfully to Markdown file ${file.path}`);

    } catch (e) {
      console.error(`Error saving Markdown file ${file.path}:`, e);
      throw new Error(`Failed to save Markdown file: ${(e as Error).message}`);
    }
  }

  /** Extracts unique, non-empty paths from notelink columns */
  private extractLinkPaths(data: TableData): string[] {
    const linkPaths = new Set<string>(); // Use Set for automatic uniqueness
    // Find column IDs of type 'notelink'
    const linkColumnIds = data.columns
      .filter(col => col.type === 'notelink')
      .map(col => col.id);

    // If no notelink columns, return empty array
    if (linkColumnIds.length === 0) {
      return [];
    }

    // Iterate through all cells
    data.rows.forEach(row => {
      row.forEach(cell => {
        // If cell is in a notelink column and has a value, add it
        if (linkColumnIds.includes(cell.column) && cell.value) {
          linkPaths.add(cell.value);
        }
      });
    });

    // Convert Set back to Array
    return Array.from(linkPaths);
  }

  /** Updates or creates frontmatter and replaces the JSON code block in markdown content */
  private updateMarkdownContent(existingContent: string, newJsonString: string, linkPaths: string[]): string {
    let frontmatter: Record<string, any> = {};
    let body = existingContent;

    // --- Try to parse existing frontmatter ---
    if (existingContent.startsWith('---')) {
      const fmMatch = existingContent.match(/^---\s*([\s\S]*?)\s*---/);
      if (fmMatch && fmMatch[1]) {
        try {
          frontmatter = parseYaml(fmMatch[1]) || {};
          // Get the content *after* the frontmatter block
          body = existingContent.substring(fmMatch[0].length).trimStart();
        } catch (e) {
          console.warn(`Could not parse existing frontmatter in file, preserving original body structure. Error: ${e}`);
          // Keep existing body, frontmatter remains empty, will be overwritten
          frontmatter = {};
          body = existingContent; // Treat everything as body if parse fails
        }
      } else {
          // If starts with --- but doesn't match regex (e.g., malformed), treat all as body
          body = existingContent;
      }
    } else {
        // No frontmatter found, treat all content as body
        body = existingContent;
    }
    // --- End Frontmatter Parsing ---

    // --- Ensure required frontmatter keys exist ---
    frontmatter[FRONTMATTER_PLUGIN_KEY] = true; // Always ensure this is set
    // Update links, wrapping them in wikilink syntax for Obsidian graph
    frontmatter[FRONTMATTER_LINKS_KEY] = linkPaths.map(path => `[[${path}]]`);
    // --- End Frontmatter Update ---

    // Create the new frontmatter string (will always exist now)
    const newFrontmatterString = `---\n${stringifyYaml(frontmatter)}---\n`;

    // --- Find and replace the JSON block in the body ---
    let newBody = body;
    const match = body.match(JSON_CODE_BLOCK_REGEX);

    // Construct the new code block using constants
    const newCodeBlock = `${CODE_BLOCK_START}\n${newJsonString}\n${CODE_BLOCK_END}`;

    if (match) {
      // If a block exists, replace it
      console.log("Replacing existing json-table code block.");
      // Check if the body *only* contains the code block (and maybe whitespace/comments)
      // This prevents duplicating surrounding text if the body was minimal
      const contentOutsideBlock = body.replace(JSON_CODE_BLOCK_REGEX, '').trim();
       const commentRegex = /<!--[\s\S]*?-->/g; // Regex to find HTML comments
       const nonCommentContent = contentOutsideBlock.replace(commentRegex, '').trim();

      if (!nonCommentContent || nonCommentContent.startsWith('##')) { // Allow headings before block
          // If only comments or headings exist outside, replace the whole effective body part found
          console.log("Body mainly contains code block, replacing matched section.");
          newBody = body.replace(JSON_CODE_BLOCK_REGEX, newCodeBlock);
          // If the original body had leading/trailing whitespace after frontmatter, preserve it?
          // This logic can get complex depending on desired preservation.
          // Let's assume trimming and adding newlines is acceptable.
      } else {
           console.log("Replacing json-table code block within existing body content.");
          newBody = body.replace(JSON_CODE_BLOCK_REGEX, newCodeBlock);
      }
    } else {
      // If no block found, append it cleanly
      console.warn("No json-table code block found in body, appending new one.");
      newBody = (body.trim() ? body.trim() + '\n\n' : '') + newCodeBlock;
    }
    // --- End Code Block Replacement ---

    // Combine frontmatter and updated body, ensure clean formatting
    return newFrontmatterString + newBody.trim() + '\n'; // Add trailing newline for POSIX compatibility
  }
} // End MarkdownFileHandler class