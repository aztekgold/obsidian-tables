// src/renderers/NumberRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef } from '../types';

export class NumberRenderer implements ICellRenderer {
    public render(
        app: App,
        container: HTMLElement,
        value: unknown,
        column: ColumnDef,
        onChange: (newValue: unknown) => void
    ): void {
        container.empty();

        // Ensure value is a string for display in the span
        const stringValue = value === null || value === undefined ? "" : String(value);

        const span = container.createEl('span', {
            cls: 'json-table-text-span json-table-number-span'
        });

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
            const textValue = span.innerText.trim();

            if (textValue === '') {
                if (value !== null) {
                    onChange(null);
                }
                return;
            }

            const numValue = parseFloat(textValue);

            if (!isNaN(numValue)) {
                // Only trigger onChange if the numeric value actually changed
                if (numValue !== value) {
                    onChange(numValue);
                }
            } else {
                // Fallback or keep as string if user entered non-numeric text?
                // Your requirement was "understand we may need to parse as float"
                // If it's not a valid number, we'll save it as string or keep previous?
                // Let's save as string if they typed something else, or null if empty.
                if (textValue !== String(value)) {
                    onChange(textValue);
                }
            }
        });

        span.addEventListener('keydown', (e) => {
            // Allow navigation and editing keys
            const allowedKeys = [
                'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'
            ];

            // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z (and cmd versions)
            if (e.ctrlKey || e.metaKey) {
                return;
            }

            // Enter key: Save and blur
            if (e.key === 'Enter') {
                e.preventDefault();
                span.blur();
                return;
            }

            // Escape: Revert
            if (e.key === 'Escape') {
                e.preventDefault();
                span.setText(stringValue);
                span.blur();
                return;
            }

            if (allowedKeys.includes(e.key)) {
                return;
            }

            // Allow numbers
            if (/^[0-9]$/.test(e.key)) {
                return;
            }

            // Allow decimal point and negative sign (basic validation)
            if (e.key === '.' || e.key === '-') {
                // Optional: You could check if one already exists here, 
                // but standard input behavior often allows typing it and just being invalid later.
                // For a stricter UX, we can check:
                const currentText = span.innerText;
                if (e.key === '.' && currentText.includes('.')) {
                    e.preventDefault();
                }
                if (e.key === '-' && span.innerText.length > 0 && window.getSelection()?.anchorOffset !== 0) {
                    // Only allow minus at start? This is tricky with selection/caret position.
                    // For now, let's just allow it basically and rely on parser or simple restriction.
                    // If we want to be strict: minus only at start.
                }
                return;
            }

            // Block everything else
            e.preventDefault();
        });

        // Handle Paste: Only allow if clipboard content is numeric
        span.addEventListener('paste', (e) => {
            e.preventDefault();
            const clipboardData = e.clipboardData;
            if (!clipboardData) return;
            const pastedData = clipboardData.getData('text');

            // Simple check: is it a valid number part?
            if (/^[0-9.-]+$/.test(pastedData) && !isNaN(parseFloat(pastedData))) {
                const selection = window.getSelection();
                if (!selection || !selection.rangeCount) return;

                const range = selection.getRangeAt(0);
                range.deleteContents();

                const textNode = document.createTextNode(pastedData);
                range.insertNode(textNode);

                // Move cursor to end of inserted text
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });
    }
}
