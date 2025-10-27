// src/types.ts

// --- Define Filter Structure ---
export type FilterOperator =
  | 'contains'
  | 'doesNotContain'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'equals' // Added for exact match
  | 'notEqual'; // Added for exact non-match

export interface FilterRule {
  id: string; // Unique ID for the filter rule (e.g., filter_12345)
  columnId: string;
  operator: FilterOperator;
  value?: string; // Value to compare against (not needed for empty/notEmpty)
}

// --- View Definitions ---
export interface SortRule {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface ViewDef {
  id: string; // Unique ID for the view (e.g., "default_12345")
  name: string; // User-facing name (e.g., "Default View")
  sort: SortRule[]; // Array to support multi-sort later
  filter: FilterRule[]; // Array for filters
  hiddenColumns?: string[]; // Optional array of hidden column IDs
}
// --- End View Definitions ---


// --- Column Type Specific Interfaces ---

// Options for dropdown/multiselect
export interface DropdownOption {
  value: string;
  style?: string; // e.g., 'red', 'blue', 'default'
}

// Date format options
export type DateFormat =
  | 'MMMM D, YYYY' // Full Date: October 8, 2025
  | 'MMM D'        // Short Date: Oct 8
  | 'DD/MM/YYYY'   // Day/Month/Year: 01/12/2025
  | 'MM/DD/YYYY'   // Month/Day/Year: 12/25/2025
  | 'YYYY/MM/DD';  // Year/Month/Day: 2025/02/22

// Options specific to Date columns
export interface DateTypeOptions {
  dateFormat?: DateFormat;
}

// Options specific to Dropdown and MultiSelect columns
export interface SelectTypeOptions {
  options?: DropdownOption[];
}

// Options specific to NoteLink columns
export interface NoteLinkTypeOptions {
  suggestAllFiles?: boolean;
}

// Union type encompassing all possible type-specific options
// Add other interfaces here if types like 'number' get options
export type TypeOptions =
  | DateTypeOptions
  | SelectTypeOptions
  | NoteLinkTypeOptions
  | {}; // Empty object for types with no options (text, checkbox)

// --- Core Data Structures ---

// Defines a single column in the table
export interface ColumnDef {
  id: string; // Unique identifier for the column (e.g., "col_12345")
  name: string; // User-facing column header name
  type: string; // Data type (e.g., "text", "date", "dropdown", "multiselect", "checkbox", "notelink")
  width?: number; // Optional column width in pixels
  typeOptions?: TypeOptions; // Nested object for type-specific settings
}

// Defines a single cell's data within a row
export interface CellData {
  column: string; // The ID of the column this cell belongs to
  value: string; // The raw data stored for the cell (always a string)
}

// Represents the entire table data structure saved in the file
export interface TableData {
  columns: ColumnDef[]; // Array of column definitions
  rows: CellData[][]; // Array of rows, where each row is an array of cells
  views: ViewDef[]; // Array of view configurations (sort, filter, hidden columns)
}

// --- Plugin Specific Constants and Settings ---

// Unique identifier for the custom view type registered with Obsidian
export const VIEW_TYPE_JSON_TABLE = 'json-table-view';

// Defines the structure for the plugin's settings
export type TableRenderer = 'default' | 'json';

export interface JsonTableSettings {
  tableRenderer: TableRenderer; // 'default' uses .table.md, 'json' uses .table.json
}

// Default values for the plugin settings
export const DEFAULT_SETTINGS: JsonTableSettings = {
  tableRenderer: 'default' // Default to using .table.md files for compatibility
}