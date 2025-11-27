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

    const colors = ['default', 'accent', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'pink'];
    let editingOptionIndex: number | null = null;

    // --- Helper function to render the list ---
    const renderOptionsList = () => {
      optionsListContainer.empty();

      // Read options directly from the now-guaranteed typeOpts.options
      typeOpts.options!.forEach((option, index) => {
        const optionRow = optionsListContainer.createEl('div', { cls: 'json-table-edit-option' });

        // Wrapper for content
        const contentWrapper = optionRow.createDiv({ cls: 'json-table-edit-option-content' });
        contentWrapper.style.display = 'flex';
        contentWrapper.style.flexDirection = 'column';
        contentWrapper.style.width = '100%';
        contentWrapper.style.gap = '4px';

        const isEditing = editingOptionIndex === index;

        if (isEditing) {
          // --- EDIT STATE ---

          // Row 1: Input and Delete
          const topRow = contentWrapper.createDiv();
          topRow.style.display = 'flex';
          topRow.style.alignItems = 'center';
          topRow.style.gap = '8px';
          topRow.style.width = '100%';

          // Editable Input
          const input = topRow.createEl('input', {
            type: 'text',
            value: option.value,
            cls: 'json-table-edit-input'
          });

          // Focus input immediately
          setTimeout(() => input.focus(), 0);

          // Handle Rename
          const handleRename = async () => {
            const newValue = input.value.trim();
            if (!newValue || newValue === option.value) {
              // Just close edit mode if no change
              editingOptionIndex = null;
              renderOptionsList();
              return;
            }

            // Check for duplicates
            if (typeOpts.options!.find((o, i) => i !== index && o.value === newValue)) {
              // Revert and close
              editingOptionIndex = null;
              renderOptionsList();
              return;
            }

            const oldValue = option.value;
            option.value = newValue;

            // Update all cells
            data.rows.forEach(row => {
              row.forEach(cell => {
                if (cell.column === column.id && cell.value) {
                  if (column.type === 'dropdown') {
                    if (cell.value === oldValue) cell.value = newValue;
                  } else if (column.type === 'multiselect') {
                    const values = cell.value.split(',').map(v => v.trim());
                    const newValues = values.map(v => v === oldValue ? newValue : v);
                    cell.value = newValues.join(',');
                  }
                }
              });
            });

            await view.saveTableData(data);
            view.getRenderer()?.render();

            editingOptionIndex = null;
            renderOptionsList();
          };

          input.addEventListener('blur', () => {
            // Delay slightly to allow clicks on color picker or delete button to register
            setTimeout(() => {
              // Only save/close if we are still editing this index (and didn't click something else that handled it)
              // Actually, blur is tricky with the color picker buttons. 
              // Let's rely on Enter key or clicking outside/another option to close.
              // But we need a way to save.
              handleRename();
            }, 150);
          });

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleRename();
            } else if (e.key === 'Escape') {
              editingOptionIndex = null;
              renderOptionsList();
            }
          });

          // The delete button
          const deleteOptBtn = topRow.createEl('button', {
            text: '×',
            cls: 'json-table-edit-option-delete',
            attr: { 'title': 'Delete option' }
          });

          deleteOptBtn.addEventListener('mousedown', e => e.preventDefault()); // Prevent blur
          deleteOptBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const deletedValue = option.value;
            typeOpts.options!.splice(index, 1);

            data.rows.forEach(row => {
              row.forEach(cell => {
                if (cell.column === column.id && cell.value) {
                  if (column.type === 'dropdown') {
                    if (cell.value === deletedValue) cell.value = '';
                  } else if (column.type === 'multiselect') {
                    const values = cell.value.split(',').map(v => v.trim()).filter(v => v && v !== deletedValue);
                    cell.value = values.join(',');
                  }
                }
              });
            });

            await view.saveTableData(data);
            view.getRenderer()?.render();
            editingOptionIndex = null;
            renderOptionsList();
          });

          // Row 2: Color Picker
          const colorPicker = contentWrapper.createDiv({ cls: 'json-table-color-picker' });

          colors.forEach(color => {
            const circle = colorPicker.createDiv({
              cls: `json-table-color-circle color-circle--${color}`
            });

            if ((option.style || 'default') === color) {
              circle.addClass('is-selected');
            }

            circle.addEventListener('mousedown', e => e.preventDefault()); // Prevent input blur
            circle.addEventListener('click', async (e) => {
              e.stopPropagation();
              option.style = color;
              await view.saveTableData(data);
              view.getRenderer()?.render();
              // Keep editing open to allow further changes or renaming
              renderOptionsList();
            });
          });

        } else {
          // --- DISPLAY STATE ---
          const displayRow = contentWrapper.createDiv();
          displayRow.style.display = 'flex';
          displayRow.style.alignItems = 'center';
          displayRow.style.justifyContent = 'space-between';
          displayRow.style.width = '100%';
          displayRow.style.cursor = 'pointer';

          // The colored tag
          const tag = displayRow.createEl('span', {
            text: option.value,
            cls: 'json-table-dropdown-tag'
          });
          if (option.style) {
            tag.addClass(`dropdown-tag--${option.style}`);
          }

          // Click to edit
          displayRow.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            editingOptionIndex = index;
            renderOptionsList();
          });

          // The delete button (also available in display mode for quick delete)
          const deleteOptBtn = displayRow.createEl('button', {
            text: '×',
            cls: 'json-table-edit-option-delete',
            attr: { 'title': 'Delete option' }
          });

          deleteOptBtn.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation(); // Prevent triggering edit mode on row
          });
          deleteOptBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const deletedValue = option.value;
            typeOpts.options!.splice(index, 1);

            data.rows.forEach(row => {
              row.forEach(cell => {
                if (cell.column === column.id && cell.value) {
                  if (column.type === 'dropdown') {
                    if (cell.value === deletedValue) cell.value = '';
                  } else if (column.type === 'multiselect') {
                    const values = cell.value.split(',').map(v => v.trim()).filter(v => v && v !== deletedValue);
                    cell.value = values.join(',');
                  }
                }
              });
            });

            await view.saveTableData(data);
            view.getRenderer()?.render();
            renderOptionsList();
          });
        }
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