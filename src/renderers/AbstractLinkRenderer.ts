import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { AgentableRow, ColumnDef } from '../types';

export abstract class AbstractLinkRenderer implements ICellRenderer {
  protected abstract buildLink(displayEl: HTMLElement, val: string): void;

  public render(
    app: App,
    container: HTMLElement,
    value: unknown,
    column: ColumnDef,
    onChange: (newValue: unknown) => void,
    row: AgentableRow,
    columns: ColumnDef[]
  ): void {
    container.empty();

    const stringValue = value == null ? '' : String(value);
    let currentValue = stringValue;

    const displayEl = container.createDiv({ cls: 'json-table-text-span' });
    const renderDisplay = (val: string) => {
      displayEl.empty();
      if (val) this.buildLink(displayEl, val);
    };
    renderDisplay(stringValue);

    const span = container.createEl('span', { cls: 'json-table-text-span json-table-is-hidden' });
    span.contentEditable = 'true';

    const startEdit = () => {
      displayEl.addClass('json-table-is-hidden');
      span.removeClass('json-table-is-hidden');
      span.setText(currentValue);
      setTimeout(() => {
        span.focus();
        const range = document.createRange();
        range.selectNodeContents(span);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }, 0);
    };

    const endEdit = (save: boolean) => {
      const newValue = save ? span.innerText.trim() : currentValue;
      if (save && newValue !== currentValue) {
        currentValue = newValue;
        onChange(newValue);
      }
      span.addClass('json-table-is-hidden');
      displayEl.removeClass('json-table-is-hidden');
      renderDisplay(currentValue);
    };

    displayEl.addEventListener('click', () => startEdit());
    container.addEventListener('click', (e) => {
      if (e.target === container) startEdit();
    });

    span.addEventListener('blur', () => endEdit(true));
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); endEdit(false); }
    });
  }
}
