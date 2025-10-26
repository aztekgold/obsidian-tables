// src/suggesters/FileSuggest.ts
import { AbstractInputSuggest, App, TFile } from 'obsidian';

// Renamed class to FileSuggest
export class FileSuggest extends AbstractInputSuggest<TFile> {

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    // Add the setting to control which files to suggest
    private suggestAllFiles: boolean,
    private onSaveCallback: (value: string) => void
  ) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFile[] {
    const lowerCaseQuery = query.toLowerCase();

    // Use getFiles() or getMarkdownFiles() based on the setting
    const allFiles = this.suggestAllFiles
      ? this.app.vault.getFiles() // Get all files if enabled
      : this.app.vault.getMarkdownFiles(); // Otherwise, just get notes

    // Filter the list
    return allFiles.filter(file =>
      file.basename.toLowerCase().includes(lowerCaseQuery) ||
      file.path.toLowerCase().includes(lowerCaseQuery)
    );
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    // Show the full path for clarity
    el.setText(file.path);
    el.addClass('mod-complex');
  }

  selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
    const value = file.path;

    this.setValue(value); // Use the correct method
    this.close();
    this.onSaveCallback(value); // Call the save callback
  }
}