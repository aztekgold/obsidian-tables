// src/SortHandler.ts

import { TableData, ColumnDef, SortRule } from './types'; // Ensure SortRule is exported from types.ts
import { JsonTableView } from './JsonTableView';

/**
 * Handles the state and UI logic for sorting the table based on view definitions.
 */
export class SortHandler {


  constructor(
private data: TableData,
    private triggerRender: () => void,
    // --- Accept the View instance instead of a save callback ---
    private view: JsonTableView
  ) {
      // Ensure the views array and default view exist
      if (!this.data.views || !Array.isArray(this.data.views) || this.data.views.length === 0) {
           console.warn("No views array found in data, creating default view.");
           this.data.views = [{ id: 'default_'+Date.now(), name: 'Default', sort: [], filter: [] }];
      }
      if (!this.data.views[0].sort) this.data.views[0].sort = [];
      if (!this.data.views[0].filter) this.data.views[0].filter = [];
  }

  // --- Helper Methods for Sort State ---

  public getCurrentSortRules(): SortRule[] {
      return this.data.views?.[0]?.sort || [];
  }

  private setCurrentSortRules(rules: SortRule[]): void {
      if (this.data.views && this.data.views[0]) {
          this.data.views[0].sort = rules;
      } else {
          console.error("Cannot set sort rules: No view definition found in data.");
      }
  }

  // --- UI Method ---

  /** Displays the popup UI for selecting sort options */
  public showSortPopup(button: HTMLButtonElement): void {
    const existingPopup = document.querySelector('.json-table-sort-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.body.createEl('div', { cls: 'json-table-popup json-table-sort-popup' });
    const rect = button.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 5}px`;
    popup.style.left = `${rect.left}px`;

    const currentRules = this.getCurrentSortRules();
    const currentSort = currentRules.length > 0 ? currentRules[0] : { columnId: null, direction: 'asc' };

    // --- Header ---
    const header = popup.createEl('div', { cls: 'json-table-popup-header' });
    header.createEl('h3', { text: 'Sort', cls: 'json-table-popup-title' });

    // --- Content ---
    const content = popup.createEl('div', { cls: 'json-table-popup-content' });

    // --- Column Select ---
    const columnSelect = content.createEl('select', { cls: 'json-table-popup-select' });
    const noneOption = columnSelect.createEl('option', { text: '-- None --', value: '' });
    if (currentSort.columnId === null) noneOption.selected = true;
    this.data.columns.forEach(col => {
      const option = columnSelect.createEl('option', { text: col.name, value: col.id });
      if (col.id === currentSort.columnId) option.selected = true;
    });

    // --- Direction Select ---
    const directionSelect = content.createEl('select', { cls: 'json-table-popup-select' });
    const ascOption = directionSelect.createEl('option', { text: 'Ascending', value: 'asc' });
    const descOption = directionSelect.createEl('option', { text: 'Descending', value: 'desc' });
    if (currentSort.direction === 'asc') ascOption.selected = true;
    else descOption.selected = true;
    directionSelect.disabled = currentSort.columnId === null; // Disable if no column selected

    // Enable/disable direction when column changes
    columnSelect.addEventListener('change', () => {
        directionSelect.disabled = columnSelect.value === '';
    });

    // --- Footer ---
    const footer = popup.createEl('div', { cls: 'json-table-popup-footer' });
    
    // --- Apply Button ---
    const applyButton = footer.createEl('button', {
        text: 'Apply',
        cls: 'json-table-btn json-table-btn--standard'
    });

    // --- Apply Button Click Handler (Arrow Function) ---
    const handleApplyClick = async () => {

        const selectedColumnId = columnSelect.value || null;
        const selectedDirection = directionSelect.value as 'asc' | 'desc';
        const newRules = selectedColumnId ? [{ columnId: selectedColumnId, direction: selectedDirection }] : [];

        try {
            this.setCurrentSortRules(newRules); // Update sort rules in the data object

            // Explicitly call the save function passed from TableRenderer
if (this.view && typeof this.view.saveTableData === 'function') {
                await this.view.saveTableData(this.data); // Call the view's save method
            } else {
                console.error("Error: View instance or saveTableData method is not available!");
                closePopup();
                return;
            }

            this.triggerRender(); // Re-render the table with the new sort
            closePopup(); // Close popup after successful application
        } catch (error) {
            console.error("Error applying sort or saving:", error);
            closePopup(); // Ensure popup closes even on error
        }
    };
    applyButton.addEventListener('click', handleApplyClick);
    // --- End Apply Button ---


    // --- Close popup logic ---
    const closePopup = () => {
      popup.remove();
      document.removeEventListener('click', clickOutside, true);
    };

    const clickOutside = (e: MouseEvent) => {
      // Close only if click is outside popup AND outside the original button
      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node)) {
        closePopup();
      }
    };

    // Use timeout and capture phase
    setTimeout(() => {
      document.addEventListener('click', clickOutside, true);
    }, 0);
  } // End showSortPopup

  // --- Sorting Logic ---
  /** Sorts the this.data.rows array in place based on the rules in the current view */
  // public sortDataInMemory(): void {
  //   const rules = this.getCurrentSortRules();
  //   if (rules.length === 0) {
  //     // TODO: Restore original order if needed
  //     return;
  //   }

  //   const { columnId, direction } = rules[0];
  //   const sortColumn = this.data.columns.find(c => c.id === columnId);
  //   if (!sortColumn) {
  //       console.warn(`Sort column with ID "${columnId}" not found. Skipping sort.`);
  //       return;
  //   }

  //   const stripEmojis = (str: string): string => { /* ... emoji stripping regex ... */
  //       return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
  //   };


  //   this.data.rows.sort((rowA, rowB) => {
  //       const cellA = rowA.find(cell => cell.column === columnId);
  //       const cellB = rowB.find(cell => cell.column === columnId);
  //       const valueA_str = cellA?.value || '';
  //       const valueB_str = cellB?.value || '';
  //       let comparison = 0;

  //       // Type-Specific Sorting
  //       switch (sortColumn.type) {
  //           case 'date':
  //               const timestampA = parseInt(valueA_str, 10) || 0;
  //               const timestampB = parseInt(valueB_str, 10) || 0;
  //               comparison = timestampA - timestampB;
  //               break;
  //           case 'checkbox':
  //               const boolA = valueA_str === 'true';
  //               const boolB = valueB_str === 'true';
  //               comparison = (boolA === boolB) ? 0 : (boolA ? 1 : -1);
  //               break;
  //           // Add number case here if implemented
  //           default: // text, dropdown, multiselect, notelink
  //               const valueA = stripEmojis(valueA_str);
  //               const valueB = stripEmojis(valueB_str);
  //               comparison = valueA.toLowerCase().localeCompare(valueB.toLowerCase());
  //               break;
  //       }

  //       return direction === 'asc' ? comparison : comparison * -1;
  //   });
  // } // End sortDataInMemory
public sortDataInMemory(): void {
    const rules = this.getCurrentSortRules();
    if (rules.length === 0) {
      // TODO: Restore original order if needed
      return;
    }

    const { columnId, direction } = rules[0];
    const sortColumn = this.data.columns.find(c => c.id === columnId);
    if (!sortColumn) {
        console.warn(`Sort column with ID "${columnId}" not found. Skipping sort.`);
        return;
    }

    const stripEmojis = (str: string): string => { /* ... emoji stripping regex ... */
        return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
    };


    this.data.rows.sort((rowA, rowB) => {
        const cellA = rowA.find(cell => cell.column === columnId);
        const cellB = rowB.find(cell => cell.column === columnId);
        const valueA_str = cellA?.value || '';
        const valueB_str = cellB?.value || '';

        // --- NEW: Prioritize Empty Values ---
        const isEmptyA = !valueA_str; // True if empty string, null, or undefined
        const isEmptyB = !valueB_str;

        if (isEmptyA && isEmptyB) {
            return 0; // Both empty, treat as equal
        }
        if (isEmptyA) {
            return 1; // Empty A comes *after* non-empty B, regardless of direction
        }
        if (isEmptyB) {
            return -1; // Non-empty A comes *before* empty B, regardless of direction
        }
        // --- END NEW ---

        // --- If neither is empty, proceed with normal comparison ---
        let comparison = 0;

        switch (sortColumn.type) {
            case 'date':
                const timestampA = parseInt(valueA_str, 10); // Already checked for empty, parse should work or yield NaN
                const timestampB = parseInt(valueB_str, 10);
                // Handle potential NaN from failed parseInt on non-empty, non-numeric strings
                comparison = (isNaN(timestampA) ? 0 : timestampA) - (isNaN(timestampB) ? 0 : timestampB);
                break;
            case 'checkbox':
                const boolA = valueA_str === 'true';
                const boolB = valueB_str === 'true';
                comparison = (boolA === boolB) ? 0 : (boolA ? 1 : -1); // false < true
                break;
            // Add number case here if implemented
            default: // text, dropdown, multiselect, notelink
                const valueA = stripEmojis(valueA_str);
                const valueB = stripEmojis(valueB_str);
                comparison = valueA.toLowerCase().localeCompare(valueB.toLowerCase());
                break;
        }

        // Apply direction ONLY to non-empty comparisons
        return direction === 'asc' ? comparison : comparison * -1;
    });
  } // End sortDataInMemory
} // End SortHandler class