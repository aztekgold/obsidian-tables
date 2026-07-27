
import { TableData, ColumnDef, AgentableRow, DEFAULT_SETTINGS, JsonTableSettings } from '../types';
import { JsonTableView } from '../JsonTableView';
import { AbstractTableRenderer, TYPE_ICONS } from './AbstractTableRenderer';
import { createIconElement, ICON_NAMES } from '../icons';
import { DropdownMenu } from '../ui/DropdownMenu';

export class DivTableRenderer extends AbstractTableRenderer {

    private selectedRows: Set<number> = new Set();

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
        // Recompute Function columns before anything below reads row.cells -
        // sort/filter/search all read cell data directly with no awareness of
        // formulas, so this write-through keeps them all correct for free.
        // Only persist in the real editable view - InlineTableRenderer and
        // EmbedTableRenderer both set isInline=true and are documented as
        // read-only, so a passive render (e.g. a hover preview) must never
        // write back to the source file, even though cells still need the
        // freshly computed values for correct display/sort/filter here.
        const formulasChanged = this.formulaHandler.recomputeAll();
        if (formulasChanged && !this.isInline) {
            void this.view.saveTableData(this.data);
        }

        const existingWrapper = this.container.querySelector('.json-table-div-wrapper') as HTMLElement;
        const scrollLeft = existingWrapper?.scrollLeft ?? 0;
        const scrollTop = existingWrapper?.scrollTop ?? 0;

        // Capture real focus state before the container (and the search input
        // living inside it) gets destroyed and rebuilt below. This must be read
        // fresh from the DOM on every render rather than tracked with a
        // persistent focus/blur flag, otherwise a stale flag can cause an
        // unrelated re-render (e.g. editing a cell) to steal focus back into
        // the search box - which is exactly what breaks things like Cmd/Ctrl+A.
        const activeEl = document.activeElement as HTMLInputElement | null;
        const searchHadFocus = !!activeEl && this.container.contains(activeEl) && activeEl.classList.contains('json-table-search-input');
        this.pendingSearchFocus = searchHadFocus ? { cursor: activeEl.selectionStart } : null;

        this.container.empty();
        this.renderRenameInput();
        this.renderViewTabs();
        this.renderControls();

        // Main Wrapper
        const tableWrapper = this.container.createDiv({ cls: 'json-table-div-wrapper' });
        if (this.settings.stickyActionColumn) {
            tableWrapper.addClass('is-sticky-actions');
        }

        const rowsToRender = this.getSearchFilteredRows(this.filterHandler.getFilteredRows(this.sortHandler.getSortedRows()));

        this.renderHeader(tableWrapper);
        this.renderBody(tableWrapper, rowsToRender);

        this.renderAddRowButton(this.container);
        this.renderBulkActionBar();

        requestAnimationFrame(() => {
            if (tableWrapper) {
                tableWrapper.scrollLeft = scrollLeft;
                tableWrapper.scrollTop = scrollTop;
            }
        });
    }

    public getHeaderCell(visualIndex: number): HTMLElement | null {
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



    protected renderBody(container: HTMLElement, rowsToRender: AgentableRow[]) {
        const tbody = container.createDiv({ cls: 'json-table-div-body' });
        const visibleColumns = this.getVisibleColumns();
        let draggedRowIndex: number | null = null;
        const rowIndexMap = new Map<AgentableRow, number>();
        this.data.rows.forEach((row, idx) => rowIndexMap.set(row, idx));
        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

        rowsToRender.forEach(row => {
            const tr = tbody.createDiv({ cls: 'json-table-div-row' });
            const originalRowIndex = rowIndexMap.get(row) ?? -1;

            // Drag Handle
            if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
                const handleCell = tr.createDiv({ cls: 'json-table-div-cell json-table-drag-handle-cell' });
                const handleContent = handleCell.createDiv({ cls: 'json-table-cell-btn-wrapper json-table-drag-handle-content' });
                handleContent.appendChild(createIconElement(ICON_NAMES.gripVertical, 14, 'json-table-row-drag-icon'));

                // Row Selection Checkbox
                const checkboxWrapper = handleContent.createDiv({ cls: 'json-table-row-checkbox-wrapper' });
                const checkbox = checkboxWrapper.createEl('input', {
                    type: 'checkbox',
                    cls: 'json-table-row-checkbox'
                });
                checkbox.checked = this.selectedRows.has(originalRowIndex);
                checkbox.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                        this.selectedRows.add(originalRowIndex);
                    } else {
                        this.selectedRows.delete(originalRowIndex);
                    }
                    this.render(); // Re-render to update the bulk action bar
                });
                // Prevent drag from triggering on checkbox click
                checkbox.addEventListener('mousedown', (e) => e.stopPropagation());

                handleCell.addEventListener('mousedown', () => { tr.draggable = true; });
                handleCell.addEventListener('mouseup', () => { tr.draggable = false; });
                handleCell.addEventListener('mouseleave', () => { tr.draggable = false; });

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
                    const currentIndex = draggedRowIndex; draggedRowIndex = null; tr.draggable = false;
                    if (currentIndex === null || currentIndex === originalRowIndex) return;
                    const movedRow = this.data.rows.splice(currentIndex, 1)[0];
                    this.data.rows.splice(originalRowIndex, 0, movedRow);
                    await this.view.saveTableData(this.data);
                    this.render();
                });
                tr.addEventListener('dragend', () => { tr.draggable = false; tr.removeClass('is-dragging'); tr.removeClass('is-dragover-top'); tr.removeClass('is-dragover-bottom'); draggedRowIndex = null; });
            }

            // Data Cells
            this.renderRow(tr, row, visibleColumns, activeSort.length > 0);

            // Delete Row Cell
            const deleteCell = tr.createDiv({ cls: 'json-table-div-cell json-table-row-actions-cell' });
            const cellContent = deleteCell.createDiv({ cls: 'json-table-cell-btn-wrapper' });
            const deleteButton = cellContent.createDiv({ cls: 'json-table-btn json-table-btn--icon', attr: { 'aria-label': 'Delete row', title: 'Delete row' } });
            deleteButton.appendChild(createIconElement(ICON_NAMES.trash, 14));
            deleteButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (originalRowIndex > -1) { this.data.rows.splice(originalRowIndex, 1); await this.view.saveTableData(this.data); this.render(); }
            });
        });
    }

    private renderRow(tr: HTMLElement, row: AgentableRow, columns: ColumnDef[], isSorted: boolean) {
        columns.forEach(col => {
            const value = row.cells[col.id] ?? '';
            const td = tr.createDiv({ cls: 'json-table-div-cell' });

            td.style.width = `var(--col-width-${col.id}, 150px)`;
            td.style.flex = `0 0 var(--col-width-${col.id}, 150px)`;

            td.setAttribute('data-col-id', col.id);

            const renderer = this.getCellRenderer(col) || this.cellRenderers.get('text');
            if (!renderer) return;

            const onCellChange = async (newValue: string) => {
                row.cells[col.id] = newValue;
                await this.view.saveTableData(this.data);
                // Also re-render if some formula actually depends on this
                // column, since otherwise a sibling formula cell wouldn't
                // refresh its own DOM until some unrelated trigger fired.
                // Checking real dependencies (not just "any Function column
                // exists") means editing a column no formula references
                // doesn't force a full-table re-render/recompute.
                if (isSorted || this.filterHandler.hasActiveFilters() || this.formulaHandler.dependsOnColumn(col.id)) {
                    this.render();
                }
            };
            // Pass the full column list (not just the visible ones iterated
            // above) so a formula can still resolve a reference to a column
            // the user has hidden from this view - visibility is a display
            // concern, not a reason for a formula to break.
            renderer.render(this.view.app, td, value, col, onCellChange, row, this.data.columns);
        });
    }

    private renderAddRowButton(container: Element) {
        const wrapper = container.createDiv({ cls: 'json-table-add-row-wrapper' });
        // Use standard button classes + icon (as array)
        const addBtn = wrapper.createEl('button', {
            cls: ['json-table-btn', 'json-table-btn--standard', 'json-table-add-row-btn']
        });
        const icon = createIconElement(ICON_NAMES.plus, 14);
        addBtn.appendChild(icon);
        addBtn.appendChild(document.createTextNode(' Add row'));

        const rowCountValue = this.data.rows.length;
        wrapper.createDiv({
            text: `${rowCountValue} Row${rowCountValue !== 1 ? 's' : ''}`,
            cls: 'json-table-row-count'
        });
        addBtn.addEventListener('click', () => { void this.addNewRow(); });
    }

    private renderBulkActionBar() {
        // Remove existing if any
        let actionBar = document.body.querySelector('.json-table-bulk-action-bar');
        if (actionBar) {
            actionBar.remove();
        }

        if (this.selectedRows.size === 0) return;

        actionBar = document.body.createDiv({ cls: 'json-table-bulk-action-bar' });

        const countDisplay = actionBar.createDiv({ cls: 'json-table-bulk-action-count' });
        countDisplay.setText(`${this.selectedRows.size} Selected`);

        const actionsContainer = actionBar.createDiv({ cls: 'json-table-bulk-actions' });

        const selectableColumns = this.getVisibleColumns().filter(
            c => c.type === 'select' || c.type === 'dropdown' || c.type === 'multiselect'
        );

        selectableColumns.forEach(col => {
            const btn = actionsContainer.createEl('button', {
                cls: ['json-table-btn', 'json-table-btn--standard', 'json-table-bulk-action-btn']
            });
            const iconSvg = TYPE_ICONS[col.type];
            if (iconSvg) {
                const iconEl = createIconElement(iconSvg, 14, `icon-col-${col.type}`);
                if (iconEl) btn.appendChild(iconEl);
            }
            btn.appendChild(document.createTextNode(` ${col.name}`));

            btn.addEventListener('click', (e) => {
                e.stopPropagation();

                const isMulti = (col.type === 'select' && col.constraints?.multiSelect) || col.type === 'multiselect';

                new DropdownMenu({
                    app: this.view.app,
                    anchor: btn,
                    options: col.constraints?.options || [],
                    selectedValues: [],
                    multiSelect: isMulti,
                    onSelect: (selectedValue) => {
                        void (async () => {
                            for (const rowIndex of this.selectedRows) {
                                const row = this.data.rows[rowIndex];
                                if (!row) continue;

                                if (isMulti) {
                                    const currentValues = row.cells[col.id] ? String(row.cells[col.id]).split(',').filter(Boolean) : [];
                                    if (!currentValues.includes(selectedValue)) {
                                        currentValues.push(selectedValue);
                                        row.cells[col.id] = currentValues.join(',');
                                    }
                                } else {
                                    row.cells[col.id] = selectedValue;
                                }
                            }

                            await this.view.saveTableData(this.data);

                            if (!isMulti) {
                                // DropdownMenu closes automatically for single select
                                this.render();
                            }
                            // For multi-select, wait for onClose to re-render
                        })();
                    },
                    onClose: () => {
                        this.render();
                    }
                });
            });
        });

        // Close / Uncheck all button
        const closeBtn = actionBar.createDiv({ cls: ['json-table-btn', 'json-table-btn--icon', 'json-table-bulk-close-btn'] });
        closeBtn.appendChild(createIconElement('x', 14));
        closeBtn.addEventListener('click', () => {
            this.selectedRows.clear();
            this.render();
        });
    }

    private onResizeStart(e: MouseEvent, column: ColumnDef, headerCell: HTMLElement) {
        this.isResizing = true;
        e.preventDefault(); e.stopPropagation();

        const startX = e.clientX;
        const startWidth = headerCell.offsetWidth;
        const columnId = column.id;
        const wrapper = this.container.querySelector('.json-table-div-wrapper') as HTMLElement;

        const onMouseMove = (moveE: MouseEvent) => {
            const newWidth = Math.max(40, startWidth + (moveE.clientX - startX));

            // PERFORMANCE OPTIMIZATION:
            // Update CSS Variable on the wrapper instead of iterating all cells
            if (wrapper) {
                wrapper.style.setProperty(`--col-width-${columnId}`, `${newWidth}px`);
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Save final width
            // Read from the variable or calculate based on existing logic
            // (The header cell width is now controlled by the variable too)
            const finalWidth = parseFloat(wrapper.style.getPropertyValue(`--col-width-${columnId}`)) || headerCell.offsetWidth;

            column.display = { ...column.display, width: finalWidth };
            void this.view.saveTableData(this.data);
            setTimeout(() => { this.isResizing = false; }, 0);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    // Override renderHeaderto set initial CSS variables and use them
    protected renderHeader(container: HTMLElement) {
        const headerRow = container.createDiv({ cls: 'json-table-div-header-row' });
        const visibleColumns = this.getVisibleColumns();
        let draggedColumnId: string | null = null;
        const activeSort = this.sortHandler.getCurrentSortRules();
        const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

        visibleColumns.forEach(col => {
            container.style.setProperty(`--col-width-${col.id}`, `${col.display?.width || 150}px`);
        });

        // Drag Handle Header
        if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
            const handleHeader = headerRow.createDiv({ cls: 'json-table-div-header-cell json-table-div-drag-handle-header' });

            // Replicate the row's inner wrapper structure exactly for perfect alignment
            const handleContent = handleHeader.createDiv({ cls: 'json-table-cell-btn-wrapper json-table-drag-handle-content' });
            const dummyIcon = createIconElement(ICON_NAMES.gripVertical, 14, 'json-table-row-drag-icon json-table-drag-spacer');
            handleContent.appendChild(dummyIcon);

            // Checkbox Wrapper
            const checkboxWrapper = handleContent.createDiv({ cls: 'json-table-row-checkbox-wrapper' });
            const checkbox = checkboxWrapper.createEl('input', {
                type: 'checkbox',
                cls: 'json-table-row-checkbox'
            });

            // Check if all filtered rows are selected
            const rowsToRender = this.getSearchFilteredRows(this.filterHandler.getFilteredRows());
            const allSelected = rowsToRender.length > 0 &&
                rowsToRender.every(row => {
                    const originalIndex = this.data.rows.indexOf(row);
                    return this.selectedRows.has(originalIndex);
                });
            checkbox.checked = allSelected;

            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    rowsToRender.forEach(row => {
                        const originalIndex = this.data.rows.indexOf(row);
                        if (originalIndex !== -1) {
                            this.selectedRows.add(originalIndex);
                        }
                    });
                } else {
                    this.selectedRows.clear();
                }
                this.render();
            });
        }

        visibleColumns.forEach((col, visibleIndex) => {
            const realIndex = this.data.columns.findIndex(c => c.id === col.id);
            const th = headerRow.createDiv({ cls: 'json-table-div-header-cell' });

            // USE CSS VARIABLE
            th.style.width = `var(--col-width-${col.id}, 150px)`;
            th.style.flex = `0 0 var(--col-width-${col.id}, 150px)`; // Prevent growing/shrinking

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
                void this.view.saveTableData(this.data);
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
        addColBtnDiv.appendChild(createIconElement(ICON_NAMES.plus, 14));
        let isAddColPopupOpen = false;
        addColBtnDiv.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); if (isAddColPopupOpen) return;
            isAddColPopupOpen = true;
            this.showAddColumnDialog(buttonsTh, addColBtnDiv, this.data, () => { isAddColPopupOpen = false; });
        });
    }
}
