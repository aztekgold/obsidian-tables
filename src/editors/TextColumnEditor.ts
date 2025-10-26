import { IColumnEditor } from './IColumnEditor';
import { ColumnDef, TableData } from '../types';
import { JsonTableView } from '../JsonTableView';

export class TextColumnEditor implements IColumnEditor {
  
  public render(
    container: HTMLElement,
    column: ColumnDef,
    data: TableData,
    view: JsonTableView
  ): void {
    // Text columns have no extra options to edit,
    // so we simply do nothing.
  }
}