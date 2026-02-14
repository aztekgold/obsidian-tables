
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
import { IColumnEditor } from '../editors/IColumnEditor';
import { TextColumnEditor } from '../editors/TextColumnEditor';
import { DropdownColumnEditor } from '../editors/DropdownColumnEditor';
import { NoteLinkColumnEditor } from '../editors/NoteLinkColumnEditor';
import { DateColumnEditor } from '../editors/DateColumnEditor';
import { SortHandler } from '../SortHandler';
import { FilterHandler } from '../FilterHandler';
import { ICON_NAMES, createIconElement } from '../icons';
import { positionPopup } from '../utils/popup';

export const TYPE_ICONS: Record<string, string> = { // Exported for use in subclasses if needed
    text: ICON_NAMES.text,
    dropdown: ICON_NAMES.dropdown,
    multiselect: ICON_NAMES.multiselect,
    checkbox: ICON_NAMES.checkbox,
    date: ICON_NAMES.date,
    notelink: ICON_NAMES.link,
};

export abstract class AbstractTableRenderer {
    protected cellRenderers: Map<string, ICellRenderer>;
    protected columnEditors: Map<string, IColumnEditor>;
    protected isResizing: boolean = false;
    protected sortHandler: SortHandler;
    protected filterHandler: FilterHandler;
    protected activeViewId: string;
    protected isInline: boolean;
    protected settings: JsonTableSettings;

    constructor(
        protected container: Element,
        protected data: TableData,
        protected view: JsonTableView,
        isInline: boolean = false,
        settings: JsonTableSettings = DEFAULT_SETTINGS
    ) {
        this.isInline = isInline;
        this.settings = settings;

        if (!this.data.views || this.data.views.length === 0) {
            this.data.views = [{ id: 'default_' + Date.now(), name: 'Default', sort: [], filter: [] }];
        }
        this.activeViewId = this.data.views[0].id;

        this.cellRenderers = new Map();
        this.registerRenderers();
        this.columnEditors = new Map();
        this.registerColumnEditors();

        this.sortHandler = new SortHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
        this.filterHandler = new FilterHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
    }

    // --- Abstract Methods ---
    public abstract render(): void;
    protected abstract renderHeader(container: HTMLElement): void;
    protected abstract renderBody(container: HTMLElement, rowsToRender: CellData[][]): void;

    // --- Shared Methods ---

    protected getActiveView(): ViewDef {
        return this.data.views.find(v => v.id === this.activeViewId) || this.data.views[0];
    }

    protected setActiveView(viewId: string) {
        this.activeViewId = viewId;
        this.render();
    }

    protected createNewView() {
        const newViewId = 'view_' + Date.now();
        const newViewName = `View ${this.data.views.length + 1}`;
        this.data.views.push({
            id: newViewId,
            name: newViewName,
            sort: [],
            filter: []
        });
        this.activeViewId = newViewId;
        this.view.saveTableData(this.data);
        this.render();
    }

    protected deleteView(viewId: string) {
        if (this.data.views.length <= 1) {
            new Notice("Cannot delete the last view.");
            return;
        }
        const index = this.data.views.findIndex(v => v.id === viewId);
        if (index !== -1) {
            this.data.views.splice(index, 1);
            if (this.activeViewId === viewId) {
                this.activeViewId = this.data.views[0].id;
            }
            this.view.saveTableData(this.data);
            this.render();
        }
    }

    protected renameView(viewId: string, newName: string) {
        const view = this.data.views.find(v => v.id === viewId);
        if (view) {
            view.name = newName;
            this.view.saveTableData(this.data);
            this.render();
        }
    }

    protected registerRenderers() {
        this.cellRenderers.set('text', new TextRenderer());
        this.cellRenderers.set('checkbox', new CheckboxRenderer());
        this.cellRenderers.set('dropdown', new DropdownRenderer());
        this.cellRenderers.set('multiselect', new MultiSelectRenderer());
        this.cellRenderers.set('notelink', new NoteLinkRenderer());
        this.cellRenderers.set('date', new DateRenderer());
    }

    protected registerColumnEditors() {
        this.columnEditors.set('text', new TextColumnEditor());
        this.columnEditors.set('checkbox', new TextColumnEditor());
        this.columnEditors.set('dropdown', new DropdownColumnEditor());
        this.columnEditors.set('multiselect', new DropdownColumnEditor());
        this.columnEditors.set('notelink', new NoteLinkColumnEditor());
        this.columnEditors.set('date', new DateColumnEditor());
    }

    protected getVisibleColumns(): ColumnDef[] {
        const activeView = this.getActiveView();
        const hiddenCols = activeView.hiddenColumns || [];
        return this.data.columns.filter(col => !hiddenCols.includes(col.id));
    }

    // --- Shared Rendering Components ---

    protected renderRenameInput() {
        if (this.isInline) return;
        const renameContainer = this.container.createDiv({ cls: 'json-table-rename-container' });
        const currentFilePath = this.view.getFilePath();
        if (!currentFilePath) return;

        const fileName = currentFilePath.substring(currentFilePath.lastIndexOf('/') + 1);
        const nameWithoutExt = fileName.replace(/\.(table\.json|table\.md)$/, '');

        const renameInput = renameContainer.createEl('input', {
            type: 'text',
            cls: 'json-table-rename-input inline-title',
            value: nameWithoutExt,
            placeholder: 'Table name'
        });

        const handleRename = async () => {
            const newName = renameInput.value.trim();
            if (newName && newName !== nameWithoutExt) {
                const success = await this.view.renameFile(newName);
                if (!success) renameInput.value = nameWithoutExt;
            } else if (!newName) {
                renameInput.value = nameWithoutExt;
            }
        };

        renameInput.addEventListener('blur', handleRename);
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); renameInput.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); renameInput.value = nameWithoutExt; renameInput.blur(); }
        });
    }

    protected renderViewTabs() {
        const tabsContainer = this.container.createDiv({ cls: 'json-table-view-tabs' });
        this.data.views.forEach(view => {
            const tab = tabsContainer.createDiv({
                cls: `json-table-view-tab ${view.id === this.activeViewId ? 'is-active' : ''}`
            });
            const nameSpan = tab.createSpan({ text: view.name, cls: 'json-table-view-name' });

            tab.addEventListener('click', () => {
                if (this.activeViewId !== view.id) { this.setActiveView(view.id); }
            });

            tab.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const input = tab.createEl('input', { type: 'text', value: view.name, cls: 'json-table-view-rename-input' });
                nameSpan.hide(); input.focus(); input.select();

                const saveName = () => {
                    const newName = input.value.trim();
                    if (newName) { this.renameView(view.id, newName); }
                    else { nameSpan.show(); input.remove(); }
                };

                input.addEventListener('blur', saveName);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                    else if (e.key === 'Escape') { e.preventDefault(); nameSpan.show(); input.remove(); }
                });
            });

            if (this.data.views.length > 1) {
                const deleteBtn = tab.createDiv({ cls: 'json-table-view-delete' });
                deleteBtn.innerHTML = '&times;';
                deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteView(view.id); });
            }
        });

        const addBtn = tabsContainer.createDiv({ cls: 'json-table-view-add-btn', attr: { title: 'Add View' } });
        addBtn.innerHTML = '+';
        addBtn.addEventListener('click', () => { this.createNewView(); });
    }

    protected renderControls() {
        const controlsContainer = this.container.createDiv({ cls: 'json-table-controls' });
        const leftControls = controlsContainer.createDiv({ cls: 'json-table-controls-left' });
        const rightControls = controlsContainer.createDiv({ cls: 'json-table-controls-right' });

        // Sort
        const sortButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-sort-button', attr: { 'aria-label': 'Sort table' } });
        const sortIcon = createIconElement(ICON_NAMES.sort, 16, 'icon-sort');
        sortButton.appendChild(sortIcon); sortButton.appendText(' Sort');
        if (this.sortHandler.getCurrentSortRules().length > 0 && this.sortHandler.getCurrentSortRules()[0].columnId !== null) sortButton.addClass('json-table-btn--active');
        sortButton.addEventListener('click', (e) => { e.stopPropagation(); this.sortHandler.showSortPopup(sortButton); });

        // Filter
        const filterButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-filter-button', attr: { 'aria-label': 'Filter table' } });
        const filterIcon = createIconElement(ICON_NAMES.filter, 16, 'icon-filter');
        filterButton.appendChild(filterIcon); filterButton.appendText(' Filter');
        if (this.filterHandler.hasActiveFilters()) filterButton.addClass('json-table-btn--active');
        filterButton.addEventListener('click', (e) => { e.stopPropagation(); this.filterHandler.showFilterPopup(filterButton); });

        // Show/Hide
        const propsButton = leftControls.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-props-button', attr: { 'aria-label': 'Column visibility' } });
        const propsIcon = createIconElement(ICON_NAMES.eye, 16, 'icon-props');
        propsButton.appendChild(propsIcon); propsButton.appendText(' Show/Hide');
        propsButton.addEventListener('click', (e) => this.showPropertyVisibilityPopup(propsButton, e));

        // Settings
        const settingsButton = rightControls.createEl('button', { cls: 'json-table-btn json-table-btn--icon json-table-settings-button', attr: { 'aria-label': 'Table settings', title: 'Table settings' } });
        const settingsIcon = createIconElement(ICON_NAMES.moreVertical, 16, 'icon-settings');
        settingsButton.appendChild(settingsIcon);
        settingsButton.addEventListener('click', (e) => this.showSettingsPopup(settingsButton, e));

        return controlsContainer;
    }

    // --- Popups ---

    protected showPropertyVisibilityPopup(button: HTMLElement, e: MouseEvent) {
        e.stopPropagation();
        const activeView = this.getActiveView();
        if (!activeView.hiddenColumns) activeView.hiddenColumns = [];

        // Remove any existing popup
        document.querySelector('.json-table-props-menu')?.remove();

        // --- Build Bases-style menu panel ---
        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('json-table-props-menu');
        menuEl.style.position = 'fixed';
        menuEl.style.zIndex = '9999';
        menuEl.style.maxHeight = '400px';
        menuEl.style.width = '240px';

        // Scrollable content
        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
        const container = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

        // Search input
        const searchWrapper = container.createDiv({ cls: 'search-input-container' });
        const searchInput = searchWrapper.createEl('input', {
            type: 'search',
            placeholder: 'Filter properties...',
        });
        searchInput.spellcheck = false;
        searchInput.addEventListener('click', (ev) => ev.stopPropagation());
        searchInput.addEventListener('mousedown', (ev) => ev.stopPropagation());

        // Items container
        const itemsContainer = container.createDiv({ cls: 'bases-toolbar-items' });

        // Render items
        const renderItems = (filter: string = '') => {
            itemsContainer.empty();
            const filterLower = filter.toLowerCase();

            this.data.columns.forEach(col => {
                if (filter && !col.name.toLowerCase().includes(filterLower)) return;

                const isHidden = activeView.hiddenColumns!.includes(col.id);
                const itemEl = itemsContainer.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
                if (isHidden) itemEl.addClass('mod-hidden');

                // Info wrapper (icon + name) — LEFT side
                const info = itemEl.createDiv({ cls: 'bases-toolbar-menu-item-info' });
                const iconWrapper = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
                const iconName = TYPE_ICONS[col.type];
                if (iconName) {
                    setIcon(iconWrapper, iconName);
                }
                info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: col.name });

                // Checkbox — RIGHT side
                const checkbox = itemEl.createEl('input', { type: 'checkbox' });
                checkbox.checked = !isHidden;
                checkbox.style.pointerEvents = 'none';

                // Click handler — toggle visibility
                itemEl.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    if (isHidden) {
                        activeView.hiddenColumns = activeView.hiddenColumns!.filter(id => id !== col.id);
                    } else {
                        if (!activeView.hiddenColumns!.includes(col.id)) activeView.hiddenColumns!.push(col.id);
                    }
                    await this.view.saveTableData(this.data);
                    this.render();
                    renderItems(searchInput.value);
                });
            });
        };

        renderItems();

        // Filter as user types
        searchInput.addEventListener('input', () => {
            renderItems(searchInput.value);
        });

        // Position and insert into DOM
        document.body.appendChild(menuEl);
        positionPopup(menuEl, button, { align: 'auto' });

        // Cleanup on outside click
        const onOutsideClick = (ev: MouseEvent) => {
            if (!menuEl.contains(ev.target as Node) && ev.target !== button) {
                cleanup();
            }
        };
        const cleanup = () => {
            menuEl.remove();
            document.removeEventListener('click', onOutsideClick, true);
        };
        setTimeout(() => {
            document.addEventListener('click', onOutsideClick, true);
        }, 0);

        setTimeout(() => searchInput.focus(), 50);
    }

    protected showSettingsPopup(button: HTMLButtonElement, e: MouseEvent) {
        e.stopPropagation();

        // Remove any existing popup
        document.querySelector('.json-table-settings-menu')?.remove();

        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('json-table-settings-menu');
        menuEl.style.position = 'fixed';
        menuEl.style.zIndex = '9999';
        menuEl.style.width = '220px';

        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
        const container = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });
        const itemsContainer = container.createDiv({ cls: 'bases-toolbar-items' });

        // Export Table as CSV
        const exportTableItem = itemsContainer.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
        const exportTableInfo = exportTableItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
        const exportTableIcon = exportTableInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
        setIcon(exportTableIcon, 'download');
        exportTableInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Export Table as CSV' });
        exportTableItem.addEventListener('click', () => { cleanup(); this.exportToCsv(); });

        // Export View to CSV
        const exportViewItem = itemsContainer.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
        const exportViewInfo = exportViewItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
        const exportViewIcon = exportViewInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
        setIcon(exportViewIcon, 'download');
        exportViewInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Export View to CSV' });
        exportViewItem.addEventListener('click', () => { cleanup(); this.exportViewToCsv(); });

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

    protected showEditColumnDialog(headerCell: HTMLElement, column: ColumnDef, data: TableData, colIndex: number) {
        // Remove any existing popup
        document.querySelector('.json-table-column-menu')?.remove();

        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('json-table-column-menu');
        menuEl.style.position = 'fixed';
        menuEl.style.zIndex = '9999';
        menuEl.style.width = '220px';

        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
        const menuContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

        // --- Section 1: Rename ---
        const renameSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        const searchWrapper = renameSection.createDiv({ cls: 'search-input-container' });
        const renameInput = searchWrapper.createEl('input', {
            type: 'text',
            value: column.name,
            placeholder: 'Column Name'
        });
        renameInput.spellcheck = false;
        renameInput.addEventListener('click', (ev) => ev.stopPropagation());
        renameInput.addEventListener('mousedown', (ev) => ev.stopPropagation());
        renameInput.addEventListener('keydown', async (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                const newName = renameInput.value.trim();
                if (newName && newName !== column.name) {
                    column.name = newName;
                    await this.view.saveTableData(data);
                    this.render();
                }
                cleanup();
            }
        });

        // Divider after rename
        menuContainer.createEl('div', { cls: 'menu-separator' });

        // --- Section 2: Change Type (drill-down item) ---
        const changeTypeSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        const changeTypeItems = changeTypeSection.createDiv({ cls: 'bases-toolbar-items' });
        const changeTypeItem = changeTypeItems.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
        const changeTypeInfo = changeTypeItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
        const changeTypeIcon = changeTypeInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
        setIcon(changeTypeIcon, ICON_NAMES.switch);
        changeTypeInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Change Type' });
        const chevronIcon = changeTypeItem.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
        setIcon(chevronIcon, 'chevron-right');

        const types = [
            { value: 'text', label: 'Text', icon: ICON_NAMES.text },
            { value: 'checkbox', label: 'Checkbox', icon: ICON_NAMES.checkbox },
            { value: 'dropdown', label: 'Dropdown', icon: ICON_NAMES.dropdown },
            { value: 'multiselect', label: 'Multi-select', icon: ICON_NAMES.multiselect },
            { value: 'notelink', label: 'Note Link', icon: ICON_NAMES.link },
            { value: 'date', label: 'Date', icon: ICON_NAMES.date },
        ];

        changeTypeItem.addEventListener('click', () => {
            // Replace menu content with type picker
            scrollContainer.empty();
            const typeContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

            // Back button
            const backItem = typeContainer.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
            const backInfo = backItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
            const backIcon = backInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
            setIcon(backIcon, 'arrow-left');
            backInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Back' });
            backItem.addEventListener('click', () => {
                // Re-create the main menu by closing and re-opening
                cleanup();
                this.showEditColumnDialog(headerCell, column, data, colIndex);
            });

            // Type section
            const typeSection = typeContainer.createDiv({ cls: 'bases-toolbar-section' });
            typeSection.createDiv({ cls: 'bases-toolbar-section-header', text: 'Type' });
            const typeSectionContent = typeSection.createDiv({ cls: 'bases-toolbar-section-content' });
            const typeItemsEl = typeSectionContent.createDiv({ cls: 'bases-toolbar-items' });

            types.forEach(t => {
                const isActive = column.type === t.value;
                const item = typeItemsEl.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
                if (isActive) item.addClass('is-selected');

                const info = item.createDiv({ cls: 'bases-toolbar-menu-item-info' });
                const iconWrap = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
                setIcon(iconWrap, t.icon);
                info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: t.label });

                if (isActive) {
                    const checkEl = item.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
                    setIcon(checkEl, 'check');
                }

                item.addEventListener('click', async () => {
                    if (isActive) return;
                    column.type = t.value;

                    if (t.value === 'dropdown' || t.value === 'multiselect') {
                        if (!column.typeOptions || !('options' in column.typeOptions)) {
                            column.typeOptions = {
                                options: [
                                    { value: 'Option 1', style: 'grey' },
                                    { value: 'Option 2', style: 'grey' },
                                    { value: 'Option 3', style: 'grey' }
                                ]
                            };
                        }
                    } else if (t.value === 'date') {
                        column.typeOptions = { dateFormat: 'YYYY/MM/DD' };
                    } else {
                        column.typeOptions = {};
                    }

                    await this.view.saveTableData(data);
                    this.render();
                    cleanup();
                });
            });
        });

        // --- Section 3: Actions ---
        const actionsSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        const actionItems = actionsSection.createDiv({ cls: 'bases-toolbar-items' });

        // Wrap Text (conditional)
        if (column.type === 'text' || column.type === 'notelink') {
            const isWrapped = (column.typeOptions as any)?.wrap === true;
            const wrapItem = actionItems.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });

            const wrapInfo = wrapItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
            const wrapIcon = wrapInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
            setIcon(wrapIcon, ICON_NAMES.wrapText);
            wrapInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Wrap Text' });

            // Checkbox on right
            const wrapCheckbox = wrapItem.createEl('input', { type: 'checkbox' });
            wrapCheckbox.checked = isWrapped;
            wrapCheckbox.style.pointerEvents = 'none';

            wrapItem.addEventListener('click', async () => {
                const currentOpts = column.typeOptions as any || {};
                column.typeOptions = { ...currentOpts, wrap: !isWrapped };
                await this.view.saveTableData(data);
                this.render();
                cleanup();
            });
        }

        // Hide Column
        const hideItem = actionItems.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
        const hideInfo = hideItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
        const hideIcon = hideInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
        setIcon(hideIcon, ICON_NAMES.eyeOff);
        hideInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Hide Column' });
        hideItem.addEventListener('click', async () => {
            const activeView = this.getActiveView();
            if (!activeView.hiddenColumns) activeView.hiddenColumns = [];
            activeView.hiddenColumns.push(column.id);
            await this.view.saveTableData(data);
            this.render();
            cleanup();
        });

        // Divider before delete
        menuContainer.createEl('div', { cls: 'menu-separator' });

        // Delete Column (destructive)
        const deleteItem = actionItems.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item mod-warning' });
        const deleteInfo = deleteItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
        const deleteIcon = deleteInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
        setIcon(deleteIcon, ICON_NAMES.trash);
        deleteInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Delete Column' });
        deleteItem.addEventListener('click', async () => {
            data.columns.splice(colIndex, 1);
            data.rows.forEach(row => {
                const i = row.findIndex(c => c.column === column.id);
                if (i !== -1) row.splice(i, 1);
            });
            await this.view.saveTableData(data);
            this.render();
            cleanup();
        });

        // Position and insert
        document.body.appendChild(menuEl);
        positionPopup(menuEl, headerCell, { align: 'auto' });

        const onOutsideClick = (ev: MouseEvent) => {
            if (!menuEl.contains(ev.target as Node) && ev.target !== headerCell) cleanup();
        };
        const cleanup = () => {
            menuEl.remove();
            document.removeEventListener('click', onOutsideClick, true);
        };
        setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
        setTimeout(() => renameInput.focus(), 50);
    }



    protected showAddColumnDialog(headerCell: HTMLElement, buttonDiv: HTMLElement, data: TableData, onClose: () => void) {
        // Remove any existing add column popup
        document.querySelector('.json-table-add-column-menu')?.remove();

        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('json-table-add-column-menu');
        menuEl.style.position = 'fixed';
        menuEl.style.zIndex = '9999';
        menuEl.style.width = '200px';

        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
        const menuContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

        // --- Name input ---
        const nameSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        const searchWrapper = nameSection.createDiv({ cls: 'search-input-container' });
        const nameInput = searchWrapper.createEl('input', {
            type: 'text',
            placeholder: 'Column name'
        });
        nameInput.spellcheck = false;
        nameInput.addEventListener('click', (ev) => ev.stopPropagation());
        nameInput.addEventListener('mousedown', (ev) => ev.stopPropagation());

        // --- Type items ---
        const typeSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        typeSection.createDiv({ cls: 'bases-toolbar-section-header', text: 'Type' });
        const typeSectionContent = typeSection.createDiv({ cls: 'bases-toolbar-section-content' });
        const typeItemsEl = typeSectionContent.createDiv({ cls: 'bases-toolbar-items' });

        const types = [
            { type: 'text' as const, name: 'Text', icon: ICON_NAMES.text },
            { type: 'checkbox' as const, name: 'Checkbox', icon: ICON_NAMES.checkbox },
            { type: 'dropdown' as const, name: 'Dropdown', icon: ICON_NAMES.dropdown },
            { type: 'multiselect' as const, name: 'Multi-select', icon: ICON_NAMES.multiselect },
            { type: 'notelink' as const, name: 'Note Link', icon: ICON_NAMES.link },
            { type: 'date' as const, name: 'Date', icon: ICON_NAMES.date },
        ];
        const defaultDropdownOptions = [
            { value: 'To Do', style: 'red' }, { value: 'In Progress', style: 'blue' }, { value: 'Done', style: 'green' }
        ];

        const cleanup = () => {
            menuEl.remove();
            document.removeEventListener('click', onOutsideClick, true);
            onClose();
        };

        const addColumn = async (columnType: string, typeName: string, extraProps: Record<string, any> = {}) => {
            let columnName = nameInput.value.trim() || typeName;
            const columnId = 'col_' + Date.now();
            data.columns.push({ id: columnId, name: columnName, type: columnType, width: 150, ...extraProps });
            data.rows.forEach(row => row.push({ column: columnId, value: '' }));
            await this.view.saveTableData(data);
            this.render();
            cleanup();
        };

        types.forEach(({ type, name, icon }) => {
            const item = typeItemsEl.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
            const info = item.createDiv({ cls: 'bases-toolbar-menu-item-info' });
            const iconWrap = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
            setIcon(iconWrap, icon);
            info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: name });

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                let extraProps: Record<string, any> = {};
                if (type === 'dropdown' || type === 'multiselect') extraProps = { typeOptions: { options: defaultDropdownOptions } };
                else if (type === 'date') extraProps = { dateFormat: 'YYYY/MM/DD' };
                addColumn(type, name, extraProps);
            });
        });

        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); addColumn('text', 'Text', {}); }
            e.stopPropagation();
        });

        // Prevent closing on interaction
        menuEl.addEventListener('click', (e) => e.stopPropagation());
        menuEl.addEventListener('mousedown', (e) => e.stopPropagation());

        // Position and insert
        document.body.appendChild(menuEl);
        positionPopup(menuEl, buttonDiv, { align: 'auto' });

        const onOutsideClick = (ev: MouseEvent) => {
            if (!menuEl.contains(ev.target as Node) && ev.target !== buttonDiv) cleanup();
        };
        setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
        setTimeout(() => nameInput.focus(), 50);
    }

    // --- CSV Export ---

    protected exportToCsv() {
        const columns = this.data.columns;
        const rows = this.data.rows;
        this.generateAndDownloadCsv(columns, rows, 'table_export');
    }

    protected exportViewToCsv() {
        const visibleColumns = this.getVisibleColumns();
        const rowsToExport = this.filterHandler.getFilteredRows();
        this.generateAndDownloadCsv(visibleColumns, rowsToExport, 'view_export');
    }

    protected generateAndDownloadCsv(columns: any[], rows: any[][], defaultFilename: string) {
        if (!columns || !rows) { new Notice('No data to export.'); return; }

        const csvRows: string[] = [];
        const headerRow = columns.map(col => this.escapeCsvField(col.name)).join(',');
        csvRows.push(headerRow);
        rows.forEach(row => {
            const rowData = columns.map(col => {
                const cell = row.find((c: any) => c.column === col.id);
                return this.escapeCsvField(cell?.value || '');
            });
            csvRows.push(rowData.join(','));
        });

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const filename = this.view.getDisplayText() || defaultFilename;
        const suffix = defaultFilename === 'view_export' ? '_view' : '';
        link.setAttribute('download', `${filename}${suffix}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    protected escapeCsvField(field: string): string {
        if (field === null || field === undefined) return '';
        let stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            stringField = stringField.replace(/"/g, '""');
            return `"${stringField}"`;
        }
        return stringField;
    }
}
