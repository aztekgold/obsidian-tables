
import { App, setIcon } from 'obsidian';
import { DropdownOption } from '../types';

interface DropdownMenuProps {
    app: App;
    anchor: HTMLElement;
    options: DropdownOption[];
    selectedValues: string[]; // for multi-select
    onSelect: (value: string) => void;
    onClose: () => void;
    multiSelect?: boolean;
    onCreateOption?: (value: string) => void;
}

export class DropdownMenu {
    private menuEl: HTMLElement;
    private scrollContainer: HTMLElement;
    private itemsContainer: HTMLElement;
    private searchInput: HTMLInputElement;
    private allOptions: DropdownOption[];
    private props: DropdownMenuProps;
    private closeHandler: (e: MouseEvent) => void;

    constructor(props: DropdownMenuProps) {
        this.props = props;
        this.allOptions = props.options;

        this.menuEl = document.createElement('div');
        this.menuEl.addClass('menu');
        this.menuEl.addClass('json-table-dropdown-menu'); // Custom class for specific styling if needed
        this.menuEl.addClass('bases-toolbar-menu'); // Requested class
        this.menuEl.addClass('json-table-dropdown-menu-popup'); // Provides fixed positioning + z-index via CSS

        this.scrollContainer = this.menuEl.createDiv({ cls: 'menu-scroll' });
        const menuContainer = this.scrollContainer.createDiv({ cls: 'bases-toolbar-menu-container' });

        // Search Section
        const searchSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        const searchWrapper = searchSection.createDiv({ cls: 'search-input-container' });
        this.searchInput = searchWrapper.createEl('input', {
            type: 'text',
            placeholder: 'Search options...'
        });
        this.searchInput.spellcheck = false;

        // Prevent menu closing when interacting with input
        this.searchInput.addEventListener('click', (ev) => ev.stopPropagation());
        this.searchInput.addEventListener('mousedown', (ev) => ev.stopPropagation());
        this.searchInput.addEventListener('keydown', (ev) => {
            ev.stopPropagation(); // Prevent global hotkeys
        });

        this.searchInput.addEventListener('input', () => {
            this.renderItems(this.searchInput.value);
        });


        // Separator removed


        // Items Section
        const itemsSection = menuContainer.createDiv({ cls: 'bases-toolbar-section' });
        // itemsSection.createDiv({ cls: 'bases-toolbar-section-header', text: 'Options' }); // Optional header
        this.itemsContainer = itemsSection.createDiv({ cls: 'bases-toolbar-items' });

        // Initial Render
        this.renderItems('');

        // Mounting
        document.body.appendChild(this.menuEl);
        this.positionMenu();

        // Focus search
        setTimeout(() => this.searchInput.focus(), 0);

        // Click Outside Handling
        this.closeHandler = (e: MouseEvent) => {
            if (!this.menuEl.contains(e.target as Node) && !this.props.anchor.contains(e.target as Node)) {
                this.close();
            }
        };
        // Delay adding listener to avoid immediate close
        setTimeout(() => document.addEventListener('click', this.closeHandler, true), 0);
    }

    private positionMenu() {
        const rect = this.props.anchor.getBoundingClientRect();
        // Position below the anchor
        let top = rect.bottom + 4;
        let left = rect.left;

        // Simple boundary check (improve later with popper logic if needed)
        const menuRect = this.menuEl.getBoundingClientRect();
        if (top + menuRect.height > window.innerHeight) {
            top = rect.top - menuRect.height - 4; // Flip up
        }
        if (left + menuRect.width > window.innerWidth) {
            left = window.innerWidth - menuRect.width - 10; // Flip left
        }

        this.menuEl.style.top = `${top}px`;
        this.menuEl.style.left = `${left}px`;

        // Ensure min-width matches anchor if anchor is wider
        if (rect.width > 220) {
            this.menuEl.style.width = `${rect.width}px`;
        }
    }

    private renderItems(filter: string) {
        this.itemsContainer.empty();
        const lowerFilter = filter.toLowerCase();
        const trimmedFilter = filter.trim();

        const filteredOptions = this.allOptions.filter(opt =>
            opt.value.toLowerCase().includes(lowerFilter)
        );

        if (filteredOptions.length === 0 && !trimmedFilter) {
            const emptyEl = this.itemsContainer.createDiv({ cls: 'menu-item is-disabled' });
            emptyEl.setText('No options found');
        }

        filteredOptions.forEach(opt => {
            const isSelected = this.props.selectedValues.includes(opt.value);

            const item = this.itemsContainer.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item' });
            if (isSelected) item.addClass('is-selected');

            const info = item.createDiv({ cls: 'bases-toolbar-menu-item-info' });

            const iconWrap = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
            iconWrap.createDiv({ cls: `json-table-color-dot is-small json-table-tag--${opt.color || 'default'}` });

            info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: opt.value });

            if (isSelected) {
                const checkEl = item.createDiv({ cls: 'clickable-icon bases-toolbar-menu-item-icon' });
                setIcon(checkEl, 'check');
            }

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.props.onSelect(opt.value);

                if (!this.props.multiSelect) {
                    this.close();
                } else {
                    if (isSelected) {
                        this.props.selectedValues = this.props.selectedValues.filter(v => v !== opt.value);
                    } else {
                        this.props.selectedValues.push(opt.value);
                    }
                    this.renderItems(this.searchInput.value);
                }
            });
        });

        // "Create X" row — shown when there's input and no exact match
        const exactMatch = this.allOptions.some(opt => opt.value.toLowerCase() === lowerFilter);
        if (trimmedFilter && !exactMatch && this.props.onCreateOption) {
            const createItem = this.itemsContainer.createDiv({ cls: 'suggestion-item bases-toolbar-menu-item json-table-create-option' });

            const info = createItem.createDiv({ cls: 'bases-toolbar-menu-item-info' });
            const iconWrap = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon' });
            setIcon(iconWrap, 'plus');
            info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: `Create "${trimmedFilter}"` });

            createItem.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.props.onCreateOption!(trimmedFilter);
                this.close();
            });
        }
    }

    public close() {
        document.removeEventListener('click', this.closeHandler, true);
        this.menuEl.remove();
        this.props.onClose();
    }
}
