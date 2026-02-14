// src/TableRenderer.ts

import { TableData, ColumnDef, CellData, ViewDef, JsonTableSettings, DEFAULT_SETTINGS } from './types'; // Adjust path if needed
import { JsonTableView } from './JsonTableView'; // Adjust path if needed
import { Notice } from 'obsidian';

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
import { positionPopup } from './utils/popup';

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
  private activeViewId: string; // Track the currently active view
  private isInline: boolean; // Flag to indicate if this is an inline table
  private settings: JsonTableSettings;

  constructor(
    private container: Element,
    private data: TableData,
    private view: JsonTableView,
    isInline: boolean = false, // Default to false
    settings: JsonTableSettings = DEFAULT_SETTINGS
  ) {
    this.isInline = isInline;
    this.settings = settings;

    // Ensure views exist
    if (!this.data.views || this.data.views.length === 0) {
      this.data.views = [{ id: 'default_' + Date.now(), name: 'Default', sort: [], filter: [] }];
    }
    // Set active view to the first one by default
    this.activeViewId = this.data.views[0].id;

    // Init registries
    this.cellRenderers = new Map();
    this.registerRenderers();
    this.columnEditors = new Map();
    this.registerColumnEditors();

    // Instantiate Handlers - Pass a callback to get the ACTIVE view
    this.sortHandler = new SortHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
    this.filterHandler = new FilterHandler(this.data, () => this.render(), this.view, () => this.getActiveView());
  }

  // --- View Management Helpers ---

  private getActiveView(): ViewDef {
    return this.data.views.find(v => v.id === this.activeViewId) || this.data.views[0];
  }

  private setActiveView(viewId: string) {
    this.activeViewId = viewId;
    this.render();
  }

  private createNewView() {
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

  private deleteView(viewId: string) {
    if (this.data.views.length <= 1) {
      new Notice("Cannot delete the last view.");
      return;
    }

    const index = this.data.views.findIndex(v => v.id === viewId);
    if (index !== -1) {
      this.data.views.splice(index, 1);
      // If we deleted the active view, switch to the first one
      if (this.activeViewId === viewId) {
        this.activeViewId = this.data.views[0].id;
      }
      this.view.saveTableData(this.data);
      this.render();
    }
  }

  private renameView(viewId: string, newName: string) {
    const view = this.data.views.find(v => v.id === viewId);
    if (view) {
      view.name = newName;
      this.view.saveTableData(this.data);
      this.render(); // Re-render to update tab name
    }
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
    // If inline, do NOT render the title/rename input
    if (this.isInline) return;

    const renameContainer = this.container.createDiv({ cls: 'json-table-rename-container' });

    // Get the current file name without extension
    const currentFilePath = this.view.getFilePath();
    if (!currentFilePath) return;

    const fileName = currentFilePath.substring(currentFilePath.lastIndexOf('/') + 1);
    const nameWithoutExt = fileName.replace(/\.(table\.json|table\.md)$/, '');

    const renameInput = renameContainer.createEl('input', {
      type: 'text',
      cls: 'json-table-rename-input inline-title', // Add inline-title class
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

  // --- View Tabs Rendering ---

  private renderViewTabs() {
    const tabsContainer = this.container.createDiv({ cls: 'json-table-view-tabs' });

    this.data.views.forEach(view => {
      const tab = tabsContainer.createDiv({
        cls: `json-table-view-tab ${view.id === this.activeViewId ? 'is-active' : ''}`
      });

      // View Name (Editable on double click)
      const nameSpan = tab.createSpan({ text: view.name, cls: 'json-table-view-name' });

      // Click to switch view
      tab.addEventListener('click', () => {
        if (this.activeViewId !== view.id) {
          this.setActiveView(view.id);
        }
      });

      // Double click to rename
      tab.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = tab.createEl('input', {
          type: 'text',
          value: view.name,
          cls: 'json-table-view-rename-input'
        });
        nameSpan.hide();
        input.focus();
        input.select();

        const saveName = () => {
          const newName = input.value.trim();
          if (newName) {
            this.renameView(view.id, newName);
          } else {
            nameSpan.show();
            input.remove();
          }
        };

        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            nameSpan.show();
            input.remove();
          }
        });
      });

      // Delete button (only if more than 1 view)
      if (this.data.views.length > 1) {
        const deleteBtn = tab.createDiv({ cls: 'json-table-view-delete' });
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Confirm deletion?
          this.deleteView(view.id);
        });
      }
    });

    // Add View Button
    const addBtn = tabsContainer.createDiv({ cls: 'json-table-view-add-btn', attr: { title: 'Add View' } });
    addBtn.innerHTML = '+';
    addBtn.addEventListener('click', () => {
      this.createNewView();
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



    // Render View Tabs
    this.renderViewTabs();

    // Render controls (Sort & Filter buttons)
    // Render controls (Sort & Filter buttons)
    const controlsContainer = this.container.createDiv({ cls: 'json-table-controls' });

    // Left controls group (Sort, Filter, Show/Hide)
    const leftControls = controlsContainer.createDiv({ cls: 'json-table-controls-left' });

    // Right controls group (Settings)
    const rightControls = controlsContainer.createDiv({ cls: 'json-table-controls-right' });

    // Sort Button
    const sortButton = leftControls.createEl('button', {
      cls: 'json-table-btn json-table-btn--standard json-table-sort-button',
      attr: { 'aria-label': 'Sort table' }
    });
    const sortIcon = createIconElement(ICON_NAMES.sort, 16, 'icon-sort');
    sortButton.appendChild(sortIcon);
    sortButton.appendText(' Sort');

    // Check active sort state
    const activeSort = this.sortHandler.getCurrentSortRules();
    const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;
    if (isSortActive) {
      sortButton.addClass('json-table-btn--active');
    }

    sortButton.addEventListener('click', () => {
      this.sortHandler.showSortPopup(sortButton);
    });

    // Filter Button
    const filterButton = leftControls.createEl('button', {
      cls: 'json-table-btn json-table-btn--standard json-table-filter-button',
      attr: { 'aria-label': 'Filter table' }
    });
    const filterIcon = createIconElement(ICON_NAMES.filter, 16, 'icon-filter');
    filterButton.appendChild(filterIcon);
    filterButton.appendText(' Filter');

    // Check active filter state
    if (this.filterHandler.hasActiveFilters()) {
      filterButton.addClass('json-table-btn--active');
    }

    filterButton.addEventListener('click', () => {
      this.filterHandler.showFilterPopup(filterButton);
    });

    // Properties Button (Visibility)
    const propsButton = leftControls.createEl('button', {
      cls: 'json-table-btn json-table-btn--standard json-table-props-button',
      attr: { 'aria-label': 'Column visibility' }
    });

    const propsIcon = createIconElement(ICON_NAMES.eye, 16, 'icon-props');
    propsButton.appendChild(propsIcon);
    propsButton.appendText(' Show/Hide'); // Updated text
    propsButton.addEventListener('click', () => {
      this.showPropertyVisibilityPopup(propsButton);
    });

    // --- Settings Button (Updated) ---
    const settingsButton = rightControls.createEl('button', {
      cls: 'json-table-btn json-table-btn--icon json-table-settings-button', // Icon-only button style
      attr: { 'aria-label': 'Table settings', title: 'Table settings' }
    });
    // Use 'moreVertical' icon (3 dots vertical)
    const settingsIcon = createIconElement(ICON_NAMES.moreVertical, 16, 'icon-settings');
    settingsButton.appendChild(settingsIcon);

    settingsButton.addEventListener('click', () => {
      this.showSettingsPopup(settingsButton);
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

  // --- Helper for Visible Columns ---

  private getVisibleColumns(): ColumnDef[] {
    const activeView = this.getActiveView();
    const hiddenCols = activeView.hiddenColumns || [];
    return this.data.columns.filter(col => !hiddenCols.includes(col.id));
  }

  // --- Table Structure Rendering ---

  private renderColGroup() {
    if (!this.colGroup) return;
    this.colGroup.empty();

    const visibleColumns = this.getVisibleColumns();

    // Check sort state
    const activeSort = this.sortHandler.getCurrentSortRules();
    const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

    // Render col for Drag Handle (if not sorted AND beta features enabled AND not inline/embed)
    if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
      const dragCol = this.colGroup.createEl('col');
      dragCol.style.width = '30px'; // Fixed width for drag handle
      dragCol.addClass('json-table-drag-col');
    }

    // Render col for each visible column
    visibleColumns.forEach((col, index) => {
      const colEl = this.colGroup!.createEl('col');
      colEl.style.width = col.width ? `${col.width}px` : '150px';
      // Add data-col-index for resizing logic
      colEl.setAttribute('data-col-index', index.toString());
    });

    // Render col for the "Add Column" button area (fixed width)
    const addColEl = this.colGroup.createEl('col');
    addColEl.style.width = '100px';
  }

  // --- Header Rendering ---

  private renderHeader(table: HTMLTableElement) {
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    const visibleColumns = this.getVisibleColumns();
    let draggedColumnId: string | null = null; // Track ID instead of index

    // Check sort state
    const activeSort = this.sortHandler.getCurrentSortRules();
    const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;

    // Render Drag Handle Header (Empty)
    if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
      headerRow.createEl('th', { cls: 'json-table-header-cell json-table-drag-handle-header' });
    }

    // Render Data Columns
    visibleColumns.forEach((col, visibleIndex) => {
      const realIndex = this.data.columns.findIndex(c => c.id === col.id);
      const th = headerRow.createEl('th', { cls: 'json-table-header-cell' });

      // Enable drag for columns (Always enabled)
      th.draggable = true;

      // We can keep data-col-index as visible index for CSS/layout purposes if needed, 
      // but for logic we should use IDs or lookups.
      th.setAttribute('data-col-index', visibleIndex.toString());

      const contentWrapper = th.createEl('div', { cls: 'json-table-header-content' });
      const iconSvg = TYPE_ICONS[col.type];
      if (iconSvg) {
        const iconEl = createIconElement(iconSvg, 14, `icon-col-${col.type}`);
        if (iconEl) contentWrapper.appendChild(iconEl);
      }
      contentWrapper.appendText(col.name);

      const resizeHandle = th.createEl('div', { cls: 'json-table-resize-handle' });
      resizeHandle.addEventListener('mousedown', (e) => { this.onResizeStart(e, col, realIndex); });

      // Drag and Drop Listeners (Column Reordering)
      th.addEventListener('dragstart', (e) => {
        if ((e.target as HTMLElement).classList.contains('json-table-resize-handle')) {
          e.preventDefault();
          return;
        }
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          draggedColumnId = col.id; // Store ID
          th.classList.add('is-dragging');
        }
      });

      th.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
        th.classList.add('is-dragover');
      });

      th.addEventListener('dragleave', () => {
        th.classList.remove('is-dragover');
      });

      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('is-dragover');
        if (!draggedColumnId) return;

        const targetColumnId = col.id;
        if (draggedColumnId === targetColumnId) return;

        // Find real indices
        const fromIndex = this.data.columns.findIndex(c => c.id === draggedColumnId);
        const toIndex = this.data.columns.findIndex(c => c.id === targetColumnId);

        if (fromIndex === -1 || toIndex === -1) return;

        // Move the column in the data array
        const draggedColumn = this.data.columns.splice(fromIndex, 1)[0];
        this.data.columns.splice(toIndex, 0, draggedColumn);

        this.view.saveTableData(this.data);
        this.render();
      });

      th.addEventListener('dragend', () => {
        th.classList.remove('is-dragging');
        draggedColumnId = null;
      });

      // Edit Column Click Listener
      th.addEventListener('click', (e) => {
        if (this.isResizing) {
          this.isResizing = false;
          return;
        }
        if ((e.target as HTMLElement).classList.contains('json-table-resize-handle')) {
          return;
        }
        e.stopPropagation();
        // Pass the REAL index to the edit dialog
        this.showEditColumnDialog(th, col, this.data, realIndex);
      });
    }); // End visible columns loop

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

  // --- Properties / Visibility Popup ---

  private showPropertyVisibilityPopup(button: HTMLElement) {
    // Remove existing popup if any
    const existingPopup = document.querySelector('.json-table-props-popup');
    if (existingPopup) {
      existingPopup.remove();
      return;
    }

    const popup = document.body.createEl('div', { cls: 'json-table-popup json-table-props-popup' });
    const rect = button.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 5}px`;
    popup.style.left = `${rect.left}px`;

    // Header
    popup.createEl('h3', { text: 'Column Visibility' });

    const list = popup.createEl('div', { cls: 'json-table-props-list' });
    const activeView = this.getActiveView();
    // Ensure hiddenColumns array exists
    if (!activeView.hiddenColumns) {
      activeView.hiddenColumns = [];
    }

    this.data.columns.forEach(col => {
      const item = list.createEl('div', { cls: 'json-table-props-item' });

      // Label
      const label = item.createEl('label');

      // Checkbox
      const checkbox = label.createEl('input', { type: 'checkbox' });
      const isHidden = activeView.hiddenColumns!.includes(col.id);
      checkbox.checked = !isHidden; // Checked means visible

      checkbox.addEventListener('change', async () => {
        if (checkbox.checked) {
          // Make visible: remove from hiddenColumns
          activeView.hiddenColumns = activeView.hiddenColumns!.filter(id => id !== col.id);
        } else {
          // Make hidden: add to hiddenColumns
          if (!activeView.hiddenColumns!.includes(col.id)) {
            activeView.hiddenColumns!.push(col.id);
          }
        }
        await this.view.saveTableData(this.data);
        this.render();
      });

      // Add Icon before name
      const iconName = TYPE_ICONS[col.type];
      if (iconName) {
        const iconEl = createIconElement(iconName, 14, 'json-table-props-icon');
        // Add some margin to the icon
        iconEl.style.marginRight = '6px';
        iconEl.style.display = 'inline-flex';
        label.appendChild(iconEl);
      }

      label.createSpan({ text: col.name });
    });

    // Close on click outside
    const closePopup = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && e.target !== button) {
        popup.remove();
        document.removeEventListener('click', closePopup);
      }
    };
    // Delay adding listener to avoid immediate close
    setTimeout(() => document.addEventListener('click', closePopup), 0);
  }

  // --- Body Rendering ---

  private renderBody(table: HTMLTableElement, rowsToRender: CellData[][]) { // Accept filtered rows
    const tbody = table.createEl('tbody');

    // Build row index map once before loop - O(N) instead of O(N²)
    const rowIndexMap = new Map<CellData[], number>();
    this.data.rows.forEach((row, idx) => rowIndexMap.set(row, idx));

    // Check if sort is active
    const activeSort = this.sortHandler.getCurrentSortRules();
    const isSortActive = activeSort.length > 0 && activeSort[0].columnId !== null;
    let draggedRowIndex: number | null = null;

    rowsToRender.forEach((row) => { // Iterate over filtered rows
      const tr = tbody.createEl('tr', { cls: 'json-table-row' });

      // Fast O(1) lookup instead of O(N) findIndex
      const originalRowIndex = rowIndexMap.get(row) ?? -1;

      // --- Row Drag Handle Cell (Only if no sort active AND beta features enabled AND not inline/embed) ---
      if (!isSortActive && this.settings.enableBetaFeatures && !this.isInline) {
        tr.draggable = true;

        // Create dedicated cell for the handle
        const handleCell = tr.createEl('td', { cls: 'json-table-cell json-table-drag-handle-cell' });
        const handleContent = handleCell.createEl('div', { cls: 'json-table-cell-content json-table-drag-handle-content' });

        // Use 'gripVertical' as a grip handle
        const icon = createIconElement(ICON_NAMES.gripVertical, 14, 'json-table-row-drag-icon');
        handleContent.appendChild(icon);

        // Drag Events on the TR (dragging the whole row)
        tr.addEventListener('dragstart', (e) => {
          draggedRowIndex = originalRowIndex;
          tr.addClass('is-dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // e.dataTransfer.setDragImage(tr, 0, 0); // Optional: Custom drag image
          }
        });

        tr.addEventListener('dragover', (e) => {
          e.preventDefault(); // Allow drop
          if (draggedRowIndex === null || draggedRowIndex === originalRowIndex) return;

          if (draggedRowIndex < originalRowIndex) {
            tr.addClass('is-dragover-bottom');
            tr.removeClass('is-dragover-top');
          } else {
            tr.addClass('is-dragover-top');
            tr.removeClass('is-dragover-bottom');
          }

          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        });

        tr.addEventListener('dragleave', () => {
          tr.removeClass('is-dragover-top');
          tr.removeClass('is-dragover-bottom');
        });

        tr.addEventListener('drop', async (e) => {
          e.stopPropagation(); // Stop bubbling
          tr.removeClass('is-dragover-top');
          tr.removeClass('is-dragover-bottom');

          // Capture and reset draggedRowIndex immediately to prevent double-firing
          const currentIndex = draggedRowIndex;
          draggedRowIndex = null;

          if (currentIndex === null || currentIndex === originalRowIndex) return;

          // Perform move
          const movedRow = this.data.rows.splice(currentIndex, 1)[0];

          // Insert at the target index.
          // Note: If dragging down (currentIndex < originalRowIndex), the removal shifted 
          // subsequent items (including the target) down by 1 index. 
          // So inserting at originalRowIndex places it AFTER the original target.
          // If dragging up (currentIndex > originalRowIndex), the target index is unaffected.
          // Inserting at originalRowIndex places it BEFORE the original target.
          this.data.rows.splice(originalRowIndex, 0, movedRow);

          await this.view.saveTableData(this.data);
          this.render();
        });

        tr.addEventListener('dragend', () => {
          tr.removeClass('is-dragging');
          tr.removeClass('is-dragover-top');
          tr.removeClass('is-dragover-bottom');
          draggedRowIndex = null;
        });
      }

      this.renderRow(tr, row, this.getVisibleColumns(), originalRowIndex, this.data); // Pass visible columns

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
    const wrapper = container.createEl('div', { cls: 'json-table-add-row-wrapper' }); // New wrapper

    const addRowBtn = wrapper.createEl('div', { cls: 'json-table-add-row' });
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
        if (!newRowData.hasOwnProperty(rule.columnId)) return;

        if (rule.operator === 'equals') {
          // Handle boolean values explicitly
          if (typeof rule.value === 'boolean') {
            newRowData[rule.columnId] = rule.value ? 'true' : 'false';
          } else if (rule.value) {
            newRowData[rule.columnId] = rule.value.toString();
          }
        } else if (rule.operator === 'contains' && rule.value) {
          // Handle 'contains' for multi-select (append value)
          const colDef = this.data.columns.find(c => c.id === rule.columnId);
          if (colDef && colDef.type === 'multiselect') {
            const currentVal = newRowData[rule.columnId];
            const valToAdd = rule.value.toString();
            if (currentVal) {
              // Avoid duplicates
              const parts = currentVal.split(',');
              if (!parts.includes(valToAdd)) {
                newRowData[rule.columnId] = currentVal + ',' + valToAdd;
              }
            } else {
              newRowData[rule.columnId] = valToAdd;
            }
          }
        }
      });

      const newRow: CellData[] = Object.entries(newRowData).map(([colId, val]) => ({
        column: colId, value: val
      }));

      this.data.rows.push(newRow); // Add to unfiltered data
      await this.view.saveTableData(this.data);
      this.render(); // Re-render applies filters/sort
    });

    // Add row count display
    const rowCount = this.data.rows.length;
    const rowCountEl = wrapper.createEl('div', { cls: 'json-table-row-count' });
    rowCountEl.createSpan({ text: 'Rows: ', cls: 'json-table-row-count-label' });
    rowCountEl.createSpan({ text: rowCount.toString(), cls: 'json-table-row-count-value' });
  }


  // --- Column Resizing ---

  private onResizeStart(e: MouseEvent, column: ColumnDef, colIndex: number) {
    if (!this.colGroup) return;
    this.isResizing = true;
    e.preventDefault(); e.stopPropagation();

    // Find the visible index of the column being resized
    // The colIndex passed here is the REAL index in data.columns (from renderHeader)
    // We need the VISIBLE index to find the matching <col> element
    const visibleColumns = this.getVisibleColumns();
    const visibleIndex = visibleColumns.findIndex(c => c.id === column.id);

    if (visibleIndex === -1) { this.isResizing = false; return; }

    const colElement = this.colGroup.querySelector(`col[data-col-index="${visibleIndex}"]`) as HTMLTableColElement | null;
    if (!colElement) { this.isResizing = false; return; }
    const startX = e.clientX; const startWidth = colElement.offsetWidth;
    const onMouseMove = (moveE: MouseEvent) => {
      // Update width dynamically during resize
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
    // Position popup dynamically based on header cell location
    positionPopup(popup, headerCell);

    // Create wrapper for flex layout
    const wrapper = popup.createEl('div', { cls: 'json-table-popup-wrapper' });

    // 1. Column Name Input
    const nameInput = wrapper.createEl('input', { type: 'text', cls: 'json-table-edit-input', value: column.name, placeholder: 'Column name' });

    // 2. Column Type Selector
    const typeContainer = wrapper.createEl('div', { cls: 'json-table-type-selector-container' });
    typeContainer.createEl('span', { text: 'Type:', cls: 'json-table-label' });
    const typeSelect = typeContainer.createEl('select', { cls: 'json-table-type-select' });

    const types = [
      { value: 'text', label: 'Text' },
      { value: 'checkbox', label: 'Checkbox' },
      { value: 'dropdown', label: 'Dropdown' },
      { value: 'multiselect', label: 'Multi-select' },
      { value: 'notelink', label: 'Note Link' },
      { value: 'date', label: 'Date' }
    ];

    types.forEach(t => {
      const option = typeSelect.createEl('option', { value: t.value, text: t.label });
      if (column.type === t.value) option.selected = true;
    });

    // 3. Editor Container (Specific options like Dropdown values)
    const editorContainer = wrapper.createEl('div', { cls: 'json-table-column-editor-container' });

    // Helper to render the specific editor
    const renderEditor = () => {
      editorContainer.empty();
      let editor = this.columnEditors.get(column.type) || this.columnEditors.get('text');
      if (editor) editor.render(editorContainer, column, this.data, this.view);
    };

    // Initial render
    renderEditor();

    // Type Change Handler
    typeSelect.addEventListener('change', async () => {
      const newType = typeSelect.value;
      if (newType === column.type) return;

      // Update Type
      column.type = newType;

      // Handle Type Options Defaults
      if (newType === 'dropdown' || newType === 'multiselect') {
        // If switching from text/other to select, or between select types, ensure options exist
        if (!column.typeOptions || !('options' in column.typeOptions)) {
          // Add default options if none exist
          column.typeOptions = {
            options: [
              { value: 'Option 1', style: 'grey' },
              { value: 'Option 2', style: 'grey' },
              { value: 'Option 3', style: 'grey' }
            ]
          };
        }
      } else if (newType === 'date') {
        column.typeOptions = { dateFormat: 'YYYY/MM/DD' };
      } else {
        // For text, checkbox etc we can clear options or leave them as ignored debris
        // Clearing is cleaner
        column.typeOptions = {};
      }

      // Save and Re-render everything
      await this.view.saveTableData(data);
      renderEditor(); // Update the editor UI in popup
      this.render(); // Update the main table UI (icons, cell renderers)
    });


    // Delete Column Button
    const deleteBtn = wrapper.createEl('button', { cls: 'json-table-btn json-table-btn--hybrid json-table-btn---delete-column' });
    const deleteIcon = createIconElement(ICON_NAMES.trash, 16);
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.appendText('Delete Column');

    nameInput.focus(); nameInput.select();

    const closePopup = () => { popup.remove(); document.removeEventListener('click', clickOutside); };

    // Save Name Logic
    const saveColumnName = async () => {
      const newName = nameInput.value.trim();
      let nameChanged = false;
      if (newName && newName !== column.name) { column.name = newName; nameChanged = true; }
      if (nameChanged) {
        await this.view.saveTableData(data);
        // Look up the header cell again in case things moved/re-rendered (though safer to re-render)
        this.render();
      }
      closePopup();
    };

    const deleteColumn = async () => {
      data.columns.splice(colIndex, 1);
      data.rows.forEach((row) => { const i = row.findIndex(c => c.column === column.id); if (i !== -1) row.splice(i, 1); });
      await this.view.saveTableData(data);
      this.render();
      closePopup();
    };

    // Listeners
    deleteBtn.addEventListener('mousedown', (e) => e.preventDefault());
    deleteBtn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); document.removeEventListener('click', clickOutside); await deleteColumn(); });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveColumnName(); }
      else if (e.key === 'Escape') { e.preventDefault(); closePopup(); }
    });

    const clickOutside = (e: MouseEvent) => {
      // Important: Don't close if clicking inside the popup
      if (!popup.contains(e.target as Node) && !headerCell.contains(e.target as Node)) {
        saveColumnName();
      }
    };
    setTimeout(() => { document.addEventListener('click', clickOutside); }, 100);
  }

  private showAddColumnDialog(headerCell: HTMLElement, buttonDiv: HTMLElement, data: TableData, onClose: () => void) {
    buttonDiv.addClass('is-dimmed');
    const popup = document.body.createEl('div', { cls: 'json-table-popup json-table-column-popup' });
    // Position popup dynamically near the '+' button
    positionPopup(popup, buttonDiv, { align: 'auto' });

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
    const closePopup = () => { popup.remove(); buttonDiv.removeClass('is-dimmed'); document.removeEventListener('click', clickOutside); document.removeEventListener('keydown', handleEscape); onClose(); };
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
    nameInputPopup.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addColumn('text', 'Text', {}); } });
    setTimeout(() => { document.addEventListener('click', clickOutside); document.addEventListener('keydown', handleEscape); }, 100);
  }

  // --- Settings Popup ---

  private showSettingsPopup(button: HTMLButtonElement) {
    const existingPopup = document.querySelector('.json-table-settings-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.body.createEl('div', { cls: 'json-table-popup json-table-settings-popup' });

    // Position using helper (align right for settings button)
    positionPopup(popup, button, { align: 'right' });

    // Header
    const header = popup.createEl('div', { cls: 'json-table-popup-header' });
    header.createEl('h3', { text: 'Settings', cls: 'json-table-popup-title' });

    // Content
    const content = popup.createEl('div', { cls: 'json-table-popup-content' });

    // Export CSV Option (Raw Data)
    const exportOption = content.createEl('div', { cls: 'json-table-popup-option' });
    const exportBtn = exportOption.createEl('button', {
      cls: 'json-table-btn json-table-btn--full-width',
      text: ' Export Table as CSV' // Add space for icon
    });
    const exportIcon = createIconElement(ICON_NAMES.download, 16);
    exportBtn.prepend(exportIcon);

    exportBtn.addEventListener('click', () => {
      this.exportToCsv();
      closePopup();
    });

    // Export View CSV Option (Filtered & Sorted)
    const exportViewOption = content.createEl('div', { cls: 'json-table-popup-option' });
    const exportViewBtn = exportViewOption.createEl('button', {
      cls: 'json-table-btn json-table-btn--full-width',
      text: ' Export View to CSV' // Add space for icon
    });
    const exportViewIcon = createIconElement(ICON_NAMES.download, 16);
    exportViewBtn.prepend(exportViewIcon);

    exportViewBtn.addEventListener('click', () => {
      this.exportViewToCsv();
      closePopup();
    });

    // Close logic
    const closePopup = () => {
      popup.remove();
      document.removeEventListener('click', clickOutside, true);
    };

    const clickOutside = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && !button.contains(e.target as Node)) {
        closePopup();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', clickOutside, true);
    }, 0);
  }

  // --- Export Logic ---

  private exportToCsv() {
    // Export raw data (all columns, all rows, no sort/filter)
    const columns = this.data.columns;
    const rows = this.data.rows;
    this.generateAndDownloadCsv(columns, rows, 'table_export');
  }

  private exportViewToCsv() {
    // Export view data (visible columns, filtered & sorted rows)

    // 1. Get Visible Columns
    const visibleColumns = this.getVisibleColumns();

    // 2. Get Filtered Rows
    let rowsToExport = this.filterHandler.getFilteredRows();

    // 3. Apply Sort (in-memory copy for export)
    // Note: sortDataInMemory sorts this.data.rows in place. 
    // We need to sort the filtered rows without affecting the main data if possible, 
    // OR rely on the fact that the main data might already be sorted if we just rendered?
    // Actually, sortDataInMemory sorts `this.data.rows`. `getFilteredRows` returns a new array (subset).
    // The current implementation of `sortDataInMemory` sorts `this.data.rows`.
    // If the table is currently rendered, `this.data.rows` IS sorted.
    // However, `getFilteredRows` filters `this.data.rows`. 
    // So if `this.data.rows` is sorted, `getFilteredRows` returns sorted rows (mostly, order preserved).
    // Let's verify: `this.data.rows.filter(...)` preserves order.
    // So if `this.data.rows` is already sorted by `sortHandler.sortDataInMemory()`, then `rowsToExport` is also sorted.
    // BUT, `sortDataInMemory` might not have been called if we just loaded? 
    // `render()` calls `sortHandler.sortDataInMemory()`.
    // So if the user is seeing the table, it is sorted.

    // However, to be safe and explicit (and not rely on side effects), let's manually sort the filtered rows copy.
    // We can reuse the sort logic or just trust the current state.
    // Given `sortDataInMemory` modifies `this.data.rows` in place, the source of `getFilteredRows` is already sorted.
    // So `rowsToExport` should be in the correct order.

    this.generateAndDownloadCsv(visibleColumns, rowsToExport, 'view_export');
  }

  private generateAndDownloadCsv(columns: any[], rows: any[][], defaultFilename: string) {
    if (!columns || !rows) {
      new Notice('No data to export.');
      return;
    }

    // Build CSV Content
    const csvRows: string[] = [];

    // Header Row
    const headerRow = columns.map(col => this.escapeCsvField(col.name)).join(',');
    csvRows.push(headerRow);

    // Data Rows
    rows.forEach(row => {
      const rowData = columns.map(col => {
        const cell = row.find((c: any) => c.column === col.id);
        return this.escapeCsvField(cell?.value || '');
      });
      csvRows.push(rowData.join(','));
    });

    const csvContent = csvRows.join('\n');

    // Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    // Generate filename
    const filename = this.view.getDisplayText() || defaultFilename;
    // Append suffix if view export? Maybe not needed if user chooses filename.
    // Let's just use the note name.
    const suffix = defaultFilename === 'view_export' ? '_view' : '';
    link.setAttribute('download', `${filename}${suffix}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private escapeCsvField(field: string): string {
    if (field === null || field === undefined) return '';
    let stringField = String(field);

    // Check if field contains comma, quote, or newline
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
      // Escape double quotes by doubling them
      stringField = stringField.replace(/"/g, '""');
      // Wrap in double quotes
      return `"${stringField}"`;
    }
    return stringField;
  }

} // End of TableRenderer class