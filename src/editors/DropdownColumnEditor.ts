// src/editors/DropdownColumnEditor.ts
import { IColumnEditor } from './IColumnEditor';
import { ColumnDef, TableData, DropdownOption, SelectTypeOptions } from '../types'; // Import SelectTypeOptions
import { JsonTableView } from '../JsonTableView';
import { TFile } from 'obsidian';

export class DropdownColumnEditor implements IColumnEditor {

  public render(
    container: HTMLElement,
    column: ColumnDef,
    data: TableData,
    view: JsonTableView
  ): void {

    container.createEl('label', {
      text: 'Options',
      cls: 'json-table-popup-label'
    });

    // --- Ensure typeOptions and options array exist ---
    column.typeOptions = column.typeOptions || {}; // Ensure typeOptions exists
    const typeOpts = column.typeOptions as SelectTypeOptions; // Assert type
    typeOpts.options = typeOpts.options || []; // Ensure options array exists
    // --- End Initialization ---

    // Container to hold the list of options
    const optionsListContainer = container.createEl('div', { cls: 'json-table-edit-options-list' });

    // --- Helper function to render the list ---
    const renderOptionsList = () => {
      optionsListContainer.empty();

      // Read options directly from the now-guaranteed typeOpts.options
      typeOpts.options!.forEach((option, index) => {
        const optionRow = optionsListContainer.createEl('div', { cls: 'json-table-edit-option' });

        // The colored tag
        const tag = optionRow.createEl('span', {
          text: option.value,
          cls: 'json-table-dropdown-tag'
        });
        if (option.style) {
          tag.addClass(`dropdown-tag--${option.style}`);
        }

        // The delete button
        const deleteOptBtn = optionRow.createEl('button', {
          text: '×',
          cls: 'json-table-edit-option-delete',
          attr: { 'title': 'Delete option' }
        });

        deleteOptBtn.addEventListener('mousedown', e => e.preventDefault());

        deleteOptBtn.addEventListener('click', async () => {
          // Get the option value before deleting
          const deletedValue = option.value;
          
          // Remove the option
          typeOpts.options!.splice(index, 1);
          
          // Clean up any cells that have this deleted value
          // For dropdown: clear the cell value
          // For multiselect: remove the value from comma-separated list
          data.rows.forEach(row => {
            row.forEach(cell => {
              if (cell.column === column.id && cell.value) {
                if (column.type === 'dropdown') {
                  // Clear cell if it matches deleted value
                  if (cell.value === deletedValue) {
                    cell.value = '';
                  }
                } else if (column.type === 'multiselect') {
                  // Remove from comma-separated list and filter out empty values
                  const values = cell.value
                    .split(',')
                    .map(v => v.trim())
                    .filter(v => v && v !== deletedValue);
                  cell.value = values.join(',');
                }
              }
            });
          });
          
          await view.saveTableData(data);
          
          // Re-render using existing renderer to preserve scroll position
          const renderer = view.getRenderer();
          if (renderer) {
              renderer.render(); // This preserves scroll position
          } else {
              // Fallback: full re-render if no renderer exists
              const currentPath = view.getFilePath();
              if (currentPath) {
                  const file = view.app.vault.getAbstractFileByPath(currentPath);
                  if (file instanceof TFile) {
                      await view.renderContent(file);
                  }
              }
          }
          
          renderOptionsList();
        });
      });
    };
    // --- End helper function ---

    renderOptionsList(); // Initial render of the list

    // --- UI for adding a new option ---
    const addContainer = container.createEl('div', { cls: 'json-table-edit-option-add' });
    const newOptionInput = addContainer.createEl('input', {
      type: 'text',
      placeholder: 'Add new option',
      cls: 'json-table-edit-input'
    });
    const addOptionBtn = addContainer.createEl('button', {
      text: 'Add',
      cls: 'json-table-add-row'
    });

    // Action to add the new option
    const addOptionAction = async () => {
      const value = newOptionInput.value.trim();
      if (!value) return;

      // --- Check options within typeOptions ---
      if (typeOpts.options!.find(o => o.value === value)) return;

      typeOpts.options!.push({ value: value, style: 'default' }); // Add to typeOptions.options
      // --- End Modification ---
      newOptionInput.value = ''; // Clear input

      await view.saveTableData(data); // Save the entire TableData
      renderOptionsList(); // Refresh the list
      // Re-render main table if needed to reflect new option availability? Maybe not critical here.
      // await view.renderContent(view.leaf.view.file);
    };

    addOptionBtn.addEventListener('mousedown', e => e.preventDefault());
    addOptionBtn.addEventListener('click', addOptionAction);

    newOptionInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOptionAction();
      }
    });
  }
} // End DropdownColumnEditor class