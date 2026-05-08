// src/renderers/MultiSelectRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef } from '../types';

import { DropdownMenu } from '../ui/DropdownMenu';

export class MultiSelectRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement, // This is the <td>
    value: any, // e.g., "apple,pear,orange"
    column: ColumnDef,
    onChange: (newValue: any) => void
  ): void {
    container.empty();

    // Create wrapper directly in the td
    const wrapper = container.createEl('div', {
      cls: 'json-table-multiselect'
    });

    // Render the current tags
    this.renderTags(wrapper, value, column);

    // Click anywhere on the wrapper to enter edit mode
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderEdit(app, wrapper, value, column, onChange);
    });
  }

  /**
   * Renders the simple tags (display mode)
   */
  private renderDisplay(
    app: App,
    wrapper: HTMLElement,
    value: any,
    column: ColumnDef,
    onChange: (newValue: any) => void
  ) {
    wrapper.empty();
    wrapper.removeClass('is-editing');
    this.renderTags(wrapper, value, column); // Render the tags without "x"

    // Re-add click listener for entering edit mode
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderEdit(app, wrapper, value, column, onChange);
    });
  }

  /**
   * Renders the tags with "x" buttons and shows the options popup (edit mode)
   */
  private renderEdit(
    app: App,
    wrapper: HTMLElement,
    value: any,
    column: ColumnDef,
    onChange: (newValue: any) => void
  ) {
    // Clone wrapper to remove old listeners
    const parent = wrapper.parentNode;
    if (!parent) return;
    const newWrapper = wrapper.cloneNode(false) as HTMLElement;
    parent.replaceChild(newWrapper, wrapper);

    newWrapper.empty();
    newWrapper.addClass('is-editing');

    // Callback for when a tag's "x" is clicked
    const handleRemove = (valueToRemove: string) => {
      const selected = this.getValues(value);
      const newSelected = selected.filter(val => val !== valueToRemove);
      const newValue = newSelected.join(',');
      value = newValue;
      onChange(newValue); // Trigger save
      // Re-render the edit state
      this.renderEdit(app, newWrapper, newValue, column, onChange);
    };

    // 1. Render tags with "x" buttons
    this.renderTags(newWrapper, value, column, handleRemove);

    // 2. Show the menu with available options
    new DropdownMenu({
      app,
      anchor: newWrapper,
      options: column.constraints?.options || [],
      selectedValues: this.getValues(value),
      multiSelect: true,
      onSelect: (clickedValue) => {
        const selected = this.getValues(value);
        let newSelected: string[];

        if (selected.includes(clickedValue)) {
          newSelected = selected.filter(v => v !== clickedValue);
        } else {
          newSelected = [...selected, clickedValue];
        }

        const newValue = newSelected.join(',');
        value = newValue;
        onChange(newValue);

        this.renderTags(newWrapper, value, column, handleRemove);
      },
      onClose: () => {
        this.renderDisplay(app, newWrapper, value, column, onChange);
      },
      onCreateOption: (newValue) => {
        if (!column.constraints) column.constraints = {};
        if (!column.constraints.options) column.constraints.options = [];
        column.constraints.options.push({ value: newValue, color: 'default' });
        const selected = this.getValues(value);
        const combined = [...selected, newValue].join(',');
        value = combined;
        onChange(combined);
        this.renderTags(newWrapper, value, column, handleRemove);
      },
    });
  }

  /**
   * Helper to get values array from the comma-separated string
   */
  private getValues(value: any): string[] {
    if (typeof value !== 'string') return [];
    return value ? value.split(',').filter(Boolean) : [];
  }

  /**
   * Helper function to render the tags inside a wrapper
   * @param wrapper The element to render tags into
   * @param value The current comma-separated value string
   * @param column The column definition
   * @param onRemove Optional callback for adding "x" buttons (edit mode)
   */
  private renderTags(
    wrapper: HTMLElement,
    value: any,
    column: ColumnDef,
    onRemove?: (valueToRemove: string) => void
  ) {
    const allOptions = column.constraints?.options || [];
    const selectedValues = this.getValues(value);

    wrapper.empty();

    // Show empty state if no values
    if (selectedValues.length === 0) {
      if (!onRemove) {
        // Display mode - show placeholder
        wrapper.createEl('span', {
          text: '',
          cls: 'json-table-dropdown-placeholder'
        });
      }
      // Edit mode with no values - don't show anything
      return;
    }

    selectedValues.forEach(val => {
      const option = allOptions.find(opt => opt.value === val);

      const tagContainer = wrapper.createEl('span', {
        cls: 'json-table-dropdown-tag'
      });

      if (option && option.color) {
        tagContainer.addClass(`json-table-tag--${option.color}`);
      } else {
        tagContainer.addClass('json-table-tag--default');
      }

      // Add the text
      tagContainer.createEl('span', { text: val });

      // If onRemove callback is provided (edit mode), add the "x" button
      if (onRemove) {
        const removeBtn = tagContainer.createEl('span', {
          text: '×',
          cls: 'json-table-multiselect-tag-remove'
        });
        removeBtn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(val);
        });
      }
    });
  }
}
