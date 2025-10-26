import { App } from 'obsidian';
import { ColumnDef } from '../types';
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
   */
  render(
    app: App,
    container: HTMLElement,
    value: string,
    column: ColumnDef,
    onChange: (newValue: string) => void
  ): void;
}