
import { TableData, ColumnDef, CellData, DEFAULT_SETTINGS, JsonTableSettings } from '../types';
import { JsonTableView } from '../JsonTableView';
import { AbstractTableRenderer, TYPE_ICONS } from './AbstractTableRenderer';
import { createIconElement, ICON_NAMES } from '../icons';
import { setIcon } from 'obsidian';

export class HtmlTableRenderer extends AbstractTableRenderer {
    private colGroup: HTMLTableColElement | null = null;

    constructor(
        container: Element,
        data: TableData,
        view: JsonTableView,
        isInline: boolean = false,
        settings: JsonTableSettings = DEFAULT_SETTINGS
    ) {
        super(container, data, view, isInline, settings);
    }

    public render() {
        const existingWrapper = this.container.querySelector('.json-table-wrapper') as HTMLElement;
        const scrollLeft = existingWrapper?.scrollLeft ?? 0;
        const scrollTop = existingWrapper?.scrollTop ?? 0;

        this.container.empty();
        this.renderRenameInput();
        this.renderViewTabs();
        this.renderControls();

        const tableWrapper = this.container.createEl('div', { cls: 'json-table-wrapper' });
        const table = tableWrapper.createEl('table', { cls: 'json-table' });

        this.sortHandler.sortDataInMemory();
        const rowsToRender = this.filterHandler.getFilteredRows();

        this.colGroup = table.createEl('colgroup');
        this.renderColGroup();
        this.renderHeader(table);
        this.renderBody(table, rowsToRender);

        this.renderAddRowButton(this.container);

        requestAnimationFrame(() => {
            if (tableWrapper) {
                tableWrapper.scrollLeft = scrollLeft;
                tableWrapper.scrollTop = scrollTop;
            }
        });
    }

    private renderColGroup() {
        if (!this.colGroup) return;
        this.colGroup.empty();
        const visibleColumns = this.getVisibleColumns();
        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

        if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
            const dragCol = this.colGroup.createEl('col');
            dragCol.style.width = '30px';
            dragCol.addClass('json-table-drag-col');
        }

        visibleColumns.forEach((col, index) => {
            const colEl = this.colGroup!.createEl('col');
            colEl.style.width = col.width ? `${col.width}px` : '150px';
            colEl.setAttribute('data-col-index', index.toString());
        });

        const addColEl = this.colGroup.createEl('col');
        addColEl.style.width = '100px';
    }

    protected renderHeader(table: HTMLTableElement) {
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        const visibleColumns = this.getVisibleColumns();
        let draggedColumnId: string | null = null;

        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

        if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
            headerRow.createEl('th', { cls: 'json-table-header-cell json-table-drag-handle-header' });
        }

        visibleColumns.forEach((col, visibleIndex) => {
            const realIndex = this.data.columns.findIndex(c => c.id === col.id);
            const th = headerRow.createEl('th', { cls: 'json-table-header-cell' });
            th.draggable = true;
            th.setAttribute('data-col-index', visibleIndex.toString());

            const contentWrapper = th.createEl('div', { cls: 'json-table-header-content' });

            // Add drag handle (this was missing!)
            const dragHandle = contentWrapper.createDiv({ cls: 'json-table-drag-handle' });
            setIcon(dragHandle, ICON_NAMES.gripVertical);

            const iconSvg = TYPE_ICONS[col.type];
            if (iconSvg) {
                const iconEl = createIconElement(iconSvg, 14, `icon-col-${col.type}`);
                if (iconEl) contentWrapper.appendChild(iconEl);
            }
            contentWrapper.appendText(col.name);

            const resizeHandle = th.createEl('div', { cls: 'json-table-resize-handle' });
            resizeHandle.addEventListener('mousedown', (e) => { this.onResizeStart(e, col); });

            th.addEventListener('dragstart', (e) => {
                if ((e.target as HTMLElement).classList.contains('json-table-resize-handle')) { e.preventDefault(); return; }
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    draggedColumnId = col.id;
                    th.classList.add('is-dragging');
                }
            });

            th.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                th.classList.add('is-dragover');
            });

            th.addEventListener('dragleave', () => { th.classList.remove('is-dragover'); });

            th.addEventListener('drop', (e) => {
                e.preventDefault();
                th.classList.remove('is-dragover');
                if (!draggedColumnId || draggedColumnId === col.id) return;

                const fromIndex = this.data.columns.findIndex(c => c.id === draggedColumnId);
                const toIndex = this.data.columns.findIndex(c => c.id === col.id);
                if (fromIndex === -1 || toIndex === -1) return;

                const draggedColumn = this.data.columns.splice(fromIndex, 1)[0];
                this.data.columns.splice(toIndex, 0, draggedColumn);
                this.view.saveTableData(this.data);
                this.render();
            });

            th.addEventListener('dragend', () => {
                th.classList.remove('is-dragging'); draggedColumnId = null;
            });

            th.addEventListener('click', (e) => {
                if (this.isResizing) { this.isResizing = false; return; }
                if ((e.target as HTMLElement).classList.contains('json-table-resize-handle')) return;
                e.stopPropagation();
                this.showEditColumnDialog(th, col, this.data, realIndex);
            });
        });

        const buttonsTh = headerRow.createEl('th', { cls: 'json-table-header-sticky json-table-buttons-th' });
        const buttonContainer = buttonsTh.createEl('div', { cls: 'json-table-header-buttons-container' });

        const addColBtnDiv = buttonContainer.createEl('div', { cls: 'json-table-btn json-table-btn--icon', attr: { 'aria-label': 'Add column', title: 'Add column' } });
        const plusIcon = createIconElement(ICON_NAMES.plus, 18);
        addColBtnDiv.appendChild(plusIcon);
        let isAddColPopupOpen = false;
        addColBtnDiv.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); if (isAddColPopupOpen) return;
            isAddColPopupOpen = true;
            this.showAddColumnDialog(buttonsTh, addColBtnDiv, this.data, () => { isAddColPopupOpen = false; });
        });
    }

    protected renderBody(table: HTMLTableElement, rowsToRender: CellData[][]) {
        const tbody = table.createEl('tbody');
        const rowIndexMap = new Map<CellData[], number>();
        this.data.rows.forEach((row, idx) => rowIndexMap.set(row, idx));

        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;
        let draggedRowIndex: number | null = null;
        const visibleColumns = this.getVisibleColumns();

        rowsToRender.forEach((row) => {
            const tr = tbody.createEl('tr', { cls: 'json-table-row' });
            const originalRowIndex = rowIndexMap.get(row) ?? -1;

            if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
                tr.draggable = true;
                const handleCell = tr.createEl('td', { cls: 'json-table-cell json-table-drag-handle-cell' });
                const handleContent = handleCell.createEl('div', { cls: 'json-table-cell-content json-table-drag-handle-content' });
                handleContent.appendChild(createIconElement(ICON_NAMES.gripVertical, 14, 'json-table-row-drag-icon'));

                tr.addEventListener('dragstart', (e) => {
                    draggedRowIndex = originalRowIndex;
                    tr.addClass('is-dragging');
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                });

                tr.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (draggedRowIndex === null || draggedRowIndex === originalRowIndex) return;
                    if (draggedRowIndex < originalRowIndex) { tr.addClass('is-dragover-bottom'); tr.removeClass('is-dragover-top'); }
                    else { tr.addClass('is-dragover-top'); tr.removeClass('is-dragover-bottom'); }
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                });

                tr.addEventListener('dragleave', () => { tr.removeClass('is-dragover-top'); tr.removeClass('is-dragover-bottom'); });

                tr.addEventListener('drop', async (e) => {
                    e.stopPropagation();
                    tr.removeClass('is-dragover-top'); tr.removeClass('is-dragover-bottom');
                    const currentIndex = draggedRowIndex; draggedRowIndex = null;
                    if (currentIndex === null || currentIndex === originalRowIndex) return;

                    const movedRow = this.data.rows.splice(currentIndex, 1)[0];
                    this.data.rows.splice(originalRowIndex, 0, movedRow);
                    await this.view.saveTableData(this.data);
                    this.render();
                });

                tr.addEventListener('dragend', () => {
                    tr.removeClass('is-dragging'); tr.removeClass('is-dragover-top'); tr.removeClass('is-dragover-bottom'); draggedRowIndex = null;
                });
            }

            this.renderRow(tr, row, visibleColumns, originalRowIndex, this.data);

            const deleteCell = tr.createEl('td', { cls: 'json-table-row-actions-cell' });
            const cellContent = deleteCell.createEl('div', { cls: 'json-table-cell-content' });
            const deleteButton = cellContent.createEl('div', { cls: 'json-table-btn json-table-btn--icon', attr: { 'aria-label': 'Delete row', title: 'Delete row' } });
            deleteButton.appendChild(createIconElement(ICON_NAMES.trash, 16));
            deleteButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (originalRowIndex > -1) {
                    this.data.rows.splice(originalRowIndex, 1);
                    await this.view.saveTableData(this.data);
                    this.render();
                }
            });
        });
    }

    private renderRow(tr: HTMLElement, row: CellData[], columns: ColumnDef[], originalRowIndex: number, data: TableData) {
        const cellMap = new Map<string, string>();
        row.forEach(cell => cellMap.set(cell.column, cell.value));

        columns.forEach((col) => {
            const value = cellMap.get(col.id) || '';
            const td = tr.createEl('td', { cls: 'json-table-cell' });

            let renderer = this.cellRenderers.get(col.type) || this.cellRenderers.get('text');
            if (!renderer) return;

            const onCellChange = async (newValue: string) => {
                const cellData = row.find(c => c.column === col.id);
                if (cellData) { cellData.value = newValue; }
                else { row.push({ column: col.id, value: newValue }); }
                await this.view.saveTableData(data);
                if (this.sortHandler.getCurrentSortRules().some(rule => rule.columnId === col.id) || this.filterHandler.hasActiveFilters()) {
                    this.render();
                }
            };
            renderer.render(this.view.app, td, value, col, onCellChange);
        });
    }

    private renderAddRowButton(container: Element) {
        const wrapper = container.createEl('div', { cls: 'json-table-add-row-wrapper' });
        // Use standard button classes + icon
        const addBtn = wrapper.createEl('button', { cls: 'json-table-btn json-table-btn--standard json-table-add-row-btn' });
        const icon = createIconElement(ICON_NAMES.plus, 16);
        addBtn.appendChild(icon);
        addBtn.appendChild(document.createTextNode(' Add row'));

        const rowCountValue = this.data.rows.length;
        wrapper.createEl('div', {
            text: `${rowCountValue} Row${rowCountValue !== 1 ? 's' : ''}`,
            cls: 'json-table-row-count'
        });

        addBtn.addEventListener('click', async () => {
            const newRow: CellData[] = [];
            this.data.columns.forEach(col => newRow.push({ column: col.id, value: '' }));
            this.data.rows.push(newRow);
            await this.view.saveTableData(this.data);
            this.render();
        });
    }

    private onResizeStart(e: MouseEvent, column: ColumnDef) {
        if (!this.colGroup) return;
        this.isResizing = true;
        e.preventDefault(); e.stopPropagation();

        const visibleColumns = this.getVisibleColumns();
        const visibleIndex = visibleColumns.findIndex(c => c.id === column.id);
        if (visibleIndex === -1) { this.isResizing = false; return; }

        const colElement = this.colGroup.querySelector(`col[data-col-index="${visibleIndex}"]`) as HTMLTableColElement | null;
        if (!colElement) { this.isResizing = false; return; }

        const startX = e.clientX;
        const startWidth = colElement.offsetWidth;

        const onMouseMove = (moveE: MouseEvent) => {
            const newWidth = startWidth + (moveE.clientX - startX);
            if (newWidth > 40) colElement.style.width = `${newWidth}px`;
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            const finalWidth = colElement.offsetWidth;
            column.width = finalWidth;
            this.view.saveTableData(this.data);
            setTimeout(() => { this.isResizing = false; }, 0);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
