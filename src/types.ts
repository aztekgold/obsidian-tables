// src/types.ts — Agentable V1.0 aligned

export const AGENTABLE_VERSION = 'agentable-1.0.0';

// --- Filter ---

export type FilterOperator =
  | 'contains'
  | 'doesNotContain'  // plugin extension (not in Agentable spec — use with caution)
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'gt'
  | 'lt'
  | 'is'
  | 'isNot';

export interface FilterRule {
  id: `flt_${string}`;
  columnId: string;
  operator: FilterOperator;
  value?: string;
}

// --- View ---

export interface SortRule {
  id: `srt_${string}`;
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface ViewDef {
  id: `view_${string}`;
  name: string;
  sorts: SortRule[];
  filters: FilterRule[];
  hiddenColumns: string[];
  columnOrder: string[];
}

// --- Column ---

export interface DropdownOption {
  value: string;
  color?: string;
}

export type DateFormat =
  | 'MMMM D, YYYY'
  | 'MMM D'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY/MM/DD';

export interface ColumnConstraints {
  options?: DropdownOption[];
  multiSelect?: boolean;
  suggestAllFiles?: boolean;  // plugin extension for link columns
  wrap?: boolean;             // plugin extension for text columns
  formula?: string;           // plugin extension for function columns — raw "{{ ColumnName }}" expression text
  formulaResultKind?: 'number' | 'date' | 'text'; // plugin extension — cached inference of the formula's result type
}

export interface ColumnDisplay {
  width?: number;
  dateFormat?: string;  // moved from constraints per Agentable spec
}

export interface ColumnDef {
  id: `col_${string}`;
  name: string;
  type: string; // spec: 'text'|'number'|'select'|'date'|'boolean'|'url'|'link'; plugin adds legacy aliases and 'function' (not in Agentable spec — use with caution)
  display?: ColumnDisplay;
  constraints?: ColumnConstraints;
}

// --- Row ---

export interface AgentableRow {
  id: string;
  cells: Record<string, unknown>;
}

// --- Root ---

export interface TableData {
  version: string;
  metadata: { title: string };
  policy?: { permissions?: { allowAgentRead?: boolean; allowAgentCreate?: boolean; allowAgentUpdate?: boolean; allowAgentDelete?: boolean } };
  columns: ColumnDef[];
  views: ViewDef[];
  rows: AgentableRow[];
}

// --- Plugin settings (unchanged) ---

export const VIEW_TYPE_JSON_TABLE = 'json-table-view';

export type TableRenderer = 'default' | 'json';

export interface JsonTableSettings {
  tableRenderer: TableRenderer;
  enableBetaFeatures: boolean;
  enableCsvSupport: boolean;
  stickyActionColumn: boolean;
}

export const DEFAULT_SETTINGS: JsonTableSettings = {
  tableRenderer: 'default',
  enableBetaFeatures: false,
  enableCsvSupport: false,
  stickyActionColumn: false,
};
