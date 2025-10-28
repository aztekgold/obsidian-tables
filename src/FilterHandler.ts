// src/FilterHandler.ts
import { TableData, ColumnDef, FilterRule, FilterOperator, CellData } from './types'; // Adjust path if needed
import { JsonTableView } from './JsonTableView'; // Adjust path if needed
import { ICON_NAMES, createIconElement } from './icons'; // Adjust path if needed

/**
 * Handles the state, UI, and logic for filtering table rows.
 */
export class FilterHandler {
  constructor(
    private data: TableData,
    private triggerRender: () => void,
    private view: JsonTableView // Pass view for saving
  ) {
    // Ensure default view and filter array exist
    if (!this.data.views?.[0]?.filter) {
      if (!this.data.views?.[0]) {
        this.data.views = [{ id: 'default_' + Date.now(), name: 'Default', sort: [], filter: [] }];
      } else {
        this.data.views[0].filter = [];
      }
    }
  }

  // --- Helper Methods for Filter State ---

  /** Gets the current filter rules from the first view definition */
  public getCurrentFilterRules(): FilterRule[] { // Made public if needed elsewhere
    return this.data.views?.[0]?.filter || [];
  }

  /** Updates the filter rules in the first view definition */
  private setCurrentFilterRules(rules: FilterRule[]): void {
    if (this.data.views?.[0]) {
      this.data.views[0].filter = rules;
    } else {
      console.error("Cannot set filter rules: No view definition found.");
    }
  }

  // --- UI Methods ---

  /** Displays the popup UI for managing filters */
  public showFilterPopup(button: HTMLButtonElement): void {
    const existingPopup = document.querySelector('.json-table-filter-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.body.createEl('div', { cls: 'json-table-popup json-table-filter-popup' });
    // Position popup dynamically based on button location
    const rect = button.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 5}px`;
    popup.style.left = `${rect.left}px`;

    // --- Header ---
    const header = popup.createEl('div', { cls: 'json-table-popup-header' });
    header.createEl('h3', { text: 'Filters', cls: 'json-table-popup-title' });

    // --- Content ---
    const content = popup.createEl('div', { cls: 'json-table-popup-content' });
    
    // Container where filter rows will be rendered
    const filtersContainer = content.createDiv({ cls: 'json-table-filters-list' });

    // Use helper for initial render and updates
    this.rebuildFilterListUI(filtersContainer, popup);

    // --- Footer ---
    const footer = popup.createEl('div', { cls: 'json-table-popup-footer' });

    // --- "Add Filter" Button ---
    const addFilterButton = footer.createEl('button', {
      text: '+ Add Filter',
      cls: 'json-table-btn json-table-btn--standard'
    });
    addFilterButton.addEventListener('click', () => {
      const defaultColumnId = this.data.columns[0]?.id;
      if (!defaultColumnId) {
          console.warn("Cannot add filter: No columns exist.");
          return;
      }

      const newRule: FilterRule = {
        id: `filter_${Date.now()}`,
        columnId: defaultColumnId,
        operator: 'contains',
        value: ''
      };
      const currentRules = this.getCurrentFilterRules();
      currentRules.push(newRule);
      this.setCurrentFilterRules(currentRules); // Update in memory

      // Rebuild the list UI to include the new empty rule
      this.rebuildFilterListUI(filtersContainer, popup);

      // Apply and save immediately
      this.applyFiltersAndRerender();
    });


    // --- Close popup logic ---
    const closePopup = () => {
      popup.remove();
      // Ensure listener is removed using capture phase flag
      document.removeEventListener('click', clickOutside, true);
    };

    const clickOutside = (e: MouseEvent) => {
      // Close only if click is outside popup AND outside the original button
      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node)) {
        closePopup();
      }
    };

    // Use timeout (0ms) and capture phase ('true')
    setTimeout(() => {
      document.addEventListener('click', clickOutside, true);
    }, 0);
  }

  /** Helper to rebuild the filter rows UI within the popup */
  private rebuildFilterListUI(filtersContainer: HTMLElement, popupElement: HTMLElement) {
      filtersContainer.empty(); // Clear previous filter rows
      const currentRules = this.getCurrentFilterRules();

      if (currentRules.length === 0) {
        filtersContainer.createDiv({ text: 'No filters applied', cls: 'json-table-filter-empty' });
      } else {
        currentRules.forEach((rule, index) => {
          // Pass the container where rows should be added
          this.renderFilterRow(filtersContainer, rule, index);
        });
      }
      // Note: The "Add Filter" button is outside this container in showFilterPopup,
      // so it doesn't need to be re-added here.
  }

  /** Renders a single row in the filter popup */
  private renderFilterRow(container: HTMLElement, rule: FilterRule, index: number): void {
    const rowDiv = container.createDiv({ cls: 'json-table-filter-row' });

    // Column Select
    const columnSelect = rowDiv.createEl('select', { cls: 'json-table-popup-select' });
    this.data.columns.forEach(col => {
      const option = columnSelect.createEl('option', { text: col.name, value: col.id });
      if (col.id === rule.columnId) option.selected = true;
    });
    columnSelect.addEventListener('change', () => {
      rule.columnId = columnSelect.value;
      this.applyFiltersAndRerender(); // Apply immediately on change
    });

    // Operator Select
    const operatorSelect = rowDiv.createEl('select', { cls: 'json-table-popup-select' });
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
    operatorSelect.addEventListener('change', () => {
      rule.operator = operatorSelect.value as FilterOperator;
      // Show/hide value input based on operator
      if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') {
        valueInput.addClass('is-hidden');
      } else {
        valueInput.removeClass('is-hidden');
      }
      this.applyFiltersAndRerender();
    });

    // Value Input
    const valueInput = rowDiv.createEl('input', {
      type: 'text',
      value: rule.value || '',
      cls: 'json-table-popup-input'
    });
    // Initial state
    if (rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty') {
      valueInput.addClass('is-hidden');
    }
    // Apply on blur or change instead of input for less frequent updates? Your choice.
    valueInput.addEventListener('blur', () => { // Changed from 'input'
      rule.value = valueInput.value;
      this.applyFiltersAndRerender();
    });
     // Optional: Apply on Enter key as well
     valueInput.addEventListener('keydown', (e) => {
         if (e.key === 'Enter') {
             rule.value = valueInput.value;
             this.applyFiltersAndRerender();
         }
     });


    // Delete Button
    const deleteButton = rowDiv.createEl('button', { cls: 'json-table-delete-filter-button' });
    const trashIcon = createIconElement(ICON_NAMES.trash, 14);
    deleteButton.appendChild(trashIcon);
    deleteButton.addEventListener('click', async () => { // Make async
      const currentRules = this.getCurrentFilterRules();
      currentRules.splice(index, 1); // Remove rule by index
      this.setCurrentFilterRules(currentRules); // Update in-memory rules

      // Save, re-render main table, THEN re-render popup list
      await this.view.saveTableData(this.data); // Save the change
      this.triggerRender(); // Re-render the main table (applies filter)

      // Find the popup and re-render its filter list content
      const parentPopup = container.closest('.json-table-filter-popup');
      const filtersListContainer = parentPopup?.querySelector('.json-table-filters-list');
      if (filtersListContainer && parentPopup) { // Ensure both exist
          // Rebuild the list content
          this.rebuildFilterListUI(filtersListContainer as HTMLElement, parentPopup as HTMLElement);
      } else {
          console.error("Could not find filter list container/popup to re-render after delete.");
      }
    });
  } // End renderFilterRow

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
            console.warn(`Unknown filter operator: ${rule.operator}`);
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