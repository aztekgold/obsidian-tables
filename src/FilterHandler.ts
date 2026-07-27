import { TableData, FilterRule, FilterOperator, AgentableRow, ViewDef } from './types';
import { JsonTableView } from './JsonTableView';
import { ICON_NAMES, createIconElement } from './icons';
import { positionPopup, attachPopupCleanup } from './utils/popup';
import { createDefaultView } from './utils/fileUtils';
import { generateFilterId } from './utils/migrateUtils';
import { isNumericColumn as isColumnNumeric } from './FormulaHandler';

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
      rebuildOperatorOptions();
      updateValueVisibility();
      updateValueInputMode();
      void this.applyFiltersAndRerender();
    });

    const getColumn = () => this.data.columns.find(c => c.id === rule.columnId);
    const getColumnType = () => getColumn()?.type;
    const isNumericColumn = () => isColumnNumeric(getColumn());

    // gt/lt only make sense as a numeric comparison, so they're only offered
    // for date/number columns (date cells are stored as numeric timestamps)
    // and Function columns whose formula resolves to a number.
    const ALL_OPERATORS: { label: string; value: FilterOperator; numericOnly?: boolean }[] = [
      { label: 'Contains', value: 'contains' },
      { label: 'Does not contain', value: 'doesNotContain' },
      { label: 'Starts with', value: 'startsWith' },
      { label: 'Ends with', value: 'endsWith' },
      { label: 'Greater than', value: 'gt', numericOnly: true },
      { label: 'Less than', value: 'lt', numericOnly: true },
      { label: 'Is empty', value: 'isEmpty' },
      { label: 'Is not empty', value: 'isNotEmpty' },
      { label: 'Is', value: 'is' },
      { label: 'Is not', value: 'isNot' },
    ];

    const operatorSelect = expression.createEl('select', { cls: 'dropdown' });

    const rebuildOperatorOptions = () => {
      operatorSelect.empty();
      const numeric = isNumericColumn();
      const available = ALL_OPERATORS.filter(op => !op.numericOnly || numeric);
      if (!available.some(op => op.value === rule.operator)) {
        rule.operator = 'contains';
      }
      available.forEach(op => {
        const option = operatorSelect.createEl('option', { text: op.label, value: op.value });
        if (op.value === rule.operator) option.selected = true;
      });
    };
    rebuildOperatorOptions();

    operatorSelect.addEventListener('click', (e) => e.stopPropagation());
    operatorSelect.addEventListener('mousedown', (e) => e.stopPropagation());
    operatorSelect.addEventListener('change', () => {
      rule.operator = operatorSelect.value as FilterOperator;
      updateValueVisibility();
      updateValueInputMode();
      void this.applyFiltersAndRerender();
    });

    const valueInput = expression.createEl('input', {
      type: 'text',
      placeholder: 'Empty',
      cls: 'metadata-input metadata-input-text',
    });
    valueInput.addEventListener('click', (e) => e.stopPropagation());
    valueInput.addEventListener('mousedown', (e) => e.stopPropagation());

    const updateValueVisibility = () => {
      if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') {
        valueInput.addClass('json-table-is-hidden');
      } else {
        valueInput.removeClass('json-table-is-hidden');
      }
    };
    updateValueVisibility();

    // Greater-than/less-than on a date column compares numeric timestamps
    // (how date cells are stored), so the value must be entered as a real
    // date rather than a raw millisecond number - swap in a native date
    // picker for that combination and convert to/from a timestamp string.
    const isDateRangeFilter = (): boolean =>
      getColumnType() === 'date' && (rule.operator === 'gt' || rule.operator === 'lt');
    const timestampToDateInputValue = (value: string | undefined): string => {
      const ms = parseInt(value || '', 10);
      if (isNaN(ms)) return '';
      const d = new Date(ms);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const dateInputValueToTimestamp = (value: string): string => {
      if (!value) return '';
      const [year, month, day] = value.split('-').map(Number);
      return String(new Date(year, month - 1, day).getTime());
    };
    const updateValueInputMode = () => {
      const useDateInput = isDateRangeFilter();
      valueInput.type = useDateInput ? 'date' : 'text';
      valueInput.value = useDateInput ? timestampToDateInputValue(rule.value) : (rule.value || '');
    };
    updateValueInputMode();

    let debounceTimer: ReturnType<typeof setTimeout>;
    valueInput.addEventListener('input', () => {
      rule.value = isDateRangeFilter() ? dateInputValueToTimestamp(valueInput.value) : valueInput.value;
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

    // Precompute each rule's column once, so gt/lt can tell whether to
    // compare numerically (date/number columns, or a Function column whose
    // formula resolves to a number) or fall back to a lexicographic
    // comparison for everything else.
    const ruleColumns = new Map(rules.map(rule => [rule.id, this.data.columns.find(c => c.id === rule.columnId)]));

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
          case 'gt':
          case 'lt': {
            if (filterValue === '') return true;
            if (isColumnNumeric(ruleColumns.get(rule.id))) {
              const cellNum = parseFloat(cellValue);
              const filterNum = parseFloat(filterValue);
              if (isNaN(cellNum) || isNaN(filterNum)) return false;
              return rule.operator === 'gt' ? cellNum > filterNum : cellNum < filterNum;
            }
            return rule.operator === 'gt' ? cellLower > filterLower : cellLower < filterLower;
          }
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
