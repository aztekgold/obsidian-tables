import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef } from '../types';

export class TextRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement,
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
  ): void {
    
    // Create input directly in the cell (no wrapper)
    const input = container.createEl('input', {
      type: 'text',
      value: value,
      cls: 'json-table-input',
      title: value // Show full value on hover
    });

    // Save on blur or Enter key
    input.addEventListener('blur', () => onChange(input.value));
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  }
}