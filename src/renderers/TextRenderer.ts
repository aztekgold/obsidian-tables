import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { AgentableRow, ColumnDef } from '../types';

export class TextRenderer implements ICellRenderer {
  public render(
    app: App,
    container: HTMLElement,
    value: unknown,
    column: ColumnDef,
    onChange: (newValue: unknown) => void,
    row: AgentableRow,
    columns: ColumnDef[]
  ): void {
    const isWrapped = column.constraints?.wrap || false;

    // Ensure value is a string for the span
    const stringValue = value === null || value === undefined ? "" : String(value);

    // The container is already a flexbox with align-items: center (from .json-table-cell-content)
    // We just need a span inside it to hold the text.

    const span = container.createEl('span', {
      cls: 'json-table-text-span'
    });

    if (isWrapped) {
      span.addClass('is-wrapped');
    }

    // Set initial text
    span.setText(stringValue);

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
      span.scrollLeft = 0; // Reset scroll position to beginning
      const newValue = span.innerText; // innerText preserves newlines
      if (newValue !== stringValue) {
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
        span.setText(stringValue);
        span.blur();
      }
    });
  }
}