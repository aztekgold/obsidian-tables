// src/SortHandler.ts

import { TableData, ColumnDef, SortRule, ViewDef } from './types';
import { JsonTableView } from './JsonTableView';
import { ICON_NAMES, createIconElement } from './icons';
import { setIcon } from 'obsidian';
import { positionPopup } from './utils/popup';
import { createDefaultView } from './utils/fileUtils';

/**
 * Handles the state and UI logic for sorting the table based on view definitions.
 */
export class SortHandler {


    constructor(
        private data: TableData,
        private triggerRender: () => void,
        // --- Accept the View instance instead of a save callback ---
        private view: JsonTableView,
        private getActiveView: () => ViewDef // Callback to get the current active view
    ) {
        // Ensure the views array and default view exist
        if (!this.data.views || !Array.isArray(this.data.views) || this.data.views.length === 0) {
            console.warn("No views array found in data, creating default view.");
            this.data.views = [createDefaultView()];
        }
        // Ensure the active view has a sort array
        const activeView = this.getActiveView();
        if (activeView && !activeView.sort) activeView.sort = [];
    }

    // --- Helper Methods for Sort State ---

    public getCurrentSortRules(): SortRule[] {
        return this.getActiveView()?.sort || [];
    }

    private setCurrentSortRules(rules: SortRule[]): void {
        const activeView = this.getActiveView();
        if (activeView) {
            activeView.sort = rules;
        } else {
            console.error("Cannot set sort rules: No active view found.");
        }
    }

    public isSortActive(): boolean {
        const rules = this.getCurrentSortRules();
        return rules.length > 0 && rules[0].columnId !== null;
    }

    // --- UI Method ---

    /** Displays the popup UI for selecting sort options */
    public showSortPopup(button: HTMLButtonElement): void {
        // Remove any existing sort popup
        document.querySelector('.json-table-sort-menu')?.remove();

        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('json-table-sort-menu');
        menuEl.addClass('json-table-popup-menu');

        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });

        // --- Sort section ---
        const sortSection = scrollContainer.createDiv({ cls: 'bases-toolbar-section' });
        const sectionContent = sortSection.createDiv({ cls: 'bases-toolbar-section-content' });
        const queryContainer = sectionContent.createDiv({ cls: 'bases-query-container' });
        const sortGroup = queryContainer.createDiv({ cls: 'filter-group' });

        // Sort rows container
        const statementsContainer = sortGroup.createDiv({ cls: 'filter-group-statements' });

        const cleanup = () => {
            menuEl.remove();
            document.removeEventListener('click', onOutsideClick, true);
        };

        const rebuildSortRows = () => {
            statementsContainer.empty();
            const currentRules = this.getCurrentSortRules();

            if (currentRules.length === 0) {
                statementsContainer.createDiv({ text: 'No sorts applied', cls: 'json-table-filter-empty' });
                statementsContainer.addClass('is-empty');
            } else {
                statementsContainer.removeClass('is-empty');
                currentRules.forEach((rule, index) => {
                    const rowDiv = statementsContainer.createDiv({ cls: 'filter-row' });

                    // Conjunction
                    rowDiv.createSpan({ cls: 'conjunction', text: index === 0 ? 'sort by' : 'then by' });

                    // Statement wrapper
                    const statement = rowDiv.createDiv({ cls: 'filter-statement' });
                    const expression = statement.createDiv({ cls: 'filter-expression metadata-property' });

                    // Column select
                    const columnSelect = expression.createEl('select', { cls: 'dropdown' });
                    this.data.columns.forEach(col => {
                        const option = columnSelect.createEl('option', { text: col.name, value: col.id });
                        if (col.id === rule.columnId) option.selected = true;
                    });
                    columnSelect.addEventListener('click', (e) => e.stopPropagation());
                    columnSelect.addEventListener('mousedown', (e) => e.stopPropagation());
                    columnSelect.addEventListener('change', async () => {
                        rule.columnId = columnSelect.value;
                        await this.view.saveTableData(this.data);
                        this.triggerRender();
                    });

                    // Direction select
                    const directionSelect = expression.createEl('select', { cls: 'dropdown' });
                    const ascOpt = directionSelect.createEl('option', { text: 'Ascending', value: 'asc' });
                    const descOpt = directionSelect.createEl('option', { text: 'Descending', value: 'desc' });
                    if (rule.direction === 'asc') ascOpt.selected = true;
                    else descOpt.selected = true;
                    directionSelect.addEventListener('click', (e) => e.stopPropagation());
                    directionSelect.addEventListener('mousedown', (e) => e.stopPropagation());
                    directionSelect.addEventListener('change', async () => {
                        rule.direction = directionSelect.value as 'asc' | 'desc';
                        await this.view.saveTableData(this.data);
                        this.triggerRender();
                    });

                    // Delete button
                    const rowActions = expression.createDiv({ cls: 'filter-row-actions' });
                    const deleteBtn = rowActions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Remove sort' } });
                    deleteBtn.appendChild(createIconElement(ICON_NAMES.trash, 14));
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const rules = this.getCurrentSortRules();
                        rules.splice(index, 1);
                        this.setCurrentSortRules(rules);
                        await this.view.saveTableData(this.data);
                        this.triggerRender();
                        rebuildSortRows();
                    });
                });
            }
        };

        rebuildSortRows();

        // --- Actions: Add sort ---
        const actionsDiv = sortGroup.createDiv({ cls: 'filter-group-actions' });
        const addSortBtn = actionsDiv.createDiv({ cls: 'text-icon-button', attr: { tabindex: '0' } });
        const addIcon = addSortBtn.createSpan({ cls: 'text-button-icon' });
        addIcon.appendChild(createIconElement(ICON_NAMES.plus, 14));
        addSortBtn.createSpan({ cls: 'text-button-label', text: 'Add sort' });

        addSortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const defaultColumnId = this.data.columns[0]?.id;
            if (!defaultColumnId) return;

            const newRule: SortRule = {
                columnId: defaultColumnId,
                direction: 'asc'
            };
            const currentRules = this.getCurrentSortRules();
            currentRules.push(newRule);
            this.setCurrentSortRules(currentRules);
            rebuildSortRows();
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
        setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
    }

    // --- Sorting Logic ---
    /** Sorts the this.data.rows array in place based on the rules in the current view */
    public sortDataInMemory(): void {
        const rules = this.getCurrentSortRules();
        if (rules.length === 0) return;

        const { columnId, direction } = rules[0];
        const sortColumn = this.data.columns.find(c => c.id === columnId);
        if (!sortColumn) return;

        const stripEmojis = (str: string): string => {
            return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
        };

        // --- PRE-CALCULATE SORT KEYS ($O(R*C)$ once instead of $O(R log R * C)$) ---
        // Using a Map to associate original row arrays with their normalized sort keys
        const sortKeys = new Map<any[], any>();

        this.data.rows.forEach(row => {
            const cell = row.find(c => c.column === columnId);
            const rawValue = cell?.value || '';

            if (rawValue === '' || rawValue === null || rawValue === undefined) {
                sortKeys.set(row, null); // Mark as empty
                return;
            }

            switch (sortColumn.type) {
                case 'date':
                    const ts = parseInt(rawValue, 10);
                    sortKeys.set(row, isNaN(ts) ? 0 : ts);
                    break;
                case 'checkbox':
                    sortKeys.set(row, rawValue === 'true' ? 1 : 0);
                    break;
                case 'number':
                    const num = parseFloat(rawValue);
                    sortKeys.set(row, isNaN(num) ? 0 : num);
                    break;
                default: // text, dropdown, multiselect, notelink
                    sortKeys.set(row, stripEmojis(rawValue).toLowerCase());
                    break;
            }
        });

        this.data.rows.sort((rowA, rowB) => {
            const valA = sortKeys.get(rowA);
            const valB = sortKeys.get(rowB);

            // Handle Empty Values (Always go to bottom)
            const isEmptyA = valA === null;
            const isEmptyB = valB === null;

            if (isEmptyA && isEmptyB) return 0;
            if (isEmptyA) return 1;
            if (isEmptyB) return -1;

            let comparison = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                comparison = valA.localeCompare(valB);
            } else {
                comparison = valA < valB ? -1 : (valA > valB ? 1 : 0);
            }

            return direction === 'asc' ? comparison : -comparison;
        });
    } // End sortDataInMemory
} // End SortHandler class