// src/renderers/MultiSelectRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef, DropdownOption, SelectTypeOptions } from '../types';

export class MultiSelectRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement, // This is the <td>
    value: string, // e.g., "apple,pear,orange"
    column: ColumnDef,
    onChange: (newValue: string) => void
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
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
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
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
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

    // 2. Show the popup with available options
    const popup = this.showDropdownPopup(
      newWrapper,
      value,
      column,
      (valueToAdd) => {
        const selected = this.getValues(value);
        
        // For multi-select, only add if not already present
        if (selected.includes(valueToAdd)) {
          // Already selected - do nothing (use "×" button to remove)
          return;
        }
        
        // Add the new value
        selected.push(valueToAdd);
        const newValue = selected.join(',');
        value = newValue;
        onChange(newValue);
        
        // Re-render the edit state
        this.renderEdit(app, newWrapper, value, column, onChange);
      }
    );

    // 3. Set up the "click outside" listener to close edit mode
    const clickOutside = (e: MouseEvent) => {
      if (
        !newWrapper.contains(e.target as Node) &&
        !popup.contains(e.target as Node)
      ) {
        document.removeEventListener('click', clickOutside, true);
        popup.remove();
        // Go back to display mode
        this.renderDisplay(app, newWrapper, value, column, onChange);
      }
    };

    // Use timeout (0ms) and capture phase
    setTimeout(() => {
      document.addEventListener('click', clickOutside, true);
    }, 0);
  }

  /**
   * Helper to get values array from the comma-separated string
   */
  private getValues(value: string): string[] {
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
    value: string,
    column: ColumnDef,
    onRemove?: (valueToRemove: string) => void
  ) {
    const typeOpts = column.typeOptions as SelectTypeOptions | undefined;
    const allOptions = typeOpts?.options || [];
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

      // Apply style based on definition or default
      if (option && option.style) {
        tagContainer.addClass(`dropdown-tag--${option.style}`);
      } else {
        tagContainer.addClass('dropdown-tag--default');
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

  /**
   * Shows the popup with all available options
   */
  private showDropdownPopup(
    wrapper: HTMLElement,
    currentValue: string,
    column: ColumnDef,
    onSelect: (value: string) => void
  ): HTMLElement {
    const typeOpts = column.typeOptions as SelectTypeOptions | undefined;
    const allOptions = typeOpts?.options || [];

    // Remove existing popup first
    const existingPopup = document.body.querySelector('.json-table-dropdown-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.body.createEl('div', {
      cls: 'json-table-popup json-table-dropdown-popup'
    });

    // Positioning - must be dynamic based on cell position
    const rect = wrapper.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 4}px`;
    popup.style.left = `${rect.left}px`;
    popup.style.minWidth = `${rect.width}px`;

    const selected = this.getValues(currentValue);

    // Show all options
    if (allOptions.length > 0) {
      allOptions.forEach(option => {
        const optionEl = popup.createEl('div', {
          cls: 'json-table-dropdown-option'
        });

        const tag = optionEl.createEl('span', {
          text: option.value,
          cls: 'json-table-dropdown-tag'
        });
        if (option.style) {
          tag.addClass(`dropdown-tag--${option.style}`);
        }


        // Click selects the option (if not already selected)
        optionEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onSelect(option.value);
        });
      });
    } else {
      popup.createEl('div', {
        text: 'No options defined',
        cls: 'json-table-dropdown-option is-disabled'
      });
    }

    return popup;
  }
}
