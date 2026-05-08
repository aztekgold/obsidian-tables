import { App, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { TableData, AGENTABLE_VERSION } from '../types';
import { ITableFileHandler } from './ITableFileHandler';
import { createDefaultView } from '../utils/fileUtils';
import { isOldFormat, migrateToAgentable, ensureViewsValid } from '../utils/migrateUtils';

const CODE_BLOCK_START = '```json-table';
const CODE_BLOCK_END = '```';
const JSON_CODE_BLOCK_REGEX = new RegExp(
  `${CODE_BLOCK_START}\\s*\\n?([\\s\\S]*?)\\n?\\s*${CODE_BLOCK_END}`
);
const FRONTMATTER_PLUGIN_KEY = 'json-table-plugin';
const FRONTMATTER_LINKS_KEY = 'table-links';

export class MarkdownFileHandler implements ITableFileHandler {

  constructor(private app: App) {}

  async read(file: TFile): Promise<TableData> {
    const content = await this.app.vault.read(file);

    let fileCache = this.app.metadataCache.getFileCache(file);
    let frontmatter = fileCache?.frontmatter;

    if (!frontmatter) {
      const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
      if (fmMatch) {
        try { frontmatter = parseYaml(fmMatch[1]); } catch { /* ignore */ }
      }
    }

    if (!frontmatter || frontmatter[FRONTMATTER_PLUGIN_KEY] !== true) {
      throw new Error(`File ${file.path} is not a valid table file. Missing '${FRONTMATTER_PLUGIN_KEY}: true' in frontmatter.`);
    }

    const match = content.match(JSON_CODE_BLOCK_REGEX);
    if (!match || match[1] === undefined || match[1] === null) {
      if (!content.includes(CODE_BLOCK_START)) {
        throw new Error(`Could not find '${CODE_BLOCK_START}' code block start in ${file.path}`);
      }
      throw new Error(`Could not extract content from '${CODE_BLOCK_START}' code block in ${file.path}.`);
    }

    const jsonContent = match[1].trim();
    if (!jsonContent) {
      return {
        version: AGENTABLE_VERSION,
        metadata: { title: file.basename },
        columns: [],
        rows: [],
        views: [createDefaultView()],
      };
    }

    try {
      const raw = JSON.parse(jsonContent);
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) {
        throw new Error('Invalid table JSON structure: missing columns or rows.');
      }

      let data: TableData;
      if (isOldFormat(raw)) {
        data = migrateToAgentable(raw, file.name);
      } else {
        data = raw as TableData;
      }

      ensureViewsValid(data);
      return data;
    } catch (e) {
      console.error(`Error parsing embedded JSON in ${file.path}:`, e);
      throw new Error(`Invalid embedded JSON: ${(e as Error).message}`);
    }
  }

  async save(file: TFile, data: TableData): Promise<void> {
    try {
      ensureViewsValid(data);
      const jsonString = JSON.stringify(data, null, 2);
      const linkPaths = this.extractLinkPaths(data);
      await this.app.vault.process(file, (existingContent) =>
        this.updateMarkdownContent(existingContent, jsonString, linkPaths)
      );
    } catch (e) {
      console.error(`Error saving Markdown file ${file.path}:`, e);
      throw new Error(`Failed to save Markdown file: ${(e as Error).message}`);
    }
  }

  private extractLinkPaths(data: TableData): string[] {
    const linkPaths = new Set<string>();
    const linkColumnIds = data.columns
      .filter(col => col.type === 'link' || col.type === 'wikilink' || col.type === 'notelink')
      .map(col => col.id);

    if (linkColumnIds.length === 0) return [];

    data.rows.forEach(row => {
      linkColumnIds.forEach(colId => {
        const val = row.cells[colId];
        if (val) linkPaths.add(String(val));
      });
    });

    return Array.from(linkPaths);
  }

  private updateMarkdownContent(existingContent: string, newJsonString: string, linkPaths: string[]): string {
    let frontmatter: Record<string, unknown> = {};
    let body = existingContent;

    if (existingContent.startsWith('---')) {
      const fmMatch = existingContent.match(/^---\s*([\s\S]*?)\s*---/);
      if (fmMatch && fmMatch[1]) {
        try {
          frontmatter = parseYaml(fmMatch[1]) || {};
          body = existingContent.substring(fmMatch[0].length).trimStart();
        } catch {
          frontmatter = {};
          body = existingContent;
        }
      } else {
        body = existingContent;
      }
    }

    frontmatter[FRONTMATTER_PLUGIN_KEY] = true;
    frontmatter[FRONTMATTER_LINKS_KEY] = linkPaths.map(path => `[[${path}]]`);

    const newFrontmatterString = `---\n${stringifyYaml(frontmatter)}---\n`;
    const newCodeBlock = `${CODE_BLOCK_START}\n${newJsonString}\n${CODE_BLOCK_END}`;

    let newBody = body;
    if (body.match(JSON_CODE_BLOCK_REGEX)) {
      newBody = body.replace(JSON_CODE_BLOCK_REGEX, newCodeBlock);
    } else {
      newBody = (body.trim() ? body.trim() + '\n\n' : '') + newCodeBlock;
    }

    return newFrontmatterString + newBody.trim() + '\n';
  }
}
