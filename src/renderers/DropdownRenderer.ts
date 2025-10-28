// src/renderers/DropdownRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef, DropdownOption, SelectTypeOptions } from '../types';

export class DropdownRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement, // This is the <td>
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
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
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
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

    // Callback for when the tag's "x" is clicked (clears selection)
    const handleRemove = () => {
      value = ''; // Clear value
      onChange(''); // Trigger save
      // Re-render the edit state with empty value
      this.renderEdit(app, newWrapper, '', column, onChange);
    };

    // 1. Render tag with "x" button if value exists
    this.renderTags(newWrapper, value, column, handleRemove);

    // 2. Show the popup with available options
    const popup = this.showDropdownPopup(
      newWrapper,
      value,
      column,
      (selectedValue) => {
        // For dropdown (single select), clicking replaces the current value
        value = selectedValue;
        onChange(selectedValue); // Trigger save
        // Re-render the edit state with new value
        this.renderEdit(app, newWrapper, selectedValue, column, onChange);
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
   * Helper function to render the tag inside a wrapper
   * @param wrapper The element to render tag into
   * @param value The current value string
   * @param column The column definition
   * @param onRemove Optional callback for adding "x" button (edit mode)
   */
  private renderTags(
    wrapper: HTMLElement,
    value: string,
    column: ColumnDef,
    onRemove?: () => void
  ) {
    const typeOpts = column.typeOptions as SelectTypeOptions | undefined;
    const allOptions = typeOpts?.options || [];

    wrapper.empty();

    // Show empty state if no value
    if (!value) {
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
    const option = allOptions.find(opt => opt.value === value);

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
    tagContainer.createEl('span', { text: value });

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

    // Positioning using CSS custom properties
    const rect = wrapper.getBoundingClientRect();
    popup.style.setProperty('--popup-top', `${rect.bottom + 4}px`);
    popup.style.setProperty('--popup-left', `${rect.left}px`);
    popup.style.setProperty('--popup-min-width', `${rect.width}px`);

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


        // Click selects/replaces the option
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
