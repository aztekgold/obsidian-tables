// src/renderers/DropdownRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef } from '../types';

import { DropdownMenu } from '../ui/DropdownMenu';

export class DropdownRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement, // This is the <td>
    value: unknown,
    column: ColumnDef,
    onChange: (newValue: unknown) => void
  ): void {
    container.empty();

    // Create wrapper directly in the td
    const wrapper = container.createEl('div', {
      cls: 'json-table-dropdown'
    });

    // Render the current tag
    this.renderTags(wrapper, value, column);

    // Click anywhere on the wrapper to enter edit mode
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderEdit(app, wrapper, value, column, onChange);
    });
  }

  /**
   * Renders the simple tag (display mode)
   */
  private renderDisplay(
    app: App,
    wrapper: HTMLElement,
    value: unknown,
    column: ColumnDef,
    onChange: (newValue: unknown) => void
  ) {
    wrapper.empty();
    wrapper.removeClass('is-editing');
    this.renderTags(wrapper, value, column); // Render the tag without "x"

    // Re-add click listener for entering edit mode
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderEdit(app, wrapper, value, column, onChange);
    });
  }

  /**
   * Renders the tag with "x" button and shows the options popup (edit mode)
   */
  private renderEdit(
    app: App,
    wrapper: HTMLElement,
    value: unknown,
    column: ColumnDef,
    onChange: (newValue: unknown) => void
  ) {
    // Clone wrapper to remove old listeners
    const parent = wrapper.parentNode;
    if (!parent) return;
    const newWrapper = wrapper.cloneNode(false) as HTMLElement;
    parent.replaceChild(newWrapper, wrapper);

    newWrapper.empty();
    newWrapper.addClass('is-editing');

    // Callback for when the tag's "x" is clicked (clears selection)
    const handleRemove = () => {
      value = ''; // Clear value
      onChange(''); // Trigger save
      // Re-render the edit state with empty value
      this.renderEdit(app, newWrapper, '', column, onChange);
    };

    // 1. Render tag with "x" button if value exists
    this.renderTags(newWrapper, value, column, handleRemove);

    // 2. Show the menu with available options
    new DropdownMenu({
      app,
      anchor: newWrapper,
      options: column.constraints?.options || [],
      selectedValues: value ? [String(value)] : [],
      multiSelect: false,
      onSelect: (selectedValue) => {
        value = selectedValue;
        onChange(selectedValue);
      },
      onClose: () => {
        this.renderDisplay(app, newWrapper, value, column, onChange);
      },
      onCreateOption: (newValue) => {
        if (!column.constraints) column.constraints = {};
        if (!column.constraints.options) column.constraints.options = [];
        column.constraints.options.push({ value: newValue, color: 'default' });
        value = newValue;
        onChange(newValue);
      },
    });
  }

  /**
   * Helper function to render the tag inside a wrapper
   * @param wrapper The element to render tag into
   * @param value The current value string
   * @param column The column definition
   * @param onRemove Optional callback for adding "x" button (edit mode)
   */
  private renderTags(
    wrapper: HTMLElement,
    value: unknown,
    column: ColumnDef,
    onRemove?: () => void
  ) {
    const allOptions = column.constraints?.options || [];

    const strValue = value == null ? '' : String(value);
    wrapper.empty();

    // Show empty state if no value
    if (!strValue) {
      if (!onRemove) {
        // Display mode - show placeholder
        wrapper.createEl('span', {
          text: '',
          cls: 'json-table-dropdown-placeholder'
        });
      }
      // Edit mode with no value - don't show anything
      return;
    }

    // Find the option for styling
    const option = allOptions.find(opt => opt.value === strValue);

    const tagContainer = wrapper.createEl('span', {
      cls: 'json-table-dropdown-tag'
    });

    if (option && option.color) {
      tagContainer.addClass(`json-table-tag--${option.color}`);
    } else {
      tagContainer.addClass('json-table-tag--default');
    }

    // Add the text
    tagContainer.createEl('span', { text: strValue });

    // If onRemove callback is provided (edit mode), add the "x" button
    if (onRemove) {
      const removeBtn = tagContainer.createEl('span', {
        text: '×',
        cls: 'json-table-multiselect-tag-remove'
      });
      removeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      });
    }
  }

  /**
   * Shows the popup with all available options
   */

}
