import { App } from 'obsidian';
import { AgentableRow, ColumnDef } from '../types';
/**
 * The "contract" that all cell renderers must follow.
 */
export interface ICellRenderer {
  /**
   * Renders the cell's UI inside the provided container.
   * @param app Obsidian App object, needed for things like Note Links.
   * @param container The <td> element to render into.
   * @param value The current value of the cell.
   * @param column The column definition (for dropdown options, etc.).
   * @param onChange A callback function to call when the value changes.
   * @param row The full row this cell belongs to (needed by FormulaRenderer to read sibling cell values).
   * @param columns All of the table's columns (needed by FormulaRenderer to resolve "{{ ColumnName }}" references).
   */
  render(
    app: App,
    container: HTMLElement,
    value: unknown,
    column: ColumnDef,
    onChange: (newValue: unknown) => void,
    row: AgentableRow,
    columns: ColumnDef[]
  ): void;
}
