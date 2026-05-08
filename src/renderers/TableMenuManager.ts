// src/renderers/TableMenuManager.ts

import { TableData, ColumnDef, ViewDef } from '../types';
import { JsonTableView } from '../JsonTableView';
import { ICON_NAMES } from '../icons';
import { setIcon, Notice } from 'obsidian';
import { positionPopup, attachPopupCleanup } from '../utils/popup';
import { generateColId } from '../utils/migrateUtils';

export interface IMenuManagerHost {
    data: TableData;
    view: JsonTableView;
    render(): void;
    getActiveView(): ViewDef;
    getHeaderCell(index: number): HTMLElement | null;
    exportToCsv(): void;
    exportViewToCsv(): void;
    TYPE_ICONS: Record<string, string>;
}

export class TableMenuManager {
    constructor(private host: IMenuManagerHost) { }

    public showPropertyVisibilityPopup(button: HTMLElement, e: MouseEvent) {
        e.stopPropagation();
        let cleanup: () => void = () => { };
        const activeView = this.host.getActiveView();
        if (!activeView.hiddenColumns) activeView.hiddenColumns = [];

        // Remove any existing popup
        document.querySelector('.json-table-props-menu')?.remove();

        // --- Build Bases-style menu panel ---
        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('json-table-props-menu');
        menuEl.addClass('json-table-popup-menu');
        menuEl.addClass('json-table-menu-width-240');
        menuEl.addClass('json-table-menu-max-height-400');

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
        const itemsContainer = this.createMenuSection(container);

        // Render items
        const renderItems = (filter: string = '') => {
            itemsContainer.empty();
            const filterLower = filter.toLowerCase();

            this.host.data.columns.forEach(col => {
                if (filter && !col.name.toLowerCase().includes(filterLower)) return;

                const isHidden = activeView.hiddenColumns!.includes(col.id);
                const isVisible = !isHidden;

                // Manual checkbox item creation
                const item = itemsContainer.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });

                // Icon
                const info = item.createDiv({ cls: 'bases-toolbar-menu-item-info' });
                const iconWrapper = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
                setIcon(iconWrapper, this.host.TYPE_ICONS[col.type] || ICON_NAMES.text);

                // Name
                info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: col.name });

                // Checkbox (replacing the check icon)
                const checkboxWrapper = item.createDiv({ cls: 'bases-toolbar-menu-item-icon' });
                const checkbox = checkboxWrapper.createEl('input', { type: 'checkbox' });
                checkbox.checked = isVisible;

                // Prevent checkbox click from bubbling efficiently or handle it
                checkbox.onclick = (e) => e.stopPropagation();

                // Handler
                const toggleVisibility = async () => {
                    if (isVisible) {
                        // It was visible, now hidden
                        if (!activeView.hiddenColumns!.includes(col.id)) activeView.hiddenColumns!.push(col.id);
                    } else {
                        // It was hidden, now visible
                        activeView.hiddenColumns = activeView.hiddenColumns!.filter(id => id !== col.id);
                    }
                    await this.host.view.saveTableData(this.host.data);
                    this.host.render();
                    renderItems(searchInput.value);
                };

                checkbox.onchange = toggleVisibility;
                item.onclick = (e) => {
                    e.stopPropagation();
                    checkbox.checked = !checkbox.checked;
                    toggleVisibility();
                };
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
        attachPopupCleanup(menuEl, button);

        setTimeout(() => searchInput.focus(), 50);
    }

    public showSettingsPopup(button: HTMLButtonElement, e: MouseEvent) {
        e.stopPropagation();
        let cleanup: () => void = () => { };

        // Remove any existing popup
        document.querySelector('.json-table-settings-menu')?.remove();

        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('json-table-settings-menu');
        menuEl.addClass('json-table-popup-menu');
        menuEl.addClass('json-table-menu-width-220');

        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
        const container = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });
        const itemsContainer = this.createMenuSection(container);

        // Export Table as CSV
        this.createMenuItem(itemsContainer, 'download', 'Export table as CSV', () => {
            cleanup();
            this.host.exportToCsv();
        });

        // Export View to CSV
        this.createMenuItem(itemsContainer, 'download', 'Export view to CSV', () => {
            cleanup();
            this.host.exportViewToCsv();
        });

        // Position and insert
        document.body.appendChild(menuEl);
        positionPopup(menuEl, button, { align: 'auto' });

        attachPopupCleanup(menuEl, button);
    }

    // --- Helper Methods ---

    private createMenuSection(container: HTMLElement, title?: string): HTMLElement {
        const section = container.createDiv({ cls: 'bases-toolbar-section' });
        if (title) {
            section.createDiv({ cls: 'bases-toolbar-section-header', text: title });
        }
        // If title is present, content is usually wrapped in section-content, but simpler flat structure works for most
        if (title) {
            const content = section.createDiv({ cls: 'bases-toolbar-section-content' });
            return content.createDiv({ cls: 'bases-toolbar-items' });
        }
        return section.createDiv({ cls: 'bases-toolbar-items' });
    }

    private createMenuItem(
        container: HTMLElement,
        iconName: string | undefined,
        text: string,
        onClick: (e: MouseEvent) => void,
        options: { isSelected?: boolean; endIcon?: string; isWarning?: boolean; subText?: string; valueLabel?: string } = {}
    ): HTMLElement {
        const item = container.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
        if (options.isSelected) item.addClass('is-selected');
        if (options.isWarning) item.addClass('mod-warning');

        const info = item.createDiv({ cls: 'bases-toolbar-menu-item-info' });
        if (iconName) {
            const iconWrapper = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
            setIcon(iconWrapper, iconName);
        }

        info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: text });
        if (options.subText) {
            // If we ever need subtext
        }

        if (options.valueLabel) {
            item.createDiv({ cls: 'bases-toolbar-menu-item-icon json-table-menu-item-value', text: options.valueLabel });
        }

        if (options.endIcon) {
            const endIconEl = item.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
            setIcon(endIconEl, options.endIcon);
        } else if (options.isSelected) {
            const check = item.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
            setIcon(check, 'check');
        }

        item.addEventListener('click', onClick);
        return item;
    }

    private createBackItem(container: HTMLElement, label: string = 'Back', onBack: () => void) {
        const section = container.createDiv({ cls: 'bases-toolbar-section' });
        const items = section.createDiv({ cls: 'bases-toolbar-items' });
        this.createMenuItem(items, 'arrow-left', label, onBack);
    }

    public showEditColumnDialog(headerCell: HTMLElement, column: ColumnDef, data: TableData, colIndex: number, deepLink?: { view: 'option-edit', optionIndex: number }) {
        // Remove any existing popup
        let cleanup: () => void = () => { };
        document.querySelector('.json-table-column-menu')?.remove();

        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('bases-toolbar-menu');
        menuEl.addClass('json-table-column-menu');
        menuEl.addClass('json-table-popup-menu');
        menuEl.addClass('json-table-menu-width-220');

        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
        const menuContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

        // --- Section 1: Rename ---
        const renameSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        const renameForm = renameSection.createDiv({ cls: 'bases-toolbar-menu-form' });
        const inputRow = renameForm.createDiv({ cls: 'input-row' });
        const inputContent = inputRow.createDiv({ cls: 'input-row-content' });
        const renameInput = inputContent.createEl('input', {
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
                    await this.host.view.saveTableData(data);
                    this.host.render();
                }
                cleanup();
            }
        });

        // --- Section 2: Change Type (drill-down item) ---
        const changeTypeItems = this.createMenuSection(menuContainer);

        const types = [
            { value: 'text', label: 'Text', icon: ICON_NAMES.text },
            { value: 'boolean', label: 'Checkbox', icon: ICON_NAMES.checkbox },
            { value: 'select', label: 'Select', icon: ICON_NAMES.dropdown },
            { value: 'select-multi', label: 'Multi-select', icon: ICON_NAMES.multiselect },
            { value: 'link', label: 'Wiki link', icon: ICON_NAMES.link },
            { value: 'url', label: 'URL', icon: ICON_NAMES.url },
            { value: 'email', label: 'Email', icon: ICON_NAMES.email },
            { value: 'date', label: 'Date', icon: ICON_NAMES.date },
            { value: 'number', label: 'Number', icon: ICON_NAMES.number },
        ];

        const defaultSelectOptions = [
            { value: 'Option 1', color: 'default' },
            { value: 'Option 2', color: 'default' },
            { value: 'Option 3', color: 'default' }
        ];

        this.createMenuItem(
            changeTypeItems,
            ICON_NAMES.switch,
            'Change type',
            () => {
                scrollContainer.empty();
                const typeContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

                this.createBackItem(typeContainer, 'Back', () => {
                    cleanup();
                    this.showEditColumnDialog(headerCell, column, data, colIndex);
                });

                const typeItemsEl = this.createMenuSection(typeContainer, 'Type');

                types.forEach(t => {
                    let isActive: boolean;
                    if (t.value === 'select-multi') {
                        isActive = column.type === 'select' && column.constraints?.multiSelect === true;
                    } else if (t.value === 'select') {
                        isActive = column.type === 'select' && !column.constraints?.multiSelect;
                    } else {
                        isActive = column.type === t.value;
                    }

                    this.createMenuItem(
                        typeItemsEl,
                        t.icon,
                        t.label,
                        async () => {
                            if (isActive) return;

                            if (t.value === 'select' || t.value === 'select-multi') {
                                column.type = 'select';
                                const isMulti = t.value === 'select-multi';
                                if (!column.constraints?.options?.length) {
                                    column.constraints = { ...column.constraints, options: defaultSelectOptions, multiSelect: isMulti };
                                } else {
                                    column.constraints = { ...column.constraints, multiSelect: isMulti };
                                }
                            } else if (t.value === 'date') {
                                column.type = 'date';
                                column.display = { ...column.display, dateFormat: column.display?.dateFormat || 'YYYY/MM/DD' };
                            } else {
                                column.type = t.value;
                            }

                            await this.host.view.saveTableData(data);
                            this.host.render();
                            cleanup();
                        },
                        { isSelected: isActive }
                    );
                });
            },
            { endIcon: 'chevron-right' }
        );

        // --- Section: Properties (Inline) ---
        if (column.type === 'select' || column.type === 'dropdown' || column.type === 'multiselect') {
            const propsSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
            propsSection.createDiv({ cls: 'bases-toolbar-section-header', text: 'Option properties' });

            const optionsContent = propsSection.createDiv({ cls: 'bases-toolbar-section-content' });
            const optionsList = optionsContent.createDiv({ cls: 'json-table-column-options-list bases-toolbar-items' });

            if (!column.constraints) column.constraints = {};
            if (!column.constraints.options) column.constraints.options = [];
            const options = column.constraints.options;
            const availableColors = ['default', 'accent', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'pink'];

            const renderInlineOptions = () => {
                optionsList.empty();

                options.forEach((opt: any, index: number) => {
                    const item = optionsList.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });

                    if (deepLink?.view === 'option-edit' && deepLink.optionIndex === index) {
                        setTimeout(() => item.click(), 0);
                    }

                    const info = item.createDiv({ cls: 'bases-toolbar-menu-item-info' });
                    const iconWrap = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
                    iconWrap.createDiv({ cls: `json-table-color-dot is-small json-table-tag--${opt.color || 'default'}` });

                    info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: opt.value });

                    const chevron = item.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
                    setIcon(chevron, 'chevron-right');

                    item.addEventListener('click', () => {
                        scrollContainer.empty();
                        const editPropContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

                        this.createBackItem(editPropContainer, 'Back', () => {
                            cleanup();
                            const newHeader = this.host.getHeaderCell(colIndex);
                            if (newHeader) {
                                this.showEditColumnDialog(newHeader, column, data, colIndex);
                            }
                        });

                        editPropContainer.createEl('div', { cls: 'menu-separator' });

                        const editSection = editPropContainer.createDiv({ cls: 'bases-toolbar-section' });
                        const renameForm = editSection.createDiv({ cls: 'bases-toolbar-menu-form' });
                        const inputRow = renameForm.createDiv({ cls: 'input-row' });
                        const inputContent = inputRow.createDiv({ cls: 'input-row-content' });
                        const nameInput = inputContent.createEl('input', {
                            type: 'text',
                            value: opt.value,
                            placeholder: 'Option name'
                        });
                        nameInput.spellcheck = false;
                        if (deepLink?.view === 'option-edit' && deepLink.optionIndex === index) {
                            setTimeout(() => nameInput.focus(), 50);
                        }

                        nameInput.addEventListener('click', (e) => e.stopPropagation());
                        nameInput.addEventListener('keydown', (e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                nameInput.blur();
                            }
                        });
                        nameInput.addEventListener('change', async () => {
                            const newValue = nameInput.value.trim();
                            if (newValue === opt.value) return;

                            opt.value = newValue;
                            await this.host.view.saveTableData(data);
                            this.host.render();

                            setTimeout(() => {
                                const newHeader = this.host.getHeaderCell(colIndex);
                                if (newHeader) positionPopup(menuEl, newHeader, { align: 'auto' });
                            }, 0);
                        });

                        this.createMenuItem(
                            editSection,
                            ICON_NAMES.trash,
                            'Delete option',
                            async () => {
                                if (column.constraints?.options) {
                                    column.constraints.options.splice(index, 1);
                                    await this.host.view.saveTableData(data);
                                    this.host.render();

                                    const newHeader = this.host.getHeaderCell(colIndex);
                                    if (newHeader) {
                                        cleanup();
                                        this.showEditColumnDialog(newHeader, column, data, colIndex);
                                    }
                                }
                            },
                            { isWarning: true }
                        );

                        const colorList = editSection.createDiv({ cls: 'bases-toolbar-items' });
                        availableColors.forEach(color => {
                            const colorItem = colorList.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
                            if ((opt.color || 'default') === color) colorItem.addClass('is-selected');

                            const colorInfo = colorItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
                            const colorIconWrap = colorInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
                            colorIconWrap.createDiv({ cls: `json-table-color-dot json-table-tag--${color}` });

                            const colorName = color.charAt(0).toUpperCase() + color.slice(1);
                            colorInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: colorName });

                            if ((opt.color || 'default') === color) {
                                const check = colorItem.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
                                setIcon(check, 'check');
                            }

                            colorItem.addEventListener('click', async () => {
                                opt.color = color;
                                await this.host.view.saveTableData(data);
                                this.host.render();

                                const newHeader = this.host.getHeaderCell(colIndex);
                                if (newHeader) {
                                    positionPopup(menuEl, newHeader, { align: 'auto' });
                                    const allItems = colorList.querySelectorAll('.suggestion-item');
                                    allItems.forEach(el => el.removeClass('is-selected'));
                                    colorItem.addClass('is-selected');
                                    allItems.forEach(el => {
                                        const icon = el.querySelector('.clickable-icon');
                                        if (icon) icon.remove();
                                    });
                                    const newCheck = colorItem.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
                                    setIcon(newCheck, 'check');
                                }
                            });
                        });
                    });
                });
            };

            renderInlineOptions();

            const addItem = propsSection.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
            const addInfo = addItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
            const addIcon = addInfo.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
            setIcon(addIcon, ICON_NAMES.plus);
            addInfo.createDiv({ cls: 'bases-toolbar-menu-item-name', text: 'Add option' });

            addItem.addEventListener('click', async () => {
                if (!column.constraints) column.constraints = {};
                if (!column.constraints.options) column.constraints.options = [];
                column.constraints.options.push({ value: 'New option', color: 'default' });
                await this.host.view.saveTableData(data);
                this.host.render();

                const newHeader = this.host.getHeaderCell(colIndex);
                if (newHeader) {
                    cleanup();
                    this.showEditColumnDialog(newHeader, column, data, colIndex, {
                        view: 'option-edit',
                        optionIndex: column.constraints.options.length - 1
                    });
                }
            });
        } else if (column.type === 'date') {
            const propsSection = this.createMenuSection(menuContainer, 'Date properties');

            const currentFormat = column.display?.dateFormat || 'YYYY/MM/DD';

            const availableFormats: { label: string; format: any }[] = [
                { label: 'Full Date', format: 'MMMM D, YYYY' },
                { label: 'Short Date', format: 'MMM D' },
                { label: 'Day/Month/Year', format: 'DD/MM/YYYY' },
                { label: 'Month/Day/Year', format: 'MM/DD/YYYY' },
                { label: 'Year/Month/Day', format: 'YYYY/MM/DD' },
            ];

            const currentLabel = availableFormats.find(f => f.format === currentFormat)?.label || currentFormat;

            this.createMenuItem(
                propsSection,
                ICON_NAMES.date,
                'Date format',
                () => {
                    scrollContainer.empty();
                    const formatMenuContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

                    this.createBackItem(formatMenuContainer, 'Back', () => {
                        cleanup();
                        const newHeader = this.host.getHeaderCell(colIndex);
                        if (newHeader) this.showEditColumnDialog(newHeader, column, data, colIndex);
                    });

                    formatMenuContainer.createEl('div', { cls: 'menu-separator' });

                    const listItems = this.createMenuSection(formatMenuContainer, 'Formats');

                    availableFormats.forEach(f => {
                        const isActive = currentFormat === f.format;
                        this.createMenuItem(
                            listItems,
                            undefined,
                            f.label,
                            async () => {
                                if (isActive) return;
                                column.display = { ...column.display, dateFormat: f.format };
                                await this.host.view.saveTableData(data);
                                this.host.render();
                                cleanup();
                                const newHeader = this.host.getHeaderCell(colIndex);
                                if (newHeader) this.showEditColumnDialog(newHeader, column, data, colIndex);
                            },
                            { isSelected: isActive }
                        );
                    });
                },
                { endIcon: 'chevron-right', valueLabel: currentLabel }
            );

        } else if (column.type === 'link') {
            const propsSection = this.createMenuSection(menuContainer, 'Note Link Properties');

            const suggestAll = column.constraints?.suggestAllFiles === true;

            this.createMenuItem(
                propsSection,
                ICON_NAMES.link,
                'Suggest all files',
                async (e) => {
                    e.stopPropagation();
                    column.constraints = { ...column.constraints, suggestAllFiles: !suggestAll };
                    await this.host.view.saveTableData(data);
                    this.host.render();
                    cleanup();
                    const newHeader = this.host.getHeaderCell(colIndex);
                    if (newHeader) this.showEditColumnDialog(newHeader, column, data, colIndex);
                },
                { isSelected: suggestAll }
            );
        }

        const actionItems = this.createMenuSection(menuContainer);

        if (column.type === 'text' || column.type === 'link') {
            const isWrapped = column.constraints?.wrap === true;
            this.createMenuItem(
                actionItems,
                ICON_NAMES.wrapText,
                'Wrap text',
                async () => {
                    column.constraints = { ...column.constraints, wrap: !isWrapped };
                    await this.host.view.saveTableData(data);
                    this.host.render();
                    cleanup();
                },
                { isSelected: isWrapped }
            );
        }

        this.createMenuItem(
            actionItems,
            ICON_NAMES.eyeOff,
            'Hide column',
            async () => {
                const activeView = this.host.getActiveView();
                if (!activeView.hiddenColumns) activeView.hiddenColumns = [];
                activeView.hiddenColumns.push(column.id);
                await this.host.view.saveTableData(data);
                this.host.render();
                cleanup();
            }
        );

        const deleteItems = this.createMenuSection(menuContainer);

        this.createMenuItem(
            deleteItems,
            ICON_NAMES.trash,
            'Delete column',
            async () => {
                data.columns.splice(colIndex, 1);
                data.rows.forEach(row => { delete row.cells[column.id]; });
                await this.host.view.saveTableData(data);
                this.host.render();
                cleanup();
            },
            { isWarning: true }
        );

        document.body.appendChild(menuEl);
        positionPopup(menuEl, headerCell, { align: 'auto' });

        cleanup = attachPopupCleanup(menuEl, headerCell);
        setTimeout(() => renameInput.focus(), 50);
    }

    public showAddColumnDialog(headerCell: HTMLElement, buttonDiv: HTMLElement, data: TableData, onClose: () => void) {
        let cleanup: () => void = () => { };
        document.querySelector('.json-table-add-column-menu')?.remove();

        const menuEl = document.createElement('div');
        menuEl.addClass('menu');
        menuEl.addClass('bases-toolbar-menu');
        menuEl.addClass('json-table-add-column-menu');
        menuEl.addClass('json-table-popup-menu');
        menuEl.addClass('json-table-menu-width-200');

        const scrollContainer = menuEl.createDiv({ cls: 'menu-scroll' });
        const menuContainer = scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

        const nameSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        const nameForm = nameSection.createDiv({ cls: 'bases-toolbar-menu-form' });
        const inputRow = nameForm.createDiv({ cls: 'input-row' });
        const inputContent = inputRow.createDiv({ cls: 'input-row-content' });
        const nameInput = inputContent.createEl('input', {
            type: 'text',
            placeholder: 'Column name'
        });
        nameInput.spellcheck = false;
        nameInput.addEventListener('click', (ev) => ev.stopPropagation());
        nameInput.addEventListener('mousedown', (ev) => ev.stopPropagation());

        const typeItemsEl = this.createMenuSection(menuContainer, 'Type');

        const types = [
            { type: 'text', name: 'Text', icon: ICON_NAMES.text },
            { type: 'boolean', name: 'Checkbox', icon: ICON_NAMES.checkbox },
            { type: 'select', name: 'Select', icon: ICON_NAMES.dropdown },
            { type: 'select-multi', name: 'Multi-select', icon: ICON_NAMES.multiselect },
            { type: 'link', name: 'Wiki link', icon: ICON_NAMES.link },
            { type: 'url', name: 'URL', icon: ICON_NAMES.url },
            { type: 'email', name: 'Email', icon: ICON_NAMES.email },
            { type: 'date', name: 'Date', icon: ICON_NAMES.date },
            { type: 'number', name: 'Number', icon: ICON_NAMES.number },
        ];
        const defaultSelectOptions = [
            { value: 'To Do', color: 'red' }, { value: 'In Progress', color: 'blue' }, { value: 'Done', color: 'green' }
        ];

        const addColumn = async (columnType: string, typeName: string, extraProps: Record<string, any> = {}) => {
            const columnName = nameInput.value.trim() || typeName;
            const columnId = generateColId(new Set(data.columns.map(c => c.id)));
            data.columns.push({ id: columnId, name: columnName, type: columnType, display: { width: 150 }, ...extraProps });
            data.rows.forEach(row => { row.cells[columnId] = ''; });
            await this.host.view.saveTableData(data);
            this.host.render();
            cleanup();
        };

        types.forEach(({ type, name, icon }) => {
            this.createMenuItem(
                typeItemsEl,
                icon,
                name,
                (e) => {
                    e.stopPropagation();
                    let extraProps: Record<string, any> = {};
                    if (type === 'select') extraProps = { constraints: { options: defaultSelectOptions } };
                    else if (type === 'select-multi') extraProps = { constraints: { options: defaultSelectOptions, multiSelect: true } };
                    else if (type === 'date') extraProps = { display: { width: 150, dateFormat: 'YYYY/MM/DD' } };
                    addColumn(type === 'select-multi' ? 'select' : type, name, extraProps);
                }
            );
        });

        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); addColumn('text', 'Text', {}); }
            e.stopPropagation();
        });

        menuEl.addEventListener('click', (e) => e.stopPropagation());
        menuEl.addEventListener('mousedown', (e) => e.stopPropagation());

        document.body.appendChild(menuEl);
        positionPopup(menuEl, buttonDiv, { align: 'auto' });

        cleanup = attachPopupCleanup(menuEl, buttonDiv, onClose);
        setTimeout(() => nameInput.focus(), 50);
    }
}
