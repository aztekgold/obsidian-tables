// src/FilterHandler.ts
import { TableData, ColumnDef, FilterRule, FilterOperator, CellData, ViewDef } from './types';
import { JsonTableView } from './JsonTableView';
import { ICON_NAMES } from './icons';
import { setIcon } from 'obsidian';
import { positionPopup } from './utils/popup';

/**
 * Handles the state, UI, and logic for filtering table rows.
 */
export class FilterHandler {
  constructor(
    private data: TableData,
    private triggerRender: () => void,
    private view: JsonTableView, // Pass view for saving
    private getActiveView: () => ViewDef // Callback to get the current active view
  ) {
    // Ensure default view and filter array exist
    if (!this.data.views || !Array.isArray(this.data.views) || this.data.views.length === 0) {
      console.warn("No views array found in data, creating default view.");
      this.data.views = [{ id: 'default_' + Date.now(), name: 'Default', sort: [], filter: [] }];
    }
    // Ensure the active view has a filter array
    const activeView = this.getActiveView();
    if (activeView && !activeView.filter) activeView.filter = [];
  }

  // --- Helper Methods for Filter State ---

  /** Gets the current filter rules from the active view definition */
  public getCurrentFilterRules(): FilterRule[] { // Made public if needed elsewhere
    return this.getActiveView()?.filter || [];
  }

  /** Updates the filter rules in the active view definition */
  private setCurrentFilterRules(rules: FilterRule[]): void {
    const activeView = this.getActiveView();
    if (activeView) {
      activeView.filter = rules;
    } else {
      console.error("Cannot set filter rules: No active view found.");
    }
  }

  // --- UI Methods ---

  /** Displays the popup UI for managing filters */
  public showFilterPopup(button: HTMLButtonElement): void {
    // Remove any existing filter popup
    document.querySelector('.json-table-filter-menu')?.remove();

    const menuEl = document.createElement('div');
    menuEl.addClass('menu');
    menuEl.addClass('json-table-filter-menu');
    menuEl.style.position = 'fixed';
    menuEl.style.zIndex = '9999';
    menuEl.style.minWidth = '340px';

    const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });

    // --- Filter section ---
    const filterSection = scrollContainer.createDiv({ cls: 'bases-toolbar-section' });
    const sectionContent = filterSection.createDiv({ cls: 'bases-toolbar-section-content' });
    const queryContainer = sectionContent.createDiv({ cls: 'bases-query-container' });
    const filterGroup = queryContainer.createDiv({ cls: 'filter-group' });

    // Filter rows container
    const statementsContainer = filterGroup.createDiv({ cls: 'filter-group-statements' });

    // Render existing filter rows
    this.rebuildFilterListUI(statementsContainer);

    // --- Actions: Add filter ---
    const actionsDiv = filterGroup.createDiv({ cls: 'filter-group-actions' });
    const addFilterBtn = actionsDiv.createDiv({ cls: 'text-icon-button', attr: { tabindex: '0' } });
    const addIcon = addFilterBtn.createSpan({ cls: 'text-button-icon' });
    setIcon(addIcon, 'plus');
    addFilterBtn.createSpan({ cls: 'text-button-label', text: 'Add filter' });

    addFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const defaultColumnId = this.data.columns[0]?.id;
      if (!defaultColumnId) return;

      const newRule: FilterRule = {
        id: `filter_${Date.now()}`,
        columnId: defaultColumnId,
        operator: 'contains',
        value: ''
      };
      const currentRules = this.getCurrentFilterRules();
      currentRules.push(newRule);
      this.setCurrentFilterRules(currentRules);

      this.rebuildFilterListUI(statementsContainer);
      this.applyFiltersAndRerender();
    });

    // Prevent closing on interaction
    menuEl.addEventListener('click', (e) => e.stopPropagation());
    menuEl.addEventListener('mousedown', (e) => e.stopPropagation());

    // Position and insert
    document.body.appendChild(menuEl);
    positionPopup(menuEl, button, { align: 'auto' });

    const onOutsideClick = (ev: MouseEvent) => {
      if (!menuEl.contains(ev.target as Node) && ev.target !== button) cleanup();
    };
    const cleanup = () => {
      menuEl.remove();
      document.removeEventListener('click', onOutsideClick, true);
    };
    setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
  }

  /** Helper to rebuild the filter rows UI within the popup */
  private rebuildFilterListUI(filtersContainer: HTMLElement) {
    filtersContainer.empty(); // Clear previous filter rows
    const currentRules = this.getCurrentFilterRules();

    if (currentRules.length === 0) {
      filtersContainer.createDiv({ text: 'No filters applied', cls: 'json-table-filter-empty' });
      filtersContainer.style.padding = '4px 8px';
      filtersContainer.style.color = 'var(--text-muted)';
      filtersContainer.style.fontSize = 'var(--font-smallest)';
    } else {
      filtersContainer.style.padding = '';
      filtersContainer.style.color = '';
      filtersContainer.style.fontSize = '';
      currentRules.forEach((rule, index) => {
        this.renderFilterRow(filtersContainer, rule, index);
      });
    }
  }

  /** Renders a single row in the filter popup */
  private renderFilterRow(container: HTMLElement, rule: FilterRule, index: number): void {
    const rowDiv = container.createDiv({ cls: 'filter-row' });

    // Conjunction label
    rowDiv.createSpan({ cls: 'conjunction', text: index === 0 ? 'where' : 'and' });

    // Filter statement wrapper
    const statement = rowDiv.createDiv({ cls: 'filter-statement' });
    const expression = statement.createDiv({ cls: 'filter-expression metadata-property' });

    // Column Select
    const columnSelect = expression.createEl('select', { cls: 'dropdown' });
    this.data.columns.forEach(col => {
      const option = columnSelect.createEl('option', { text: col.name, value: col.id });
      if (col.id === rule.columnId) option.selected = true;
    });
    columnSelect.addEventListener('click', (e) => e.stopPropagation());
    columnSelect.addEventListener('mousedown', (e) => e.stopPropagation());
    columnSelect.addEventListener('change', () => {
      rule.columnId = columnSelect.value;
      this.applyFiltersAndRerender();
    });

    // Operator Select
    const operatorSelect = expression.createEl('select', { cls: 'dropdown' });
    const operators: { label: string; value: FilterOperator }[] = [
      { label: 'Contains', value: 'contains' },
      { label: 'Does not contain', value: 'doesNotContain' },
      { label: 'Starts with', value: 'startsWith' },
      { label: 'Ends with', value: 'endsWith' },
      { label: 'Is empty', value: 'isEmpty' },
      { label: 'Is not empty', value: 'isNotEmpty' },
      { label: 'Equals', value: 'equals' },
      { label: 'Not equal', value: 'notEqual' },
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
        valueInput.addClass("json-table-is-hidden");
      } else {
        valueInput.removeClass("json-table-is-hidden");
      }
      this.applyFiltersAndRerender();
    });

    // Value Input
    const valueInput = expression.createEl('input', {
      type: 'text',
      value: rule.value || '',
      placeholder: 'Empty',
      cls: 'metadata-input metadata-input-text'
    });
    valueInput.addEventListener('click', (e) => e.stopPropagation());
    valueInput.addEventListener('mousedown', (e) => e.stopPropagation());
    if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') {
      valueInput.addClass("json-table-is-hidden");
    }
    valueInput.addEventListener('input', () => {
      rule.value = valueInput.value;
      this.applyFiltersAndRerender();
    });

    // Delete Button (row actions)
    const rowActions = expression.createDiv({ cls: 'filter-row-actions' });
    const deleteBtn = rowActions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Remove filter' } });
    setIcon(deleteBtn, 'trash-2');
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

  // --- Filtering Logic ---

  /** Applies filters, saves the data, and triggers a table re-render */
  private async applyFiltersAndRerender(): Promise<void> {
    // setCurrentFilterRules was already called by UI event handlers updating the rule object directly
    try {
      await this.view.saveTableData(this.data); // Save the updated filter rules
      this.triggerRender(); // Re-render the table UI
    } catch (error) {
      console.error("Error saving data after filter change:", error);
      // Optionally notify user
    }
  }

  /**
   * Filters the full row data based on current rules defined in the view.
   * @returns A new array containing only the rows that match ALL active filters.
   */
  public getFilteredRows(): CellData[][] {
    const rules = this.getCurrentFilterRules();
    // If no filters, return all rows immediately
    if (rules.length === 0) {
      return this.data.rows;
    }


    // Filter the main rows array
    return this.data.rows.filter(row => {
      // Check if the row satisfies ALL filter rules (AND logic)
      return rules.every(rule => {
        const cell = row.find(c => c.column === rule.columnId);
        // Treat missing cell value as empty string for comparisons
        const cellValue = cell?.value || '';
        // Treat missing filter rule value as empty string
        const filterValue = rule.value || '';
        // Use lowercase for case-insensitive text comparisons
        const cellValueLower = cellValue.toLowerCase();
        const filterValueLower = filterValue.toLowerCase();

        switch (rule.operator) {
          case 'contains':
            return cellValueLower.includes(filterValueLower);
          case 'doesNotContain':
            return !cellValueLower.includes(filterValueLower);
          case 'startsWith':
            return cellValueLower.startsWith(filterValueLower);
          case 'endsWith':
            return cellValueLower.endsWith(filterValueLower);
          case 'isEmpty':
            return cellValue === ''; // Check exact empty string
          case 'isNotEmpty':
            return cellValue !== '';
          case 'equals':
            return cellValueLower === filterValueLower; // Case-insensitive equals
          case 'notEqual':
            return cellValueLower !== filterValueLower; // Case-insensitive not equal
          default:
            console.warn(`Unknown filter operator: ${rule.operator} `);
            return true; // Don't filter out row if operator is unknown
        }
      }); // End rules.every
    }); // End this.data.rows.filter
  } // End getFilteredRows

  /** Checks if any filters are currently active */
  public hasActiveFilters(): boolean {
    return this.getCurrentFilterRules().length > 0;
  }

} // End FilterHandler class