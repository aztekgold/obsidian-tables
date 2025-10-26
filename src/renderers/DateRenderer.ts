// src/renderers/DateRenderer.ts
import { App } from 'obsidian';
import { ICellRenderer } from './ICellRenderer';
import { ColumnDef, DateFormat, DateTypeOptions } from '../types'; // Import DateTypeOptions
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { format } from 'date-fns';

// Map to store instances associated with TD elements
const flatpickrInstances = new WeakMap<HTMLElement, flatpickr.Instance>();

export class DateRenderer implements ICellRenderer {

  // Map format names to date-fns format strings
  private formatMap: Record<DateFormat, string> = {
    'MMMM D, YYYY': 'MMMM d, yyyy',
    'MMM D':        'MMM d',
    'DD/MM/YYYY':   'dd/MM/yyyy',
    'MM/DD/YYYY':   'MM/dd/yyyy',
    'YYYY/MM/DD':   'yyyy/MM/dd',
  };

  public render(
    app: App,
    container: HTMLElement, // This is the <td>
    value: string, // Stored as timestamp string
    column: ColumnDef, // Full column definition including typeOptions
    onChange: (newValue: string) => void
  ): void {
    container.empty();
    container.addClass('json-table-date-cell'); // Style the TD directly

    // --- Cleanup previous instance ---
    const oldInstance = flatpickrInstances.get(container);
    if (oldInstance) {
      console.log('Destroying old flatpickr instance for TD:', container);
      oldInstance.destroy();
      flatpickrInstances.delete(container);
    }
    // --- End cleanup ---

    // --- Read dateFormat from typeOptions ---
    const typeOpts = column.typeOptions as DateTypeOptions | undefined;
    const currentFormat = typeOpts?.dateFormat || 'YYYY/MM/DD'; // Default format
    const formatString = this.formatMap[currentFormat];
    // --- End Read ---

    // Try parsing the stored value
    const timestamp = parseInt(value, 10);
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

    // --- Flatpickr Integration ---
    try {
        // Attach flatpickr directly to the date wrapper
        const fpInstance = flatpickr(dateWrapper, {
          clickOpens: true,
          allowInput: false,
          dateFormat: 'U', // Internal format is Unix timestamp (seconds)
          defaultDate: currentDate || undefined, // Use parsed date or undefined
          appendTo: document.body,

          onChange: (selectedDates) => {
              if (selectedDates.length > 0) {
                  const selectedDate = selectedDates[0];
                  const newTimestampMs = selectedDate.getTime();
                  // --- Read format again for immediate update ---
                  const updatedFormatString = this.formatMap[(column.typeOptions as DateTypeOptions)?.dateFormat || 'YYYY/MM/DD'];
                  // --- End Read ---
                  dateSpan.setText(format(selectedDate, updatedFormatString));
                  onChange(newTimestampMs.toString()); // Save as milliseconds string
              } else {
                  // Handle clearing the date
                  dateSpan.setText('');
                  onChange('');
              }
          },
          onOpen: () => console.log('Flatpickr opened for TD:', container),
          onClose: () => console.log('Flatpickr closed for TD:', container),
          onDestroy: () => console.log('Flatpickr instance destroyed for TD:', container)
        });

        console.log('Flatpickr instance created for TD:', container, fpInstance);
        // Store the new instance associated with the TD
        flatpickrInstances.set(container, fpInstance);

    } catch(err) {
        console.error("Failed to initialize flatpickr:", err);
        container.setText('Error initializing date picker');
        return;
    }
  } // End render method
} // End DateRenderer class