// src/renderers/NoteLinkRenderer.ts

import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef, NoteLinkTypeOptions } from '../types'; // Import NoteLinkTypeOptions
import { FileSuggest } from '../suggesters/FileSuggest';

export class NoteLinkRenderer implements ICellRenderer {

  // Main render method required by the interface
  public render(
    app: App,
    container: HTMLElement, // This is the <td>
    value: string,
    column: ColumnDef, // We receive the full column definition
    onChange: (newValue: string) => void
  ): void {
    container.empty(); // Clear td

    // Add wrapper directly to the cell (no content wrapper)
    const wrapper = container.createEl('div', {
      cls: 'json-table-notelink-wrapper'
    });

    // Start by rendering the display mode, passing the column info
    this.renderDisplay(app, wrapper, value, column, onChange);
  }

  /** Renders the link (or "empty" state) */
  private renderDisplay(
    app: App,
    wrapper: HTMLElement, // Wrapper div
    value: string,
    column: ColumnDef, // Pass column info through
    onChange: (newValue: string) => void
  ) {
    wrapper.empty();
    wrapper.addClass('is-displaying-link'); // Add styles for display mode

    const file = app.metadataCache.getFirstLinkpathDest(value, ""); // Check if value is valid link

    // Click listener for the whole wrapper (to enter edit mode)
    wrapper.addEventListener('click', (e) => {
      // If the target is the wrapper itself (padding), open edit mode.
      if (e.target === wrapper) {
        this.renderEdit(app, wrapper, value, column, onChange); // Pass column
      }
    });

    if (file) {
      // Valid link: Render clickable link
      const link = wrapper.createEl('a', {
        text: file.basename,
        cls: 'internal-link',
        attr: { 'data-href': value, 'href': value }
      });

      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Stop click bubbling to wrapper
        app.workspace.openLinkText(value, "", false);
      });

    } else {
      // Invalid link or empty: Render placeholder text
      wrapper.createEl('span', {
        text: value || '', // Show invalid text or placeholder
        cls: 'json-table-notelink-empty'
      });
      // Wrapper's click listener handles entering edit mode
    }
  }

  /** Renders the input box for editing */
  private renderEdit(
    app: App,
    wrapper: HTMLElement, // Wrapper div
    value: string,
    column: ColumnDef, // Receive column info
    onChange: (newValue: string) => void
  ) {
    // Clone wrapper to remove old listeners
    const parent = wrapper.parentNode;
    if (!parent) return;
    const newWrapper = wrapper.cloneNode(false) as HTMLElement;
    parent.replaceChild(newWrapper, wrapper);

    newWrapper.empty(); // Clear display content
    newWrapper.removeClass('is-displaying-link'); // Remove display styles/padding

    const input = newWrapper.createEl('input', {
      type: 'text',
      value: value,
      cls: 'json-table-input'
    });

    let saveCalled = false; // Flag to prevent double saves

    // Save helper function
    const save = (saveValue: string) => {
      if (saveCalled) return;
      saveCalled = true;


      if (!newWrapper.parentElement) return; // Check if still in DOM

      const linkText = saveValue.trim();
      let savePath = linkText; // Default to saving raw text

      // If text exists, try to resolve it to a full path
      if (linkText) {
        const file = app.metadataCache.getFirstLinkpathDest(linkText, "");
        if (file) {
          savePath = file.path; // Save the resolved path
        }
      }

      onChange(savePath); // Trigger the change callback
      // Re-render display mode with the new value (pass column)
      this.renderDisplay(app, newWrapper, savePath, column, onChange);
    };

    // --- Instantiate the suggester using typeOptions ---
    const typeOpts = column.typeOptions as NoteLinkTypeOptions | undefined;
    const suggestAll = !!typeOpts?.suggestAllFiles; // Read from typeOptions, default false

    const suggester = new FileSuggest(
      app,
      input,
      suggestAll, // Pass the setting
      (selectedValue) => { save(selectedValue); } // Pass the save callback
    );
    // --- End Suggester Instantiation ---

    // Delay focus
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    // Keydown listener for Enter/Escape
    input.addEventListener('keydown', (e) => {
      const isSuggesterOpen = !!document.body.querySelector('.suggestion-container');

      if (e.key === 'Enter') {
        e.preventDefault();
        if (isSuggesterOpen) {
          return; // Let suggester handle Enter
        }
        save(input.value); // Save raw input value if suggester closed
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (isSuggesterOpen) {
          suggester.close();
        } else {
          // Cancel edit: re-render display mode (pass column)
          this.renderDisplay(app, newWrapper, value, column, onChange);
        }
      }
    });

    // Blur listener (save on click away)
    input.addEventListener('blur', (e) => {
      // Delay slightly to allow suggester's save to run first
      setTimeout(() => {
        if (!saveCalled) {
          save(input.value);
        }
      }, 100);
    });
  } // End renderEdit method
} // End NoteLinkRenderer class