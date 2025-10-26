// src/editors/DateColumnEditor.ts
import { IColumnEditor } from './IColumnEditor';
import { ColumnDef, TableData, DateFormat, DateTypeOptions } from '../types'; // Import DateTypeOptions
import { JsonTableView } from '../JsonTableView';
import { TFile } from 'obsidian';

export class DateColumnEditor implements IColumnEditor {

  // Define the available formats with user-facing labels
  private availableFormats: { label: string; format: DateFormat }[] = [
    { label: 'Full Date', format: 'MMMM D, YYYY' },
    { label: 'Short Date', format: 'MMM D' },
    { label: 'Day/Month/Year', format: 'DD/MM/YYYY' },
    { label: 'Month/Day/Year', format: 'MM/DD/YYYY' },
    { label: 'Year/Month/Day', format: 'YYYY/MM/DD' },
  ];
  // Define a default format to use if none is set
  private defaultFormat: DateFormat = 'YYYY/MM/DD';

  public render(
    container: HTMLElement,
    column: ColumnDef,
    data: TableData,
    view: JsonTableView
  ): void {

    container.createEl('label', {
      cls: 'json-table-popup-label',
      text: 'Date Format:'
    });

    const select = container.createEl('select', { cls: 'json-table-popup-select' });

    // --- Read current format from typeOptions ---
    const currentTypeOpts = column.typeOptions as DateTypeOptions | undefined;
    const currentFormat = currentTypeOpts?.dateFormat || this.defaultFormat;
    // --- End Read ---

    // Populate the select dropdown
    this.availableFormats.forEach(formatInfo => {
      const option = select.createEl('option', {
        text: formatInfo.label,       // Display label
        value: formatInfo.format      // Store format string
      });
      // Select the current format
      if (currentFormat === formatInfo.format) {
        option.selected = true;
      }
    });

    // Save when format changes
    select.addEventListener('change', async () => {
      const newFormat = select.value as DateFormat;

      // --- Write new format to typeOptions ---
      // Ensure typeOptions object exists
      column.typeOptions = column.typeOptions || {};
      const newTypeOpts = column.typeOptions as DateTypeOptions; // Assert type after ensuring existence

      // Only save and re-render if the format actually changed
      if (newTypeOpts.dateFormat !== newFormat) {
          newTypeOpts.dateFormat = newFormat; // Update the format
          await view.saveTableData(data); // Save the updated data
          // Re-render the whole table to update display format in cells
          const currentPath = view.getFilePath(); // Use the getter
                          if (currentPath) {
                              const file = view.app.vault.getAbstractFileByPath(currentPath);
                              if (file instanceof TFile) {
                                  await view.renderContent(file); // Call renderContent
                              } else {
                                  console.error("Cannot re-render, file not found at path:", currentPath);
                              }
                          } else {
                              console.error("Cannot re-render, view has no file path set.");
                          }
      }
      // --- End Write ---
    });
  }
}