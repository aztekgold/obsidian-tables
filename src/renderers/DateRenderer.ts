// src/renderers/DateRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef, DateFormat, DateTypeOptions } from '../types'; // Import DateTypeOptions
import flatpickr from 'flatpickr';
// flatpickr CSS is included in styles.scss
import { format } from 'date-fns';

// Map to store instances associated with TD elements
const flatpickrInstances = new WeakMap<HTMLElement, flatpickr.Instance>();

export class DateRenderer implements ICellRenderer {

  // Map format names to date-fns format strings
  private formatMap: Record<DateFormat, string> = {
    'MMMM D, YYYY': 'MMMM d, yyyy',
    'MMM D': 'MMM d',
    'DD/MM/YYYY': 'dd/MM/yyyy',
    'MM/DD/YYYY': 'MM/dd/yyyy',
    'YYYY/MM/DD': 'yyyy/MM/dd',
  };

  public render(
    app: App,
    container: HTMLElement, // This is the <td>
    value: any, // Stored as timestamp string (or number)
    column: ColumnDef, // Full column definition including typeOptions
    onChange: (newValue: any) => void
  ): void {
    container.empty();
    container.addClass('json-table-date-cell'); // Style the TD directly

    // --- Cleanup previous instance ---
    const oldInstance = flatpickrInstances.get(container);
    if (oldInstance) {
      oldInstance.destroy();
      flatpickrInstances.delete(container);
    }
    // --- End cleanup ---

    // --- Read dateFormat from typeOptions ---
    const typeOpts = column.typeOptions as DateTypeOptions | undefined;
    const currentFormat = typeOpts?.dateFormat || 'YYYY/MM/DD'; // Default format
    const formatString = this.formatMap[currentFormat];
    // --- End Read ---

    // Parse timestamp - handle both number and string for compatibility
    const timestamp = typeof value === 'number' ? value : parseInt(value, 10);
    let displayDate = ''; // Placeholder for empty/invalid
    let currentDate: Date | null = null;

    if (!isNaN(timestamp)) {
      currentDate = new Date(timestamp);
      try {
        displayDate = format(currentDate, formatString);
      } catch (e) {
        console.error("Error formatting date:", e);
        displayDate = "Invalid Date";
        currentDate = null; // Treat as invalid if formatting fails
      }
    }

    // Create date wrapper directly in the cell (no content wrapper)
    const dateWrapper = container.createEl('div', { cls: 'json-table-date-wrapper' });

    // Display the formatted date
    const dateSpan = dateWrapper.createSpan({
      text: displayDate,
      cls: 'json-table-date-display'
    });

    // --- Lazy Flatpickr Integration ---
    const initFlatpickr = () => {
      // Check if already initialized for this render cycle
      if (flatpickrInstances.has(container)) return;

      try {
        // Ensure shared container exists for scoping
        let flatpickrContainer = document.body.querySelector('.json-table-flatpickr-container');
        if (!flatpickrContainer) {
          flatpickrContainer = document.createElement('div');
          flatpickrContainer.className = 'json-table-flatpickr-container';
          document.body.appendChild(flatpickrContainer);
        }

        const fpInstance = flatpickr(dateWrapper, {
          clickOpens: true,
          allowInput: false,
          dateFormat: 'U',
          defaultDate: currentDate || undefined,
          appendTo: flatpickrContainer as HTMLElement,
          onClose: () => {
            // Optional: Destroy on close to save memory? 
            // For now we keep it while the cell exists to handle multiple clicks in same "session"
          },
          onChange: (selectedDates) => {
            if (selectedDates.length > 0) {
              const selectedDate = selectedDates[0];
              const newTimestampMs = selectedDate.getTime();
              const updatedFormatString = this.formatMap[(column.typeOptions as DateTypeOptions)?.dateFormat || 'YYYY/MM/DD'];
              dateSpan.setText(format(selectedDate, updatedFormatString));
              onChange(newTimestampMs.toString());
            } else {
              dateSpan.setText('');
              onChange('');
            }
          },
        });

        flatpickrInstances.set(container, fpInstance);
        fpInstance.open(); // Open immediately on first click
      } catch (err) {
        console.error("Failed to initialize flatpickr:", err);
      }
    };

    dateWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      initFlatpickr();
    });
  } // End render method
} // End DateRenderer class