import { ColumnDef } from '../types';

// Shared by AbstractTableRenderer (cell-renderer dispatch) and the formula
// engine's contains() (multi-select membership vs substring match), so both
// can never disagree about which columns store their value as a
// comma-joined list of options.
export function isMultiSelectColumn(col: ColumnDef | undefined): boolean {
  if (!col) return false;
  return col.type === 'multiselect' || (col.type === 'select' && col.constraints?.multiSelect === true);
}
