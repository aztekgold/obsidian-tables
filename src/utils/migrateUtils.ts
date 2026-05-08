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

export function isOldFormat(raw: Record<string, unknown>): boolean {
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

export function migrateToAgentable(raw: Record<string, unknown>, filename: string): TableData {
  const title = filename.replace(/\.(table\.json|table\.md)$/i, '');

  const columns: ColumnDef[] = ((raw.columns as unknown[]) || []).map((col: unknown): ColumnDef => {
    const c = col as Record<string, unknown>;
    const opts = (c.typeOptions as Record<string, unknown>) || {};
    const constraints: ColumnConstraints = {};
    const display: ColumnDisplay = {};

    if (c.width != null) display.width = c.width as number;
    const colDisplay = c.display as Record<string, unknown> | undefined;
    if (colDisplay?.width != null) display.width = colDisplay.width as number;

    // dateFormat lives in display per Agentable spec
    if (opts.dateFormat) display.dateFormat = opts.dateFormat as string;
    if (colDisplay?.dateFormat) display.dateFormat = colDisplay.dateFormat as string;
    // migrate if dateFormat was incorrectly stored in constraints
    const colConstraints = c.constraints as Record<string, unknown> | undefined;
    if (colConstraints?.dateFormat) {
      display.dateFormat = colConstraints.dateFormat as string;
    }

    if (opts.options) {
      constraints.options = (opts.options as Record<string, unknown>[]).map((o) => ({
        value: o.value as string,
        color: (o.style ?? o.color) as string | undefined,
      }));
    }
    if (colConstraints?.options) constraints.options = colConstraints.options as ColumnConstraints['options'];
    if (opts.suggestAllFiles != null) constraints.suggestAllFiles = opts.suggestAllFiles as boolean;
    if (colConstraints?.suggestAllFiles != null) constraints.suggestAllFiles = colConstraints.suggestAllFiles as boolean;
    if (opts.wrap != null) constraints.wrap = opts.wrap as boolean;
    if (colConstraints?.wrap != null) constraints.wrap = colConstraints.wrap as boolean;
    if (opts.multiSelect != null) constraints.multiSelect = opts.multiSelect as boolean;
    if (colConstraints?.multiSelect != null) constraints.multiSelect = colConstraints.multiSelect as boolean;

    let type: string = c.type as string;
    if (type === 'checkbox') type = 'boolean';
    else if (type === 'dropdown') type = 'select';
    else if (type === 'multiselect' || type === 'multi-select') {
      type = 'select';
      constraints.multiSelect = true;
    } else if (type === 'notelink' || type === 'wikilink') type = 'link';

    const colId = c.id as string | undefined;
    const colIdTyped: `col_${string}` = colId?.startsWith('col_') ? (colId as `col_${string}`) : `col_${colId ?? _generateColId()}`;

    return {
      id: colIdTyped,
      name: c.name as string,
      type,
      ...(Object.keys(display).length > 0 ? { display } : {}),
      ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
    };
  });

  const rows: AgentableRow[] = ((raw.rows as unknown[]) || []).map((oldRow: unknown): AgentableRow => {
    if (Array.isArray(oldRow)) {
      const cells: Record<string, unknown> = {};
      (oldRow as Array<Record<string, unknown>>).forEach((cell) => { cells[cell.column as string] = cell.value; });
      return { id: generateRowId(), cells };
    }
    const r = oldRow as Record<string, unknown>;
    return { id: (r.id as string) ?? generateRowId(), cells: (r.cells as Record<string, unknown>) ?? {} };
  });

  const existingSortIds = new Set<string>();
  const views: ViewDef[] = (raw.views && (raw.views as unknown[]).length > 0)
    ? (raw.views as unknown[]).map((v: unknown): ViewDef => {
        const vObj = v as Record<string, unknown>;
        const sorts: SortRule[] = ((vObj.sort ?? vObj.sorts ?? []) as unknown[]).map((s: unknown): SortRule => {
          const sObj = s as Record<string, unknown>;
          const sId = sObj.id as string | undefined;
          const sid = (sId?.startsWith('srt_') ? sId : generateSortId(existingSortIds)) as `srt_${string}`;
          existingSortIds.add(sid);
          return { id: sid, columnId: sObj.columnId as string, direction: sObj.direction as 'asc' | 'desc' };
        });
        const vId = vObj.id as string | undefined;
        const viewId: `view_${string}` = vId?.startsWith('view_') ? (vId as `view_${string}`) : `view_${vId ?? _generateViewId()}`;
        return {
          id: viewId,
          name: vObj.name as string,
          sorts,
          filters: ((vObj.filter ?? vObj.filters ?? []) as unknown[]).map((f: unknown): FilterRule => {
            const fObj = f as Record<string, unknown>;
            const fId = fObj.id as string | undefined;
            return {
              id: (fId?.startsWith('flt_') ? fId : `flt_${fId ?? _generateFilterId()}`) as `flt_${string}`,
              columnId: fObj.columnId as string,
              operator: (OPERATOR_MAP[fObj.operator as string] ?? fObj.operator) as FilterOperator,
              value: fObj.value as string | undefined,
            };
          }),
          hiddenColumns: (vObj.hiddenColumns as string[]) ?? [],
          columnOrder: (vObj.columnOrder as string[]) ?? [],
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
      if (!s.id?.startsWith('srt_')) (s as unknown as Record<string, unknown>).id = _generateSortId();
    });
    // Ensure filter rules have prefixed IDs — mutate in place to preserve popup references
    v.filters.forEach(f => {
      if (!f.id?.startsWith('flt_')) {
        const fAny = f as unknown as Record<string, unknown>;
        fAny.id = `flt_${f.id ?? _generateFilterId()}`;
      }
    });
  });
  // Rename legacy type aliases
  data.columns?.forEach(col => {
    if (col.type === 'notelink' || col.type === 'wikilink') col.type = 'link';
    // Migrate dateFormat from constraints to display if present
    const constraintsAny = col.constraints as unknown as Record<string, unknown> | undefined;
    if (constraintsAny?.dateFormat) {
      col.display = { ...col.display, dateFormat: constraintsAny.dateFormat as string };
      const c = { ...(col.constraints as unknown as Record<string, unknown>) };
      delete c.dateFormat;
      col.constraints = c as typeof col.constraints;
    }
  });
}
