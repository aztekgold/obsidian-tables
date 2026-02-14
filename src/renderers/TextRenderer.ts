import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef, TextTypeOptions } from '../types';

export class TextRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement,
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
  ): void {
    const typeOpts = column.typeOptions as TextTypeOptions | undefined;
    const isWrapped = typeOpts?.wrap || false;

    // The container is already a flexbox with align-items: center (from .json-table-cell-content)
    // We just need a span inside it to hold the text.

    const span = container.createEl('span', {
      cls: 'json-table-text-span'
    });

    if (isWrapped) {
      span.addClass('is-wrapped');
    }

    // Set initial text
    span.setText(value);

    // Make the span editable
    span.contentEditable = 'true';

    // Ensure clicking the cell padding focuses the span
    container.onclick = (e) => {
      if (e.target === container) {
        e.preventDefault();
        span.focus();
      }
    };

    // Event Handlers

    // Save on blur
    span.addEventListener('blur', () => {
      const newValue = span.innerText; // innerText preserves newlines
      if (newValue !== value) {
        onChange(newValue);
      }
    });

    span.addEventListener('keydown', (e) => {
      // Enter key behavior
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter: Allow default behavior (newline)
        } else {
          // Enter only: Save and blur
          e.preventDefault();
          span.blur();
        }
      }

      // Escape: Revert
      if (e.key === 'Escape') {
        e.preventDefault();
        span.setText(value);
        span.blur();
      }
    });
  }
}