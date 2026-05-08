// src/renderers/ViewManager.ts

import { TableData, ViewDef } from '../types';
import { JsonTableView } from '../JsonTableView';
import { Notice } from 'obsidian';
import { generateViewId } from '../utils/migrateUtils';

export interface IViewManagerHost {
    data: TableData;
    view: JsonTableView;
    activeViewId: string;
    isInline: boolean;
    lockToView: boolean;
    render(): void;
    setActiveView(viewId: string): void;
    container: Element;
}

export class ViewManager {
    constructor(private host: IViewManagerHost) { }

    public getActiveView(): ViewDef {
        return this.host.data.views.find(v => v.id === this.host.activeViewId) || this.host.data.views[0];
    }

    public createNewView() {
        const newViewId = generateViewId(new Set(this.host.data.views.map(v => v.id)));
        const newViewName = `View ${this.host.data.views.length + 1}`;
        this.host.data.views.push({
            id: newViewId,
            name: newViewName,
            sorts: [],
            filters: [],
            hiddenColumns: [],
            columnOrder: [],
        });
        this.host.activeViewId = newViewId;
        void this.host.view.saveTableData(this.host.data);
        this.host.render();
    }

    public deleteView(viewId: string) {
        if (this.host.data.views.length <= 1) {
            new Notice("Cannot delete the last view.");
            return;
        }
        const index = this.host.data.views.findIndex(v => v.id === viewId);
        if (index !== -1) {
            this.host.data.views.splice(index, 1);
            if (this.host.activeViewId === viewId) {
                this.host.activeViewId = this.host.data.views[0].id;
            }
            void this.host.view.saveTableData(this.host.data);
            this.host.render();
        }
    }

    public renameView(viewId: string, newName: string) {
        const view = this.host.data.views.find(v => v.id === viewId);
        if (view) {
            view.name = newName;
            void this.host.view.saveTableData(this.host.data);
            this.host.render();
        }
    }

    public renderRenameInput() {
        if (this.host.isInline) return;
        const renameContainer = this.host.container.createDiv({ cls: 'json-table-rename-container' });
        const currentFilePath = this.host.view.getFilePath();
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
                const success = await this.host.view.renameFile(newName);
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

    public renderViewTabs() {
        const currentFilePath = this.host.view.getFilePath();
        if (currentFilePath && currentFilePath.endsWith('.csv')) return;
        if (this.host.lockToView) return;

        const tabsContainer = this.host.container.createDiv({ cls: 'json-table-view-tabs' });
        this.host.data.views.forEach(view => {
            const tab = tabsContainer.createDiv({
                cls: `json-table-view-tab ${view.id === this.host.activeViewId ? 'is-active' : ''}`
            });
            const nameSpan = tab.createSpan({ text: view.name, cls: 'json-table-view-name' });

            tab.addEventListener('click', () => {
                if (this.host.activeViewId !== view.id) { this.host.setActiveView(view.id); }
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

            if (this.host.data.views.length > 1) {
                const deleteBtn = tab.createDiv({ cls: 'json-table-view-delete' });
                deleteBtn.setText('×');
                deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteView(view.id); });
            }
        });

        const addBtn = tabsContainer.createDiv({ cls: 'json-table-view-add-btn', attr: { title: 'Add view' } });
        addBtn.setText('+');
        addBtn.addEventListener('click', () => { this.createNewView(); });
    }
}
