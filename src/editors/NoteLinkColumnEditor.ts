// src/editors/NoteLinkColumnEditor.ts
import { IColumnEditor } from './IColumnEditor';
import { ColumnDef, TableData, NoteLinkTypeOptions } from '../types'; // Import NoteLinkTypeOptions
import { JsonTableView } from '../JsonTableView';
import { TFile } from 'obsidian'; // Ensure TFile is imported if needed elsewhere

export class NoteLinkColumnEditor implements IColumnEditor {

  public render(
    container: HTMLElement,
    column: ColumnDef,
    data: TableData,
    view: JsonTableView
  ): void {

    container.createEl('label', {
      cls: 'json-table-popup-label',
      text: 'Suggest Options:'
    });

    const settingDiv = container.createDiv({ cls: 'json-table-editor-setting' });

    const checkboxId = `suggest-all-${column.id}`;

    const checkbox = settingDiv.createEl('input', {
      type: 'checkbox',
      attr: { id: checkboxId }
    });

    // --- Read initial state from typeOptions ---
    const currentTypeOpts = column.typeOptions as NoteLinkTypeOptions | undefined;
    checkbox.checked = !!currentTypeOpts?.suggestAllFiles; // Use optional chaining and boolean coercion
    // --- End Read ---

    settingDiv.createEl('label', {
      text: 'Suggest all file types (not just notes)',
      attr: { for: checkboxId }
    });

    // Save when checkbox changes
    checkbox.addEventListener('change', async () => {
      // --- Write new value to typeOptions ---
      // Ensure typeOptions exists
      column.typeOptions = column.typeOptions || {};
      // Assert type after ensuring existence
      const newTypeOpts = column.typeOptions as NoteLinkTypeOptions;

      // Update the property
      newTypeOpts.suggestAllFiles = checkbox.checked;

      // Save the updated TableData
      await view.saveTableData(data);
      // No re-render needed for this change
      // --- End Write ---
    });
  }
}