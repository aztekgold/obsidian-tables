// src/renderers/FunctionRenderer.ts
import { App } from 'obsidian';
import { format } from 'date-fns';
import { ICellRenderer } from './ICellRenderer';
import { AgentableRow, ColumnDef } from '../types';
import { FormulaHandler } from '../FormulaHandler';

// Mirrors Notion: a formula that resolves to a date is always shown as a
// proper formatted date, automatically - no per-column format setting, no
// toggle. The comparable raw timestamp (what {{ dateCol }} > today() and
// Sort/Filter actually operate on) never changes; this only affects display.
const FORMULA_DATE_DISPLAY_FORMAT = 'yyyy/MM/dd';

function formatFormulaValue(value: unknown, resultKind: string | undefined): string {
  if (value == null || value === '') return '';
  if (resultKind === 'date') {
    const timestamp = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!isNaN(timestamp)) {
      try {
        return format(new Date(timestamp), FORMULA_DATE_DISPLAY_FORMAT);
      } catch {
        // Fall through to the raw value if date-fns can't format it.
      }
    }
  }
  return String(value);
}

// Read-only: Function cells are computed from other columns in the same row,
// so unlike every other renderer this one never calls onChange - the cell
// itself isn't directly editable, only the formula (via the column's
// "Change type"/properties menu) is.
//
// Takes FormulaHandler via its own constructor rather than through the
// shared ICellRenderer interface, since it's the only renderer that needs
// it. DivTableRenderer's render() already calls formulaHandler.recomputeAll()
// before any cell renders, writing the computed value into row.cells and
// recording which cells errored - so this renderer just reads that
// already-done work instead of re-parsing and re-evaluating the formula
// itself on every cell, every render.
export class FunctionRenderer implements ICellRenderer {
  constructor(private formulaHandler: FormulaHandler) {}

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

    if (this.formulaHandler.hasError(row.id, column.id)) {
      container.createEl('span', {
        cls: 'json-table-text-span json-table-formula-span json-table-formula-error',
        text: '—',
      });
    } else {
      container.createEl('span', {
        cls: 'json-table-text-span json-table-formula-span',
        text: formatFormulaValue(value, column.constraints?.formulaResultKind),
      });
    }
  }
}
