
import { TableData, ColumnDef, AgentableRow, ViewDef, JsonTableSettings, DEFAULT_SETTINGS } from '../types';
import { JsonTableView } from '../JsonTableView';
// (no direct obsidian imports needed here)
import { ICellRenderer } from './ICellRenderer';
import { TextRenderer } from './TextRenderer';
import { CheckboxRenderer } from './CheckboxRenderer';
import { DropdownRenderer } from './DropdownRenderer';
import { MultiSelectRenderer } from './MultiSelectRenderer';
import { NoteLinkRenderer } from './NoteLinkRenderer';
import { UrlRenderer } from './UrlRenderer';
import { EmailRenderer } from './EmailRenderer';
import { DateRenderer } from './DateRenderer';
import { NumberRenderer } from './NumberRenderer';
import { FormulaRenderer } from './FormulaRenderer';
import { SortHandler } from '../SortHandler';
import { FilterHandler } from '../FilterHandler';
import { SearchHandler } from '../SearchHandler';
import { FormulaHandler } from '../FormulaHandler';
import { ICON_NAMES, createIconElement } from '../icons';
import { generateCsv, downloadCsv } from '../utils/csv';
import { createDefaultView } from '../utils/fileUtils';
import { generateRowId } from '../utils/migrateUtils';
import { isMultiSelectColumn } from '../utils/columnUtils';
import { ViewManager, IViewManagerHost } from './ViewManager';
import { TableMenuManager, IMenuManagerHost } from './TableMenuManager';

export const TYPE_ICONS: Record<string, string> = {
    text: ICON_NAMES.text,
    select: ICON_NAMES.dropdown,
    dropdown: ICON_NAMES.dropdown,   // legacy alias
    multiselect: ICON_NAMES.multiselect, // legacy alias
    boolean: ICON_NAMES.checkbox,
    checkbox: ICON_NAMES.checkbox,   // legacy alias
    date: ICON_NAMES.date,
    link: ICON_NAMES.link,
    wikilink: ICON_NAMES.link,   // legacy alias
    notelink: ICON_NAMES.link,   // legacy alias
    url: ICON_NAMES.url,
    email: ICON_NAMES.email,
    number: ICON_NAMES.number,
    formula: ICON_NAMES.formula,
    function: ICON_NAMES.formula, // legacy alias
};

export abstract class AbstractTableRenderer implements IViewManagerHost, IMenuManagerHost {
    protected cellRenderers: Map<string, ICellRenderer>;
    protected isResizing: boolean = false;
    protected sortHandler: SortHandler;
    protected filterHandler: FilterHandler;
    protected searchHandler: SearchHandler;
    public formulaHandler: FormulaHandler;
    // Set at the start of render() when the search box currently has real DOM
    // focus, so renderControls() can restore it after the DOM is rebuilt.
    // Deliberately re-derived from document.activeElement every render instead
    // of tracked via focus/blur listeners, so a stale value can never cause an
    // unrelated re-render to steal focus back into the search box.
    protected pendingSearchFocus: { cursor: number | null } | null = null;
    public activeViewId: string;
    public isInline: boolean;
    public lockToView: boolean = false;
    protected settings: JsonTableSettings;
    protected viewManager: ViewManager;
    protected menuManager: TableMenuManager;
    public TYPE_ICONS = TYPE_ICONS;

    constructor(
        public container: Element,
        public data: TableData,
        public view: JsonTableView,
        isInline: boolean = false,
        settings: JsonTableSettings = DEFAULT_SETTINGS
    ) {
        this.isInline = isInline;
        this.settings = settings;

        if (!this.data.views || this.data.views.length === 0) {
            this.data.views = [createDefaultView()];
        }
        this.activeViewId = this.data.views[0].id;
        this.viewManager = new ViewManager(this);
        this.menuManager = new TableMenuManager(this);

        this.sortHandler = new SortHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
        this.filterHandler = new FilterHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
        this.searchHandler = new SearchHandler();
        // Constructed before registerRenderers() since FormulaRenderer takes
        // it directly (not through the shared ICellRenderer interface, so
        // the other 7 renderers don't need a parameter only it uses).
        this.formulaHandler = new FormulaHandler(this.data);

        this.cellRenderers = new Map();
        this.registerRenderers();
    }

    // --- Abstract Methods ---
    public abstract render(): void;
    protected abstract renderHeader(container: HTMLElement): void;
    protected abstract renderBody(container: HTMLElement, rowsToRender: AgentableRow[]): void;
    public abstract getHeaderCell(visualIndex: number): HTMLElement | null; // For refreshing menu position

    // --- Shared Methods ---

    public getActiveView(): ViewDef {
        return this.viewManager.getActiveView();
    }

    public setActiveView(viewId: string) {
        this.activeViewId = viewId;
        this.render();
    }

    protected createNewView() {
        this.viewManager.createNewView();
    }

    protected deleteView(viewId: string) {
        this.viewManager.deleteView(viewId);
    }

    protected renameView(viewId: string, newName: string) {
        this.viewManager.renameView(viewId, newName);
    }

    protected registerRenderers() {
        this.cellRenderers.set('text', new TextRenderer());
        this.cellRenderers.set('boolean', new CheckboxRenderer());
        this.cellRenderers.set('checkbox', new CheckboxRenderer());    // legacy alias
        this.cellRenderers.set('select', new DropdownRenderer());
        this.cellRenderers.set('dropdown', new DropdownRenderer());    // legacy alias
        this.cellRenderers.set('multiselect', new MultiSelectRenderer()); // legacy alias
        this.cellRenderers.set('link', new NoteLinkRenderer());
        this.cellRenderers.set('wikilink', new NoteLinkRenderer());  // legacy alias
        this.cellRenderers.set('notelink', new NoteLinkRenderer());  // legacy alias
        this.cellRenderers.set('url', new UrlRenderer());
        this.cellRenderers.set('email', new EmailRenderer());
        this.cellRenderers.set('date', new DateRenderer());
        this.cellRenderers.set('number', new NumberRenderer());
        const formulaRenderer = new FormulaRenderer(this.formulaHandler);
        this.cellRenderers.set('formula', formulaRenderer);
        this.cellRenderers.set('function', formulaRenderer); // legacy alias
    }

    protected getCellRenderer(col: ColumnDef): ICellRenderer | undefined {
        if (isMultiSelectColumn(col)) {
            return this.cellRenderers.get('multiselect');
        }
        return this.cellRenderers.get(col.type);
    }

    protected getVisibleColumns(): ColumnDef[] {
        const activeView = this.getActiveView();
        const hiddenCols = activeView.hiddenColumns || [];
        return this.data.columns.filter(col => !hiddenCols.includes(col.id));
    }

    protected getSearchFilteredRows(rows: AgentableRow[]): AgentableRow[] {
        return this.searchHandler.getSearchedRows(rows, this.getVisibleColumns());
    }

    protected async addNewRow(): Promise<void> {
        const newRow: AgentableRow = {
            id: generateRowId(),
            cells: Object.fromEntries(this.data.columns.map(col => [col.id, '']))
        };
        this.data.rows.push(newRow);
        await this.view.saveTableData(this.data);
        this.render();
    }

    // --- Shared Rendering Components ---

    protected renderRenameInput() {
        this.viewManager.renderRenameInput();
    }

    protected renderViewTabs() {
        this.viewManager.renderViewTabs();
    }

    protected renderControls() {
        const controlsContainer = this.container.createDiv({ cls: 'json-table-controls' });
        const leftControls = controlsContainer.createDiv({ cls: 'json-table-controls-left' });
        const rightControls = controlsContainer.createDiv({ cls: 'json-table-controls-right' });

        // Sort
        const sortButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-sort-button', attr: { 'aria-label': 'Sort table' } });
        const sortIcon = createIconElement(ICON_NAMES.sort, 14, 'icon-sort');
        sortButton.appendChild(sortIcon); sortButton.createSpan({ cls: 'json-table-btn-label', text: ' Sort' });
        if (this.sortHandler.getCurrentSortRules().length > 0 && this.sortHandler.getCurrentSortRules()[0].columnId !== null) sortButton.addClass('json-table-btn--active');
        sortButton.addEventListener('click', (e) => { e.stopPropagation(); this.sortHandler.showSortPopup(sortButton); });

        // Filter
        const filterButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-filter-button', attr: { 'aria-label': 'Filter table' } });
        const filterIcon = createIconElement(ICON_NAMES.filter, 14, 'icon-filter');
        filterButton.appendChild(filterIcon); filterButton.createSpan({ cls: 'json-table-btn-label', text: ' Filter' });
        if (this.filterHandler.hasActiveFilters()) filterButton.addClass('json-table-btn--active');
        filterButton.addEventListener('click', (e) => { e.stopPropagation(); this.filterHandler.showFilterPopup(filterButton); });

        // Show/Hide
        const propsButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-props-button', attr: { 'aria-label': 'Column visibility' } });
        const propsIcon = createIconElement(ICON_NAMES.eye, 14, 'icon-props');
        propsButton.appendChild(propsIcon); propsButton.createSpan({ cls: 'json-table-btn-label', text: ' Show/hide' });
        propsButton.addEventListener('click', (e) => this.showPropertyVisibilityPopup(propsButton, e));

        // Search
        const searchContainer = leftControls.createDiv({ cls: 'json-table-search-container' });
        searchContainer.appendChild(createIconElement(ICON_NAMES.search, 14, 'icon-search'));
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            cls: 'json-table-search-input',
            attr: { placeholder: 'Search rows...' },
        });
        searchInput.value = this.searchHandler.getQuery();
        searchInput.addEventListener('click', (e) => e.stopPropagation());
        searchInput.addEventListener('mousedown', (e) => e.stopPropagation());

        let searchDebounceTimer: ReturnType<typeof setTimeout>;
        searchInput.addEventListener('input', () => {
            this.searchHandler.setQuery(searchInput.value);
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => this.render(), 200);
        });

        // Restore focus/cursor only if the search box truly had focus right
        // before this render rebuilt the DOM (see pendingSearchFocus above).
        if (this.pendingSearchFocus) {
            searchInput.focus();
            if (typeof this.pendingSearchFocus.cursor === 'number') {
                searchInput.setSelectionRange(this.pendingSearchFocus.cursor, this.pendingSearchFocus.cursor);
            }
        }

        // Add Row
        const addRowButton = rightControls.createEl('button', { cls: 'json-table-btn json-table-btn--icon json-table-add-row-button', attr: { 'aria-label': 'Add row', title: 'Add row' } });
        addRowButton.appendChild(createIconElement(ICON_NAMES.plus, 14, 'icon-add-row'));
        addRowButton.addEventListener('click', (e) => { e.stopPropagation(); void this.addNewRow(); });

        // Settings
        const settingsButton = rightControls.createEl('button', { cls: 'json-table-btn json-table-btn--icon json-table-settings-button', attr: { 'aria-label': 'Table settings', title: 'Table settings' } });
        const settingsIcon = createIconElement(ICON_NAMES.moreVertical, 14, 'icon-settings');
        settingsButton.appendChild(settingsIcon);
        settingsButton.addEventListener('click', (e) => this.showSettingsPopup(settingsButton, e));

        return controlsContainer;
    }

    // --- Popups ---

    protected showPropertyVisibilityPopup(button: HTMLElement, e: MouseEvent) {
        this.menuManager.showPropertyVisibilityPopup(button, e);
    }

    protected showSettingsPopup(button: HTMLButtonElement, e: MouseEvent) {
        this.menuManager.showSettingsPopup(button, e);
    }

    protected showEditColumnDialog(headerCell: HTMLElement, column: ColumnDef, data: TableData, colIndex: number, deepLink?: { view: 'option-edit', optionIndex: number }) {
        this.menuManager.showEditColumnDialog(headerCell, column, data, colIndex, deepLink);
    }

    protected showAddColumnDialog(headerCell: HTMLElement, buttonDiv: HTMLElement, data: TableData, onClose: () => void) {
        this.menuManager.showAddColumnDialog(headerCell, buttonDiv, data, onClose);
    }

    // --- CSV Export ---

    public exportToCsv() {
        if (this.formulaHandler.recomputeAll() && !this.isInline) {
            void this.view.saveTableData(this.data);
        }
        const csvContent = generateCsv(this.data.columns, this.data.rows);
        const filename = (this.view.getDisplayText() || 'table_export') + '.csv';
        downloadCsv(filename, csvContent);
    }

    public exportViewToCsv() {
        if (this.formulaHandler.recomputeAll() && !this.isInline) {
            void this.view.saveTableData(this.data);
        }
        const rows = this.getSearchFilteredRows(this.filterHandler.getFilteredRows(this.sortHandler.getSortedRows()));
        const csvContent = generateCsv(this.getVisibleColumns(), rows);
        const filename = (this.view.getDisplayText() || 'view_export') + '_view.csv';
        downloadCsv(filename, csvContent);
    }
}
