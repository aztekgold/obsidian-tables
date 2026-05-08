import { TableData, FilterRule, FilterOperator, AgentableRow, ViewDef } from './types';
import { JsonTableView } from './JsonTableView';
import { ICON_NAMES, createIconElement } from './icons';
import { positionPopup, attachPopupCleanup } from './utils/popup';
import { createDefaultView } from './utils/fileUtils';
import { generateFilterId } from './utils/migrateUtils';

export class FilterHandler {
  constructor(
    private data: TableData,
    private triggerRender: () => void,
    private view: JsonTableView,
    private getActiveView: () => ViewDef
  ) {
    if (!this.data.views || !Array.isArray(this.data.views) || this.data.views.length === 0) {
      this.data.views = [createDefaultView()];
    }
    const activeView = this.getActiveView();
    if (activeView && !activeView.filters) activeView.filters = [];
  }

  public getCurrentFilterRules(): FilterRule[] {
    return this.getActiveView()?.filters || [];
  }

  private setCurrentFilterRules(rules: FilterRule[]): void {
    const activeView = this.getActiveView();
    if (activeView) activeView.filters = rules;
  }

  public showFilterPopup(button: HTMLButtonElement): void {
    document.querySelector('.json-table-filter-menu')?.remove();

    const menuEl = document.createElement('div');
    menuEl.addClass('menu');
    menuEl.addClass('json-table-filter-menu');
    menuEl.addClass('json-table-popup-menu');

    const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
    const filterSection = scrollContainer.createDiv({ cls: 'bases-toolbar-section' });
    const sectionContent = filterSection.createDiv({ cls: 'bases-toolbar-section-content' });
    const queryContainer = sectionContent.createDiv({ cls: 'bases-query-container' });
    const filterGroup = queryContainer.createDiv({ cls: 'filter-group' });
    const statementsContainer = filterGroup.createDiv({ cls: 'filter-group-statements' });

    this.rebuildFilterListUI(statementsContainer);

    const actionsDiv = filterGroup.createDiv({ cls: 'filter-group-actions' });
    const addFilterBtn = actionsDiv.createDiv({ cls: 'text-icon-button', attr: { tabindex: '0' } });
    addFilterBtn.createSpan({ cls: 'text-button-icon' }).appendChild(createIconElement(ICON_NAMES.plus, 14));
    addFilterBtn.createSpan({ cls: 'text-button-label', text: 'Add filter' });

    addFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const defaultColumnId = this.data.columns[0]?.id;
      if (!defaultColumnId) return;
      const newRule: FilterRule = {
        id: generateFilterId(new Set(this.getCurrentFilterRules().map(r => r.id))),
        columnId: defaultColumnId,
        operator: 'contains',
        value: '',
      };
      const currentRules = this.getCurrentFilterRules();
      currentRules.push(newRule);
      this.setCurrentFilterRules(currentRules);
      this.rebuildFilterListUI(statementsContainer);
      void this.applyFiltersAndRerender();
    });

    menuEl.addEventListener('click', (e) => e.stopPropagation());
    menuEl.addEventListener('mousedown', (e) => e.stopPropagation());

    document.body.appendChild(menuEl);
    positionPopup(menuEl, button, { align: 'auto' });
    attachPopupCleanup(menuEl, button);
  }

  private rebuildFilterListUI(filtersContainer: HTMLElement) {
    filtersContainer.empty();
    const currentRules = this.getCurrentFilterRules();

    if (currentRules.length === 0) {
      filtersContainer.createDiv({ text: 'No filters applied', cls: 'json-table-filter-empty' });
      filtersContainer.addClass('is-empty');
    } else {
      filtersContainer.removeClass('is-empty');
      currentRules.forEach((rule, index) => {
        this.renderFilterRow(filtersContainer, rule, index);
      });
    }
  }

  private renderFilterRow(container: HTMLElement, rule: FilterRule, index: number): void {
    const rowDiv = container.createDiv({ cls: 'filter-row' });
    rowDiv.createSpan({ cls: 'conjunction', text: index === 0 ? 'where' : 'and' });

    const statement = rowDiv.createDiv({ cls: 'filter-statement' });
    const expression = statement.createDiv({ cls: 'filter-expression metadata-property' });

    const columnSelect = expression.createEl('select', { cls: 'dropdown' });
    this.data.columns.forEach(col => {
      const option = columnSelect.createEl('option', { text: col.name, value: col.id });
      if (col.id === rule.columnId) option.selected = true;
    });
    columnSelect.addEventListener('click', (e) => e.stopPropagation());
    columnSelect.addEventListener('mousedown', (e) => e.stopPropagation());
    columnSelect.addEventListener('change', () => {
      rule.columnId = columnSelect.value;
      void this.applyFiltersAndRerender();
    });

    const operatorSelect = expression.createEl('select', { cls: 'dropdown' });
    const operators: { label: string; value: FilterOperator }[] = [
      { label: 'Contains', value: 'contains' },
      { label: 'Does not contain', value: 'doesNotContain' },
      { label: 'Starts with', value: 'startsWith' },
      { label: 'Ends with', value: 'endsWith' },
      { label: 'Is empty', value: 'isEmpty' },
      { label: 'Is not empty', value: 'isNotEmpty' },
      { label: 'Is', value: 'is' },
      { label: 'Is not', value: 'isNot' },
    ];
    operators.forEach(op => {
      const option = operatorSelect.createEl('option', { text: op.label, value: op.value });
      if (op.value === rule.operator) option.selected = true;
    });
    operatorSelect.addEventListener('click', (e) => e.stopPropagation());
    operatorSelect.addEventListener('mousedown', (e) => e.stopPropagation());
    operatorSelect.addEventListener('change', () => {
      rule.operator = operatorSelect.value as FilterOperator;
      if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') {
        valueInput.addClass('json-table-is-hidden');
      } else {
        valueInput.removeClass('json-table-is-hidden');
      }
      void this.applyFiltersAndRerender();
    });

    const valueInput = expression.createEl('input', {
      type: 'text',
      value: rule.value || '',
      placeholder: 'Empty',
      cls: 'metadata-input metadata-input-text',
    });
    valueInput.addEventListener('click', (e) => e.stopPropagation());
    valueInput.addEventListener('mousedown', (e) => e.stopPropagation());
    if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') {
      valueInput.addClass('json-table-is-hidden');
    }
    let debounceTimer: ReturnType<typeof setTimeout>;
    valueInput.addEventListener('input', () => {
      rule.value = valueInput.value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this.applyFiltersAndRerender(), 400);
    });

    const rowActions = expression.createDiv({ cls: 'filter-row-actions' });
    const deleteBtn = rowActions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Remove filter' } });
    deleteBtn.appendChild(createIconElement(ICON_NAMES.trash, 14));
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const currentRules = this.getCurrentFilterRules();
      currentRules.splice(index, 1);
      this.setCurrentFilterRules(currentRules);
      await this.view.saveTableData(this.data);
      this.triggerRender();
      this.rebuildFilterListUI(container);
    });
  }

  private async applyFiltersAndRerender(): Promise<void> {
    try {
      await this.view.saveTableData(this.data);
      this.triggerRender();
    } catch (error) {
      console.error('Error saving data after filter change:', error);
    }
  }

  public getFilteredRows(rows: AgentableRow[] = this.data.rows): AgentableRow[] {
    const rules = this.getCurrentFilterRules();
    if (rules.length === 0) return rows;

    return rows.filter(row => {
      return rules.every(rule => {
        const cellValue = String(row.cells[rule.columnId] ?? '');
        const filterValue = rule.value || '';
        const cellLower = cellValue.toLowerCase();
        const filterLower = filterValue.toLowerCase();

        switch (rule.operator) {
          case 'contains': return cellLower.includes(filterLower);
          case 'doesNotContain': return !cellLower.includes(filterLower);
          case 'startsWith': return cellLower.startsWith(filterLower);
          case 'endsWith': return cellLower.endsWith(filterLower);
          case 'isEmpty': return cellValue === '';
          case 'isNotEmpty': return cellValue !== '';
          case 'is': return cellLower === filterLower;
          case 'isNot': return cellLower !== filterLower;
          default:
            console.warn(`Unknown filter operator: ${rule.operator}`);
            return true;
        }
      });
    });
  }

  public hasActiveFilters(): boolean {
    return this.getCurrentFilterRules().length > 0;
  }
}
