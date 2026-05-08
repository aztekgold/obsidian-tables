import { TableData, SortRule, ViewDef, AgentableRow } from './types';
import { JsonTableView } from './JsonTableView';
import { ICON_NAMES, createIconElement } from './icons';
import { positionPopup } from './utils/popup';
import { createDefaultView, } from './utils/fileUtils';
import { generateSortId } from './utils/migrateUtils';

export class SortHandler {

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
    if (activeView && !activeView.sorts) activeView.sorts = [];
  }

  public getCurrentSortRules(): SortRule[] {
    return this.getActiveView()?.sorts || [];
  }

  private setCurrentSortRules(rules: SortRule[]): void {
    const activeView = this.getActiveView();
    if (activeView) activeView.sorts = rules;
  }

  public isSortActive(): boolean {
    const rules = this.getCurrentSortRules();
    return rules.length > 0 && rules[0].columnId !== null;
  }

  public showSortPopup(button: HTMLButtonElement): void {
    document.querySelector('.json-table-sort-menu')?.remove();

    const menuEl = document.createElement('div');
    menuEl.addClass('menu');
    menuEl.addClass('json-table-sort-menu');
    menuEl.addClass('json-table-popup-menu');

    const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
    const sortSection = scrollContainer.createDiv({ cls: 'bases-toolbar-section' });
    const sectionContent = sortSection.createDiv({ cls: 'bases-toolbar-section-content' });
    const queryContainer = sectionContent.createDiv({ cls: 'bases-query-container' });
    const sortGroup = queryContainer.createDiv({ cls: 'filter-group' });
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
          rowDiv.createSpan({ cls: 'conjunction', text: index === 0 ? 'sort by' : 'then by' });

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
            void (async () => {
              await this.view.saveTableData(this.data);
              this.triggerRender();
            })();
          });

          const directionSelect = expression.createEl('select', { cls: 'dropdown' });
          const ascOpt = directionSelect.createEl('option', { text: 'Ascending', value: 'asc' });
          const descOpt = directionSelect.createEl('option', { text: 'Descending', value: 'desc' });
          if (rule.direction === 'asc') ascOpt.selected = true;
          else descOpt.selected = true;
          directionSelect.addEventListener('click', (e) => e.stopPropagation());
          directionSelect.addEventListener('mousedown', (e) => e.stopPropagation());
          directionSelect.addEventListener('change', () => {
            rule.direction = directionSelect.value as 'asc' | 'desc';
            void (async () => {
              await this.view.saveTableData(this.data);
              this.triggerRender();
            })();
          });

          const rowActions = expression.createDiv({ cls: 'filter-row-actions' });
          const deleteBtn = rowActions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Remove sort' } });
          deleteBtn.appendChild(createIconElement(ICON_NAMES.trash, 14));
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rules = this.getCurrentSortRules();
            rules.splice(index, 1);
            this.setCurrentSortRules(rules);
            void (async () => {
              await this.view.saveTableData(this.data);
              this.triggerRender();
              rebuildSortRows();
            })();
          });
        });
      }
    };

    rebuildSortRows();

    const actionsDiv = sortGroup.createDiv({ cls: 'filter-group-actions' });
    const addSortBtn = actionsDiv.createDiv({ cls: 'text-icon-button', attr: { tabindex: '0' } });
    const addIcon = addSortBtn.createSpan({ cls: 'text-button-icon' });
    addIcon.appendChild(createIconElement(ICON_NAMES.plus, 14));
    addSortBtn.createSpan({ cls: 'text-button-label', text: 'Add sort' });

    addSortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const defaultColumnId = this.data.columns[0]?.id;
      if (!defaultColumnId) return;
      const currentRules = this.getCurrentSortRules();
      const existingIds = new Set(currentRules.map(r => r.id));
      currentRules.push({ id: generateSortId(existingIds), columnId: defaultColumnId, direction: 'asc' });
      this.setCurrentSortRules(currentRules);
      rebuildSortRows();
    });

    menuEl.addEventListener('click', (e) => e.stopPropagation());
    menuEl.addEventListener('mousedown', (e) => e.stopPropagation());

    document.body.appendChild(menuEl);
    positionPopup(menuEl, button, { align: 'auto' });

    const onOutsideClick = (ev: MouseEvent) => {
      if (!menuEl.contains(ev.target as Node) && ev.target !== button) cleanup();
    };
    setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
  }

  public getSortedRows(): AgentableRow[] {
    const rules = this.getCurrentSortRules();

    // No sort — return a shallow copy preserving insertion order
    if (rules.length === 0) return [...this.data.rows];

    const { columnId, direction } = rules[0];
    const sortColumn = this.data.columns.find(c => c.id === columnId);
    if (!sortColumn) return [...this.data.rows];

    const stripEmojis = (str: string): string =>
      str
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '')
        .replace(/️/g, '')
        .trim();

    const sortKeys = new Map<AgentableRow, number | string | null>();

    this.data.rows.forEach(row => {
      const rawValue = row.cells[columnId] ?? '';

      if (rawValue === '' || rawValue === null || rawValue === undefined) {
        sortKeys.set(row, null);
        return;
      }

      switch (sortColumn.type) {
        case 'date': {
          const ts = parseInt(String(rawValue), 10);
          sortKeys.set(row, isNaN(ts) ? 0 : ts);
          break;
        }
        case 'boolean':
        case 'checkbox':
          sortKeys.set(row, rawValue === 'true' || rawValue === true ? 1 : 0);
          break;
        case 'number': {
          const num = parseFloat(String(rawValue));
          sortKeys.set(row, isNaN(num) ? 0 : num);
          break;
        }
        default:
          sortKeys.set(row, stripEmojis(String(rawValue)).toLowerCase());
          break;
      }
    });

    return [...this.data.rows].sort((rowA, rowB) => {
      const valA = sortKeys.get(rowA) ?? null;
      const valB = sortKeys.get(rowB) ?? null;

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      // At this point valA and valB are non-null number | string
      let comparison = 0;
      if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA < valB ? -1 : valA > valB ? 1 : 0;
      }

      return direction === 'asc' ? comparison : -comparison;
    });
  }
}
