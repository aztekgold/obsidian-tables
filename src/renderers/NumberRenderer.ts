// src/renderers/NumberRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef } from '../types';

export class NumberRenderer implements ICellRenderer {
    public render(
        app: App,
        container: HTMLElement,
        value: any,
        column: ColumnDef,
        onChange: (newValue: any) => void
    ): void {
        container.empty();

        const cellContent = container.createDiv({
            cls: 'json-table-cell-content json-table-number-cell'
        });

        const input = cellContent.createEl('input', {
            type: 'number',
            cls: 'json-table-input json-table-number-input',
            value: value === null || value === undefined ? '' : String(value)
        });

        // Event Handlers
        input.addEventListener('blur', () => {
            const val = input.value;
            if (val === '') {
                onChange(null);
            } else {
                const num = Number(val);
                if (!isNaN(num)) {
                    onChange(num);
                } else {
                    onChange(val); // Fallback to string if somehow NaN
                }
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                input.value = value === null || value === undefined ? '' : String(value);
                input.blur();
            }
        });

        // Prevent click propagation to avoid triggering row/cell clicks if any
        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}
