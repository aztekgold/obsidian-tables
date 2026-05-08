import {
  AGENTABLE_VERSION,
  TableData, ColumnDef, ColumnConstraints, ColumnDisplay,
  AgentableRow, ViewDef, FilterRule, FilterOperator, SortRule,
} from '../types';
import {
  generateRowId as _generateRowId,
  generateColId as _generateColId,
  generateViewId as _generateViewId,
  generateFilterId as _generateFilterId,
  generateSortId as _generateSortId,
} from '@aztekgold/agentable/dist/utils';
import { createDefaultView } from './fileUtils';

export function isOldFormat(raw: any): boolean {
  if (!raw.version) return true;
  if (Array.isArray(raw.rows) && raw.rows.length > 0 && Array.isArray(raw.rows[0])) return true;
  return false;
}

export function generateRowId(): string {
  return _generateRowId();
}

export function generateColId(existing: Set<string> = new Set()): `col_${string}` {
  let id = _generateColId();
  while (existing.has(id)) id = _generateColId();
  return id;
}

export function generateViewId(existing: Set<string> = new Set()): `view_${string}` {
  let id = _generateViewId();
  while (existing.has(id)) id = _generateViewId();
  return id;
}

export function generateFilterId(existing: Set<string> = new Set()): `flt_${string}` {
  let id = _generateFilterId();
  while (existing.has(id)) id = _generateFilterId();
  return id;
}

export function generateSortId(existing: Set<string> = new Set()): `srt_${string}` {
  let id = _generateSortId();
  while (existing.has(id)) id = _generateSortId();
  return id;
}

const OPERATOR_MAP: Record<string, FilterOperator> = {
  equals: 'is',
  notEqual: 'isNot',
};

export function migrateToAgentable(raw: any, filename: string): TableData {
  const title = filename.replace(/\.(table\.json|table\.md)$/i, '');

  const columns: ColumnDef[] = (raw.columns || []).map((col: any): ColumnDef => {
    const opts = col.typeOptions || {};
    const constraints: ColumnConstraints = {};
    const display: ColumnDisplay = {};

    if (col.width != null) display.width = col.width;
    if (col.display?.width != null) display.width = col.display.width;

    // dateFormat lives in display per Agentable spec
    if (opts.dateFormat) display.dateFormat = opts.dateFormat;
    if (col.display?.dateFormat) display.dateFormat = col.display.dateFormat;
    // migrate if dateFormat was incorrectly stored in constraints
    if (col.constraints?.dateFormat) {
      display.dateFormat = col.constraints.dateFormat;
    }

    if (opts.options) {
      constraints.options = opts.options.map((o: any) => ({
        value: o.value,
        color: o.style ?? o.color,
      }));
    }
    if (col.constraints?.options) constraints.options = col.constraints.options;
    if (opts.suggestAllFiles != null) constraints.suggestAllFiles = opts.suggestAllFiles;
    if (col.constraints?.suggestAllFiles != null) constraints.suggestAllFiles = col.constraints.suggestAllFiles;
    if (opts.wrap != null) constraints.wrap = opts.wrap;
    if (col.constraints?.wrap != null) constraints.wrap = col.constraints.wrap;
    if (opts.multiSelect != null) constraints.multiSelect = opts.multiSelect;
    if (col.constraints?.multiSelect != null) constraints.multiSelect = col.constraints.multiSelect;

    let type: string = col.type;
    if (type === 'checkbox') type = 'boolean';
    else if (type === 'dropdown') type = 'select';
    else if (type === 'multiselect' || type === 'multi-select') {
      type = 'select';
      constraints.multiSelect = true;
    } else if (type === 'notelink' || type === 'wikilink') type = 'link';

    const colId: `col_${string}` = col.id?.startsWith('col_') ? col.id : `col_${col.id ?? _generateColId()}`;

    return {
      id: colId,
      name: col.name,
      type,
      ...(Object.keys(display).length > 0 ? { display } : {}),
      ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
    };
  });

  const rows: AgentableRow[] = (raw.rows || []).map((oldRow: any): AgentableRow => {
    if (Array.isArray(oldRow)) {
      const cells: Record<string, any> = {};
      oldRow.forEach((cell: any) => { cells[cell.column] = cell.value; });
      return { id: generateRowId(), cells };
    }
    return { id: oldRow.id ?? generateRowId(), cells: oldRow.cells ?? {} };
  });

  const existingSortIds = new Set<string>();
  const views: ViewDef[] = (raw.views && raw.views.length > 0)
    ? raw.views.map((v: any): ViewDef => {
        const sorts: SortRule[] = (v.sort ?? v.sorts ?? []).map((s: any): SortRule => {
          const sid = (s.id?.startsWith('srt_') ? s.id : generateSortId(existingSortIds)) as `srt_${string}`;
          existingSortIds.add(sid);
          return { id: sid, columnId: s.columnId, direction: s.direction };
        });
        const viewId: `view_${string}` = v.id?.startsWith('view_') ? v.id : `view_${v.id ?? _generateViewId()}`;
        return {
          id: viewId,
          name: v.name,
          sorts,
          filters: (v.filter ?? v.filters ?? []).map((f: any): FilterRule => ({
            id: f.id?.startsWith('flt_') ? f.id : `flt_${f.id ?? _generateFilterId()}`,
            columnId: f.columnId,
            operator: OPERATOR_MAP[f.operator] ?? f.operator,
            value: f.value,
          })),
          hiddenColumns: v.hiddenColumns ?? [],
          columnOrder: v.columnOrder ?? [],
        };
      })
    : [createDefaultView()];

  return {
    version: AGENTABLE_VERSION,
    metadata: { title },
    columns,
    views,
    rows,
  };
}

export function ensureViewsValid(data: TableData): void {
  if (!data.views || data.views.length === 0) {
    data.views = [createDefaultView()];
  }
  data.views.forEach(v => {
    if (!v.sorts) v.sorts = [];
    if (!v.filters) v.filters = [];
    if (!v.hiddenColumns) v.hiddenColumns = [];
    if (!v.columnOrder) v.columnOrder = [];
    // Ensure sort rules have IDs — mutate in place to preserve popup references
    v.sorts.forEach(s => {
      if (!(s as any).id?.startsWith('srt_')) (s as any).id = _generateSortId();
    });
    // Ensure filter rules have prefixed IDs — mutate in place to preserve popup references
    v.filters.forEach(f => {
      if (!(f as any).id?.startsWith('flt_')) {
        (f as any).id = `flt_${(f as any).id ?? _generateFilterId()}`;
      }
    });
  });
  // Rename legacy type aliases
  data.columns?.forEach(col => {
    if (col.type === 'notelink' || col.type === 'wikilink') col.type = 'link';
    // Migrate dateFormat from constraints to display if present
    if ((col.constraints as any)?.dateFormat) {
      col.display = { ...col.display, dateFormat: (col.constraints as any).dateFormat };
      const c = { ...col.constraints } as any;
      delete c.dateFormat;
      col.constraints = c;
    }
  });
}
