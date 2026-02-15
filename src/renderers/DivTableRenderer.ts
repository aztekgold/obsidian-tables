
import { TableData, ColumnDef, CellData, DEFAULT_SETTINGS, JsonTableSettings } from '../types';
import { JsonTableView } from '../JsonTableView';
import { AbstractTableRenderer, TYPE_ICONS } from './AbstractTableRenderer';
import { createIconElement, ICON_NAMES } from '../icons';

export class DivTableRenderer extends AbstractTableRenderer {

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
        const existingWrapper = this.container.querySelector('.json-table-div-wrapper') as HTMLElement;
        const scrollLeft = existingWrapper?.scrollLeft ?? 0;
        const scrollTop = existingWrapper?.scrollTop ?? 0;

        this.container.empty();
        this.renderRenameInput();
        this.renderViewTabs();
        this.renderControls();

        // Main Wrapper
        const tableWrapper = this.container.createDiv({ cls: 'json-table-div-wrapper' });
        if (this.settings.stickyActionColumn) {
            tableWrapper.addClass('is-sticky-actions');
        }

        this.sortHandler.sortDataInMemory();
        const rowsToRender = this.filterHandler.getFilteredRows();

        this.renderHeader(tableWrapper);
        this.renderBody(tableWrapper, rowsToRender);

        this.renderAddRowButton(this.container);

        requestAnimationFrame(() => {
            if (tableWrapper) {
                tableWrapper.scrollLeft = scrollLeft;
                tableWrapper.scrollTop = scrollTop;
            }
        });
    }

    protected getHeaderCell(visualIndex: number): HTMLElement | null {
        // Check if drag handle exists
        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;
        const hasDragHandle = !isSortActive && this.settings.enableBetaFeatures && !this.isInline;

        const targetIndex = visualIndex + (hasDragHandle ? 1 : 0);
        const headers = this.container.querySelectorAll('.json-table-div-header-cell');

        if (targetIndex >= 0 && targetIndex < headers.length) {
            return headers[targetIndex] as HTMLElement;
        }
        return null;
    }

    protected renderHeader(container: HTMLElement) {
        const headerRow = container.createDiv({ cls: 'json-table-div-header-row' });
        const visibleColumns = this.getVisibleColumns();
        let draggedColumnId: string | null = null;
        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

        // Drag Handle Header
        if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
            headerRow.createDiv({ cls: 'json-table-div-header-cell json-table-div-drag-handle-header' });
        }

        visibleColumns.forEach((col, visibleIndex) => {
            const realIndex = this.data.columns.findIndex(c => c.id === col.id);
            const th = headerRow.createDiv({ cls: 'json-table-div-header-cell' });
            if (col.width) {
                th.style.width = `${col.width}px`;
                th.style.flex = '0 0 auto';
            } else {
                th.style.width = '';
                th.style.flex = ''; // Let CSS handle flex: 1
            }
            // th.style.flexShrink = '0'; // Removed, handled by CSS flex: 1 1 0px or flex: 0 0 auto
            th.draggable = true;
            th.setAttribute('data-col-id', col.id);

            const contentWrapper = th.createDiv({ cls: 'json-table-header-content' });
            const iconSvg = TYPE_ICONS[col.type];
            if (iconSvg) {
                const iconEl = createIconElement(iconSvg, 14, `icon-col-${col.type}`);
                if (iconEl) contentWrapper.appendChild(iconEl);
            }
            contentWrapper.appendText(col.name);

            // Resize Handle
            const resizeHandle = th.createDiv({ cls: 'json-table-resize-handle' });
            resizeHandle.addEventListener('mousedown', (e) => { this.onResizeStart(e, col, th); });

            // Drag Events
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

            th.addEventListener('dragend', () => { th.classList.remove('is-dragging'); draggedColumnId = null; });

            th.addEventListener('click', (e) => {
                if (this.isResizing) { this.isResizing = false; return; }
                if ((e.target as HTMLElement).classList.contains('json-table-resize-handle')) return;
                e.stopPropagation();
                this.showEditColumnDialog(th, col, this.data, realIndex);
            });
        });

        // Buttons Header Area
        const buttonsTh = headerRow.createDiv({ cls: 'json-table-div-header-cell json-table-buttons-th' });
        // Width handled by CSS
        const buttonContainer = buttonsTh.createDiv({ cls: 'json-table-header-content' });

        const addColBtnDiv = buttonContainer.createDiv({ cls: 'json-table-btn json-table-btn--icon', attr: { 'aria-label': 'Add column', title: 'Add column' } });
        addColBtnDiv.appendChild(createIconElement(ICON_NAMES.plus, 18));
        let isAddColPopupOpen = false;
        addColBtnDiv.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); if (isAddColPopupOpen) return;
            isAddColPopupOpen = true;
            this.showAddColumnDialog(buttonsTh, addColBtnDiv, this.data, () => { isAddColPopupOpen = false; });
        });
    }

    protected renderBody(container: HTMLElement, rowsToRender: CellData[][]) {
        const tbody = container.createDiv({ cls: 'json-table-div-body' });
        const visibleColumns = this.getVisibleColumns();
        let draggedRowIndex: number | null = null;
        const rowIndexMap = new Map<CellData[], number>();
        this.data.rows.forEach((row, idx) => rowIndexMap.set(row, idx));
        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

        rowsToRender.forEach(row => {
            const tr = tbody.createDiv({ cls: 'json-table-div-row' });
            const originalRowIndex = rowIndexMap.get(row) ?? -1;

            // Drag Handle
            if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
                tr.draggable = true;
                const handleCell = tr.createDiv({ cls: 'json-table-div-cell json-table-drag-handle-cell' });
                const handleContent = handleCell.createDiv({ cls: 'json-table-cell-btn-wrapper json-table-drag-handle-content' });
                handleContent.appendChild(createIconElement(ICON_NAMES.gripVertical, 14, 'json-table-row-drag-icon'));

                tr.addEventListener('dragstart', (e) => { draggedRowIndex = originalRowIndex; tr.addClass('is-dragging'); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
                tr.addEventListener('dragover', (e) => {
                    e.preventDefault(); if (draggedRowIndex === null || draggedRowIndex === originalRowIndex) return;
                    if (draggedRowIndex < originalRowIndex) { tr.addClass('is-dragover-bottom'); tr.removeClass('is-dragover-top'); }
                    else { tr.addClass('is-dragover-top'); tr.removeClass('is-dragover-bottom'); }
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                });
                tr.addEventListener('dragleave', () => { tr.removeClass('is-dragover-top'); tr.removeClass('is-dragover-bottom'); });
                tr.addEventListener('drop', async (e) => {
                    e.stopPropagation(); tr.removeClass('is-dragover-top'); tr.removeClass('is-dragover-bottom');
                    const currentIndex = draggedRowIndex; draggedRowIndex = null;
                    if (currentIndex === null || currentIndex === originalRowIndex) return;
                    const movedRow = this.data.rows.splice(currentIndex, 1)[0];
                    this.data.rows.splice(originalRowIndex, 0, movedRow);
                    await this.view.saveTableData(this.data);
                    this.render();
                });
                tr.addEventListener('dragend', () => { tr.removeClass('is-dragging'); tr.removeClass('is-dragover-top'); tr.removeClass('is-dragover-bottom'); draggedRowIndex = null; });
            }

            // Data Cells
            this.renderRow(tr, row, visibleColumns, activeSort.length > 0);

            // Delete Row Cell
            const deleteCell = tr.createDiv({ cls: 'json-table-div-cell json-table-row-actions-cell' });
            const cellContent = deleteCell.createDiv({ cls: 'json-table-cell-btn-wrapper' });
            const deleteButton = cellContent.createDiv({ cls: 'json-table-btn json-table-btn--icon', attr: { 'aria-label': 'Delete row', title: 'Delete row' } });
            deleteButton.appendChild(createIconElement(ICON_NAMES.trash, 16));
            deleteButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (originalRowIndex > -1) { this.data.rows.splice(originalRowIndex, 1); await this.view.saveTableData(this.data); this.render(); }
            });
        });
    }

    private renderRow(tr: HTMLElement, row: CellData[], columns: ColumnDef[], isSorted: boolean) {
        const cellMap = new Map<string, string>();
        row.forEach(cell => cellMap.set(cell.column, cell.value));

        columns.forEach(col => {
            const value = cellMap.get(col.id) || '';
            const td = tr.createDiv({ cls: 'json-table-div-cell' });
            if (col.width) {
                td.style.width = `${col.width}px`;
                td.style.flex = '0 0 auto';
            } else {
                td.style.width = '';
                td.style.flex = '';
            }
            // td.style.flexShrink = '0'; // Removed
            td.setAttribute('data-col-id', col.id); // For resizing reference

            let renderer = this.cellRenderers.get(col.type) || this.cellRenderers.get('text');
            if (!renderer) return;

            const onCellChange = async (newValue: string) => {
                const cellData = row.find(c => c.column === col.id);
                if (cellData) { cellData.value = newValue; }
                else { row.push({ column: col.id, value: newValue }); }
                await this.view.saveTableData(this.data);
                if (isSorted || this.filterHandler.hasActiveFilters()) {
                    this.render();
                }
            };
            renderer.render(this.view.app, td, value, col, onCellChange);
        });
    }

    private renderAddRowButton(container: Element) {
        const wrapper = container.createDiv({ cls: 'json-table-add-row-wrapper' });
        // Use standard button classes + icon (as array)
        const addBtn = wrapper.createEl('button', {
            cls: ['json-table-btn', 'json-table-btn--standard', 'json-table-add-row-btn']
        });
        const icon = createIconElement(ICON_NAMES.plus, 16);
        addBtn.appendChild(icon);
        addBtn.appendChild(document.createTextNode(' Add row'));

        const rowCountValue = this.data.rows.length;
        wrapper.createDiv({
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

    private onResizeStart(e: MouseEvent, column: ColumnDef, headerCell: HTMLElement) {
        this.isResizing = true;
        e.preventDefault(); e.stopPropagation();

        const startX = e.clientX;
        const startWidth = headerCell.offsetWidth;
        const columnId = column.id;

        // Find all cells for this column to update them in real-time
        const wrapper = this.container.querySelector('.json-table-div-wrapper');
        const cells = wrapper ? Array.from(wrapper.querySelectorAll(`[data-col-id="${columnId}"]`)) as HTMLElement[] : [];
        // Include the header cell itself if not in the list (depends on querySelectorAll)
        if (!cells.includes(headerCell)) cells.push(headerCell);

        const onMouseMove = (moveE: MouseEvent) => {
            const newWidth = Math.max(40, startWidth + (moveE.clientX - startX));
            // Update width of all cells in this column
            cells.forEach(cell => {
                cell.style.width = `${newWidth}px`;
                cell.style.flex = '0 0 auto';
            });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Read final width from header
            const finalWidth = headerCell.offsetWidth;
            column.width = finalWidth;
            this.view.saveTableData(this.data);
            setTimeout(() => { this.isResizing = false; }, 0);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
