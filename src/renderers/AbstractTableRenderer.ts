
import { TableData, ColumnDef, CellData, ViewDef, JsonTableSettings, DEFAULT_SETTINGS } from '../types';
import { JsonTableView } from '../JsonTableView';
import { Notice, setIcon } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { TextRenderer } from './TextRenderer';
import { CheckboxRenderer } from './CheckboxRenderer';
import { DropdownRenderer } from './DropdownRenderer';
import { MultiSelectRenderer } from './MultiSelectRenderer';
import { NoteLinkRenderer } from './NoteLinkRenderer';
import { DateRenderer } from './DateRenderer';
import { NumberRenderer } from './NumberRenderer';
import { SortHandler } from '../SortHandler';
import { FilterHandler } from '../FilterHandler';
import { ICON_NAMES, createIconElement } from '../icons';
import { positionPopup } from '../utils/popup';
import { generateCsv, downloadCsv } from '../utils/csv';
import { ViewManager, IViewManagerHost } from './ViewManager';
import { TableMenuManager, IMenuManagerHost } from './TableMenuManager';

export const TYPE_ICONS: Record<string, string> = { // Exported for use in subclasses if needed
    text: ICON_NAMES.text,
    dropdown: ICON_NAMES.dropdown,
    multiselect: ICON_NAMES.multiselect,
    checkbox: ICON_NAMES.checkbox,
    date: ICON_NAMES.date,
    notelink: ICON_NAMES.link,
    number: ICON_NAMES.number,
};

export abstract class AbstractTableRenderer implements IViewManagerHost, IMenuManagerHost {
    protected cellRenderers: Map<string, ICellRenderer>;
    protected isResizing: boolean = false;
    protected sortHandler: SortHandler;
    protected filterHandler: FilterHandler;
    public activeViewId: string;
    public isInline: boolean;
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
            this.data.views = [{ id: 'default_' + Date.now(), name: 'Default', sort: [], filter: [] }];
        }
        this.activeViewId = this.data.views[0].id;
        this.viewManager = new ViewManager(this);
        this.menuManager = new TableMenuManager(this);

        this.cellRenderers = new Map();
        this.registerRenderers();

        this.sortHandler = new SortHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
        this.filterHandler = new FilterHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
    }

    // --- Abstract Methods ---
    public abstract render(): void;
    protected abstract renderHeader(container: HTMLElement): void;
    protected abstract renderBody(container: HTMLElement, rowsToRender: CellData[][]): void;
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
        this.cellRenderers.set('checkbox', new CheckboxRenderer());
        this.cellRenderers.set('dropdown', new DropdownRenderer());
        this.cellRenderers.set('multiselect', new MultiSelectRenderer());
        this.cellRenderers.set('notelink', new NoteLinkRenderer());
        this.cellRenderers.set('date', new DateRenderer());
        this.cellRenderers.set('number', new NumberRenderer());
    }

    protected getVisibleColumns(): ColumnDef[] {
        const activeView = this.getActiveView();
        const hiddenCols = activeView.hiddenColumns || [];
        return this.data.columns.filter(col => !hiddenCols.includes(col.id));
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
        sortButton.appendChild(sortIcon); sortButton.appendText(' Sort');
        if (this.sortHandler.getCurrentSortRules().length > 0 && this.sortHandler.getCurrentSortRules()[0].columnId !== null) sortButton.addClass('json-table-btn--active');
        sortButton.addEventListener('click', (e) => { e.stopPropagation(); this.sortHandler.showSortPopup(sortButton); });

        // Filter
        const filterButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-filter-button', attr: { 'aria-label': 'Filter table' } });
        const filterIcon = createIconElement(ICON_NAMES.filter, 14, 'icon-filter');
        filterButton.appendChild(filterIcon); filterButton.appendText(' Filter');
        if (this.filterHandler.hasActiveFilters()) filterButton.addClass('json-table-btn--active');
        filterButton.addEventListener('click', (e) => { e.stopPropagation(); this.filterHandler.showFilterPopup(filterButton); });

        // Show/Hide
        const propsButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-props-button', attr: { 'aria-label': 'Column visibility' } });
        const propsIcon = createIconElement(ICON_NAMES.eye, 14, 'icon-props');
        propsButton.appendChild(propsIcon); propsButton.appendText(' Show/Hide');
        propsButton.addEventListener('click', (e) => this.showPropertyVisibilityPopup(propsButton, e));

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
        const csvContent = generateCsv(this.data.columns, this.data.rows);
        const filename = (this.view.getDisplayText() || 'table_export') + '.csv';
        downloadCsv(filename, csvContent);
    }

    public exportViewToCsv() {
        const csvContent = generateCsv(this.getVisibleColumns(), this.filterHandler.getFilteredRows());
        const filename = (this.view.getDisplayText() || 'view_export') + '_view.csv';
        downloadCsv(filename, csvContent);
    }
}
