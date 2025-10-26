// src/renderers/CheckboxRenderer.ts

import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef } from '../types';

export class CheckboxRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement,
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
  ): void {
    
    // Create cell content wrapper
    const cellContent = container.createEl('div', { cls: 'json-table-cell-content json-table-cell-checkbox' });

    const input = cellContent.createEl('input', {
      type: 'checkbox',
      cls: 'json-table-checkbox'
    });
    
    // The "value" will be a string like "true" or "false"
    // We check if the string is "true"
    input.checked = value === 'true';

    // On change, call the onChange callback
    input.addEventListener('change', () => {
      // Always save the new value as a string
      onChange(input.checked.toString());
    });
  }
}