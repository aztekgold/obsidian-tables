import { ColumnDef, TableData } from '../types';
import { JsonTableView } from '../JsonTableView';

/**
 * The "contract" for a UI component that can
 * edit a column's specific properties (e.g., dropdown options).
 */
export interface IColumnEditor {
  /**
   * Renders the editor UI into the provided container.
   * @param container The <div> in the popup to render into.
   * @param column The column definition.
   * @param view The main view, used to save data or re-render.
   */
  render(
    container: HTMLElement,
    column: ColumnDef,
    data: TableData,
    view: JsonTableView
  ): void;
}