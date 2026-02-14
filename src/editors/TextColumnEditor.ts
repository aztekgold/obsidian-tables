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
    container.createEl('label', {
      text: 'Options',
      cls: 'json-table-popup-label'
    });

    const wrapper = container.createDiv({ cls: 'json-table-props-item' });
    const label = wrapper.createEl('label');

    const checkbox = label.createEl('input', { type: 'checkbox' });
    checkbox.checked = (column.typeOptions as any)?.wrap || false;

    label.appendText('Enable Word Wrap');

    checkbox.addEventListener('change', async () => {
      if (!column.typeOptions) column.typeOptions = {};
      (column.typeOptions as any).wrap = checkbox.checked;
      await view.saveTableData(data);
      view.getRenderer()?.render();
    });
  }
}