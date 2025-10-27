// src/TableRenderer.ts

import { TableData, ColumnDef, CellData } from './types'; // Adjust path if needed
import { JsonTableView } from './JsonTableView'; // Adjust path if needed

// Import cell renderers
import { ICellRenderer } from './renderers/ICellRenderer';
import { TextRenderer } from './renderers/TextRenderer';
import { CheckboxRenderer } from './renderers/CheckboxRenderer';
import { DropdownRenderer } from './renderers/DropdownRenderer';
import { MultiSelectRenderer } from './renderers/MultiSelectRenderer';
import { NoteLinkRenderer } from './renderers/NoteLinkRenderer';
import { DateRenderer } from './renderers/DateRenderer'; // Ensure DateRenderer is imported

// Import column editors
import { IColumnEditor } from './editors/IColumnEditor';
import { TextColumnEditor } from './editors/TextColumnEditor';
import { DropdownColumnEditor } from './editors/DropdownColumnEditor';
import { NoteLinkColumnEditor } from './editors/NoteLinkColumnEditor';
import { DateColumnEditor } from './editors/DateColumnEditor';

// Import Handlers
import { SortHandler } from './SortHandler';
import { FilterHandler } from './FilterHandler';

// Import Icons
import {
    ICON_NAMES,
    createIconElement
} from './icons'; // Adjust path if needed

// Map column types to their icon names
const TYPE_ICONS: Record<string, string> = {
  text: ICON_NAMES.text,
  dropdown: ICON_NAMES.dropdown,
  multiselect: ICON_NAMES.multiselect,
  checkbox: ICON_NAMES.checkbox,
  date: ICON_NAMES.date,
  notelink: ICON_NAMES.link,
};


export class TableRenderer {

  // Properties
  private cellRenderers: Map<string, ICellRenderer>;
  private columnEditors: Map<string, IColumnEditor>;
  private isResizing: boolean = false;
  private colGroup: HTMLTableColElement | null = null;
  private sortHandler: SortHandler;
  private filterHandler: FilterHandler; // Add FilterHandler instance

  constructor(
    private container: Element,
    private data: TableData,
    private view: JsonTableView
  ) {
    // Init registries
    this.cellRenderers = new Map();
    this.registerRenderers();
    this.columnEditors = new Map();
    this.registerColumnEditors();

    // Instantiate Handlers
    this.sortHandler = new SortHandler(this.data, () => this.render(), this.view);
    this.filterHandler = new FilterHandler(this.data, () => this.render(), this.view);
  }

  // --- Registration ---

  private registerRenderers() {
    this.cellRenderers.set('text', new TextRenderer());
    this.cellRenderers.set('checkbox', new CheckboxRenderer());
    this.cellRenderers.set('dropdown', new DropdownRenderer());
    this.cellRenderers.set('multiselect', new MultiSelectRenderer());
    this.cellRenderers.set('notelink', new NoteLinkRenderer());
    this.cellRenderers.set('date', new DateRenderer());
  }

  private registerColumnEditors() {
    this.columnEditors.set('text', new TextColumnEditor());
    this.columnEditors.set('checkbox', new TextColumnEditor());
    this.columnEditors.set('dropdown', new DropdownColumnEditor());
    this.columnEditors.set('multiselect', new DropdownColumnEditor());
    this.columnEditors.set('notelink', new NoteLinkColumnEditor());
    this.columnEditors.set('date', new DateColumnEditor());
  }

  // --- Rename Input Rendering ---

  private renderRenameInput() {
    const renameContainer = this.container.createDiv({ cls: 'json-table-rename-container' });
    
    // Get the current file name without extension
    const currentFilePath = this.view.getFilePath();
    if (!currentFilePath) return;
    
    const fileName = currentFilePath.substring(currentFilePath.lastIndexOf('/') + 1);
    const nameWithoutExt = fileName.replace(/\.(table\.json|table\.md)$/, '');
    
    const renameInput = renameContainer.createEl('input', {
      type: 'text',
      cls: 'json-table-rename-input',
      value: nameWithoutExt,
      placeholder: 'Table name'
    });
    
    // Handle blur event for renaming
    renameInput.addEventListener('blur', async () => {
      const newName = renameInput.value.trim();
      if (newName && newName !== nameWithoutExt) {
        const success = await this.view.renameFile(newName);
        if (!success) {
          // Reset to original name if rename failed
          renameInput.value = nameWithoutExt;
        }
        // If successful, keep the user's input as-is (don't repopulate with extension)
      } else if (!newName) {
        // Reset to original name if empty
        renameInput.value = nameWithoutExt;
      }
    });
    
    // Handle Enter key
    renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        renameInput.blur(); // Trigger the blur event
      } else if (e.key === 'Escape') {
        e.preventDefault();
        renameInput.value = nameWithoutExt; // Reset to original name
        renameInput.blur();
      }
    });
  }

  // --- Main Render ---

  public render() {
    // Save scroll position before clearing
    const existingWrapper = this.container.querySelector('.json-table-wrapper') as HTMLElement;
    const scrollLeft = existingWrapper?.scrollLeft ?? 0;
    const scrollTop = existingWrapper?.scrollTop ?? 0;
    
    this.container.empty(); // Clear everything before re-rendering

    // Render file rename input at the top
    this.renderRenameInput();

    // Render controls (Sort & Filter buttons)
    const controlsContainer = this.container.createDiv({ cls: 'json-table-controls' });

    // Sort Button
    const sortButton = controlsContainer.createEl('button', {
      cls: 'json-table-btn json-table-btn--standard json-table-sort-button',
      attr: { 'aria-label': 'Sort table' }
    });
    const sortIcon = createIconElement(ICON_NAMES.sort, 16, 'icon-sort');
    sortButton.appendChild(sortIcon);
    sortButton.appendText(' Sort');
    sortButton.addEventListener('click', () => {
      this.sortHandler.showSortPopup(sortButton);
    });

    // Filter Button
    const filterButton = controlsContainer.createEl('button', {
        cls: 'json-table-btn json-table-btn--standard json-table-filter-button',
    });
    const filterIcon = createIconElement(ICON_NAMES.filter, 16, 'icon-filter');
    filterButton.appendChild(filterIcon);
    filterButton.appendText(' Filter');
    if (this.filterHandler.hasActiveFilters()) {
        filterButton.addClass('json-table-btn--active');
    }
    filterButton.addEventListener('click', () => {
        this.filterHandler.showFilterPopup(filterButton);
    });


    // Render table wrapper and table element
    const tableWrapper = this.container.createEl('div', { cls: 'json-table-wrapper' });
    const table = tableWrapper.createEl('table', { cls: 'json-table' });

    // Apply sorting to the *full* data set (in memory) if needed
    this.sortHandler.sortDataInMemory();

    // Get Filtered Rows *after* sorting the full set
    const rowsToRender = this.filterHandler.getFilteredRows();

    // Render colgroup, header (using full column list)
    this.colGroup = table.createEl('colgroup');
    this.renderColGroup(); // Based on this.data.columns
    this.renderHeader(table); // Based on this.data.columns

    // Render Body using FILTERED rows
    this.renderBody(table, rowsToRender); // Pass filtered rows

    // Render Add Row button
    this.renderAddRowButton(this.container);
    
    // Restore scroll position after rendering
    // Use requestAnimationFrame for better timing with DOM updates
    requestAnimationFrame(() => {
      tableWrapper.scrollLeft = scrollLeft;
      tableWrapper.scrollTop = scrollTop;
    });
  }

  // --- Column Group Rendering ---
  private renderColGroup() {
    if (!this.colGroup) return;
    const colGroupEl = this.colGroup;
    colGroupEl.empty();

    this.data.columns.forEach((colDef, index) => {
      const col = colGroupEl.createEl('col');
      col.style.width = colDef.width ? `${colDef.width}px` : `150px`;
      col.setAttribute('data-col-index', index.toString());
    });

    // Add a <col> for the combined buttons column
    const buttonsCol = colGroupEl.createEl('col');
    buttonsCol.style.width = '125px'; // Match CSS width
  }

  // --- Header Rendering ---

  private renderHeader(table: HTMLTableElement) {
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    let draggedColumnIndex: number | null = null;

    // Render Data Columns
    this.data.columns.forEach((col, colIndex) => {
      const th = headerRow.createEl('th', { cls: 'json-table-header-cell' });
      th.draggable = true;
      th.setAttribute('data-col-index', colIndex.toString());

      const contentWrapper = th.createEl('div', { cls: 'json-table-header-content' });
      const iconSvg = TYPE_ICONS[col.type];
      if (iconSvg) {
        const iconEl = createIconElement(iconSvg, 14, `icon-col-${col.type}`);
        if (iconEl) contentWrapper.appendChild(iconEl);
      }
      contentWrapper.appendText(col.name);

      const resizeHandle = th.createEl('div', { cls: 'json-table-resize-handle' });
      resizeHandle.addEventListener('mousedown', (e) => { this.onResizeStart(e, col, colIndex); });

      // Drag and Drop Listeners
      th.addEventListener('dragstart', (e) => { /* ... drag start logic ... */
         if ((e.target as HTMLElement).classList.contains('json-table-resize-handle')) { e.preventDefault(); return; }
         if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; draggedColumnIndex = colIndex; th.classList.add('is-dragging'); }
      });
      th.addEventListener('dragover', (e) => { /* ... drag over logic ... */
          e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; th.classList.add('is-dragover');
      });
      th.addEventListener('dragleave', () => th.classList.remove('is-dragover'));
      th.addEventListener('drop', (e) => { /* ... drop logic ... */
          e.preventDefault(); th.classList.remove('is-dragover'); if (draggedColumnIndex === null) return;
          const targetColumnIndex = colIndex; if (draggedColumnIndex === targetColumnIndex) return;
          const draggedColumn = this.data.columns.splice(draggedColumnIndex, 1)[0]; this.data.columns.splice(targetColumnIndex, 0, draggedColumn);
          this.view.saveTableData(this.data); this.render();
      });
      th.addEventListener('dragend', () => { /* ... drag end logic ... */
          th.classList.remove('is-dragging'); draggedColumnIndex = null;
      });

      // Edit Column Click Listener
      th.addEventListener('click', (e) => { /* ... edit click logic ... */
          if (this.isResizing) { this.isResizing = false; return; }
          if ((e.target as HTMLElement).classList.contains('json-table-resize-handle')) { return; }
          e.stopPropagation(); this.showEditColumnDialog(th, col, this.data, colIndex);
      });
    }); // End data columns loop

    // Render Combined Header Cell for Buttons
    const buttonsTh = headerRow.createEl('th', { cls: 'json-table-header-sticky json-table-buttons-th' });
    const buttonContainer = buttonsTh.createEl('div', { cls: 'json-table-header-buttons-container' });

    // More Options Button - Commented out until functionality is implemented
    // const moreOptionsBtnDiv = buttonContainer.createEl('div', { cls: 'json-table-btn json-table-btn--icon', attr: { 'aria-label': 'More options', title: 'More options' } });
    // const moreIcon = createIconElement(ICON_NAMES.moreVertical, 18);
    // moreOptionsBtnDiv.appendChild(moreIcon);
    // moreOptionsBtnDiv.addEventListener('click', (e) => { e.stopPropagation(); /* TODO: Menu */ });

    // Add Column Button Div
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

  // --- Body Rendering ---

  private renderBody(table: HTMLTableElement, rowsToRender: CellData[][]) { // Accept filtered rows
    const tbody = table.createEl('tbody');
    rowsToRender.forEach((row) => { // Iterate over filtered rows
      const tr = tbody.createEl('tr', { cls: 'json-table-row' });

      // Find original index needed for deletion
      const originalRowIndex = this.data.rows.findIndex(originalRow => originalRow === row);

      this.renderRow(tr, row, this.data.columns, originalRowIndex, this.data); // Pass original index

      // Render delete cell
      const deleteCell = tr.createEl('td', { cls: 'json-table-row-actions-cell' }); // Sticky cell for actions
      const cellContent = deleteCell.createEl('div', { cls: 'json-table-cell-content' });
      const deleteButton = cellContent.createEl('div', { cls: 'json-table-btn json-table-btn--icon', attr: { 'aria-label': 'Delete row', title: 'Delete row' } });
      const trashIcon = createIconElement(ICON_NAMES.trash, 16);
      deleteButton.appendChild(trashIcon);

      deleteButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (originalRowIndex > -1) { // Ensure original index was found
          this.data.rows.splice(originalRowIndex, 1); // Delete from original data
          await this.view.saveTableData(this.data);
          this.render(); // Re-render
        } else {
           console.error("Could not find original row index for deletion while filtered.");
        }
      });
      // Add empty cell below the combined buttons header if it wasn't the delete cell
      // tr.createEl('td', { cls: 'json-table-buttons-cell' }); // This seems redundant if actions cell is last
    });
  }


  private renderRow(tr: HTMLElement, row: CellData[], columns: ColumnDef[], originalRowIndex: number, data: TableData) {
    const cellMap = new Map<string, string>();
    row.forEach(cell => cellMap.set(cell.column, cell.value));

    columns.forEach((col) => {
      const value = cellMap.get(col.id) || '';
      const td = tr.createEl('td', { cls: 'json-table-cell' });

      let renderer = this.cellRenderers.get(col.type) || this.cellRenderers.get('text');
      if (!renderer) { /* ... error handling ... */ return; }

      const onCellChange = async (newValue: string) => {
        const cellData = row.find(c => c.column === col.id);
        if (cellData) { cellData.value = newValue; }
        else { row.push({ column: col.id, value: newValue }); }

        await this.view.saveTableData(data);
        // Re-render if sort/filter might change
         if (this.sortHandler.getCurrentSortRules().some(rule => rule.columnId === col.id) || this.filterHandler.hasActiveFilters()) {
            this.render();
         }
      };
      renderer.render(this.view.app, td, value, col, onCellChange);
    });
  }

  // --- Add Row Button ---

  private renderAddRowButton(container: Element) {
      const addRowBtn = container.createEl('div', { cls: 'json-table-add-row' }); // Use div
      const content = addRowBtn.createDiv({ cls: 'json-table-btn json-table-btn--hybrid' });
      const plusIcon = createIconElement(ICON_NAMES.plus, 16);
      content.appendChild(plusIcon);
      content.createSpan({ text: 'Add row', cls: 'json-table-add-row-text' });

      addRowBtn.addEventListener('click', async () => {
          let newRowData: Record<string, string> = {};
          this.data.columns.forEach(col => {
              newRowData[col.id] = col.type === 'checkbox' ? 'false' : ''; // Default values
          });

          // Pre-populate based on filter
          const activeFilters = this.filterHandler.getCurrentFilterRules();
          activeFilters.forEach(rule => {
              if (rule.operator === 'equals' && rule.value && newRowData.hasOwnProperty(rule.columnId)) {
                  newRowData[rule.columnId] = rule.value;
              }
              // TODO: Add logic for other operators if applicable for pre-population
          });

          const newRow: CellData[] = Object.entries(newRowData).map(([colId, val]) => ({
              column: colId, value: val
          }));

          this.data.rows.push(newRow); // Add to unfiltered data
          await this.view.saveTableData(this.data);
          this.render(); // Re-render applies filters/sort
      });
  }


  // --- Column Resizing ---

  private onResizeStart(e: MouseEvent, column: ColumnDef, colIndex: number) {
    if (!this.colGroup) return;
    this.isResizing = true;
    e.preventDefault(); e.stopPropagation();
    const colElement = this.colGroup.querySelector(`col[data-col-index="${colIndex}"]`) as HTMLTableColElement | null;
    if (!colElement) { this.isResizing = false; return; }
    const startX = e.clientX; const startWidth = colElement.offsetWidth;
    const onMouseMove = (moveE: MouseEvent) => {
        const newWidth = startWidth + (moveE.clientX - startX);
        if (newWidth > 40) colElement.style.width = `${newWidth}px`;
    };
    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        const finalWidth = colElement.offsetWidth; column.width = finalWidth;
        this.view.saveTableData(this.data);
        setTimeout(() => { this.isResizing = false; }, 0);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // --- Popups: Edit/Add Column ---

  private showEditColumnDialog(headerCell: HTMLElement, column: ColumnDef, data: TableData, colIndex: number) {
    const existingPopup = document.querySelector('.json-table-edit-column-popup');
    if (existingPopup) existingPopup.remove();
    const popup = document.body.createEl('div', { cls: 'json-table-popup json-table-edit-column-popup' });
    const rect = headerCell.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 5}px`; popup.style.left = `${rect.left}px`;
    
    // Create wrapper for flex layout
    const wrapper = popup.createEl('div', { cls: 'json-table-popup-wrapper' });
    
    const nameInput = wrapper.createEl('input', { type: 'text', cls: 'json-table-edit-input', value: column.name, placeholder: 'Column name' });
    const editorContainer = wrapper.createEl('div', { cls: 'json-table-column-editor-container' });
    let editor = this.columnEditors.get(column.type) || this.columnEditors.get('text');
    if (editor) editor.render(editorContainer, column, this.data, this.view);
    
    // Delete Column Button
    const deleteBtn = wrapper.createEl('button', { cls: 'json-table-btn json-table-btn--hybrid json-table-btn---delete-column' });
    const deleteIcon = createIconElement(ICON_NAMES.trash, 16);
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.appendText('Delete Column');
    
    nameInput.focus(); nameInput.select();

    const closePopup = () => { popup.remove(); document.removeEventListener('click', clickOutside); };
    const saveColumnName = async () => {
        const newName = nameInput.value.trim();
        let nameChanged = false;
        if (newName && newName !== column.name) { column.name = newName; nameChanged = true; }
        if (nameChanged) {
            await this.view.saveTableData(data);
             // Update header text non-destructively
            const contentWrapper = headerCell.querySelector('.json-table-header-content');
            const textNode = contentWrapper ? Array.from(contentWrapper.childNodes).find(node => node.nodeType === Node.TEXT_NODE) : null;
            if (textNode) { textNode.textContent = newName; }
            else { console.warn("Could not find text node to update header name."); }
            this.render(); // Re-render needed for sort/filter popups
        }
        closePopup();
    };
    const deleteColumn = async () => { /* ... delete logic ... */
        data.columns.splice(colIndex, 1);
        data.rows.forEach((row) => { const i = row.findIndex(c => c.column === column.id); if (i !== -1) row.splice(i, 1); });
        await this.view.saveTableData(data); this.render(); closePopup();
    };

    // Listeners
    deleteBtn.addEventListener('mousedown', (e) => e.preventDefault());
    deleteBtn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); document.removeEventListener('click', clickOutside); await deleteColumn(); });
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveColumnName(); }
        else if (e.key === 'Escape') { e.preventDefault(); closePopup(); }
    });
    const clickOutside = (e: MouseEvent) => { if (!popup.contains(e.target as Node) && !headerCell.contains(e.target as Node)) { saveColumnName(); } };
    setTimeout(() => { document.addEventListener('click', clickOutside); }, 100);
  }

  private showAddColumnDialog(headerCell: HTMLElement, buttonDiv: HTMLElement, data: TableData, onClose: () => void) {
    buttonDiv.style.opacity = '0.5';
    const popup = document.body.createEl('div', { cls: 'json-table-popup json-table-column-popup' });
    const rect = buttonDiv.getBoundingClientRect(); // Position near '+' button
    popup.style.top = `${rect.top}px`; // Align top
    popup.style.right = `${document.body.clientWidth - rect.right}px`; // Align right

    // Create wrapper for flex layout
    const wrapper = popup.createEl('div', { cls: 'json-table-popup-wrapper' });

    const nameInputPopup = wrapper.createEl('input', { type: 'text', cls: 'json-table-edit-input', placeholder: 'New column name' });
    setTimeout(() => nameInputPopup.focus(), 50);
    wrapper.createEl('div', { text: 'Select column type:', cls: 'json-table-popup-label' });
    const typeButtonsContainer = wrapper.createEl('div', { cls: 'json-table-type-buttons' });

    const types = [ /* ... type definitions ... */
        { type: 'text' as const, name: 'Text', icon: ICON_NAMES.text },
        { type: 'checkbox' as const, name: 'Checkbox', icon: ICON_NAMES.checkbox },
        { type: 'dropdown' as const, name: 'Dropdown', icon: ICON_NAMES.dropdown },
        { type: 'multiselect' as const, name: 'Multi-select', icon: ICON_NAMES.multiselect },
        { type: 'notelink' as const, name: 'Note Link', icon: ICON_NAMES.link },
        { type: 'date' as const, name: 'Date', icon: ICON_NAMES.date },
    ];
    const defaultDropdownOptions = [ /* ... default options ... */
        { value: 'To Do', style: 'red' }, { value: 'In Progress', style: 'blue' }, { value: 'Done', style: 'green' }
    ];

    types.forEach(({ type, name, icon }) => {
        const btnDiv = typeButtonsContainer.createEl('div', { cls: 'json-table-btn json-table-btn--hybrid', attr: { role: 'button', tabindex: 0 } });
        const iconEl = createIconElement(icon, 16, `icon-type-${type}`);
        if (iconEl) btnDiv.appendChild(iconEl);
        btnDiv.appendText(name);
        const addAction = () => {
            let extraProps = {};
            if (type === 'dropdown' || type === 'multiselect') extraProps = { typeOptions: { options: defaultDropdownOptions } };
            if (type === 'date') extraProps = { dateFormat: 'YYYY/MM/DD' };
            addColumn(type, name, extraProps);
        };
        btnDiv.addEventListener('click', addAction);
        btnDiv.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addAction(); } });
    });

    // Helpers
    const closePopup = () => { popup.remove(); buttonDiv.style.opacity = '1'; document.removeEventListener('click', clickOutside); document.removeEventListener('keydown', handleEscape); onClose(); };
    const addColumn = async (columnType: string, typeName: string, extraProps: Record<string, any> = {}) => {
        let columnName = nameInputPopup.value.trim() || typeName;
        const columnId = 'col_' + Date.now();
        data.columns.push({ id: columnId, name: columnName, type: columnType, width: 150, ...extraProps });
        data.rows.forEach(row => row.push({ column: columnId, value: '' }));
        await this.view.saveTableData(data);
        this.render();
        closePopup();
    };

    // Listeners
    const clickOutside = (e: MouseEvent) => { if (!popup.contains(e.target as Node) && !buttonDiv.contains(e.target as Node)) { closePopup(); } };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') { closePopup(); } };
    nameInputPopup.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); addColumn('text', 'Text', {}); } });
    setTimeout(() => { document.addEventListener('click', clickOutside); document.addEventListener('keydown', handleEscape); }, 100);
  }

} // End of TableRenderer class