import { TableData, ColumnDef, AgentableRow } from './types';
import { parseFormula } from './formula/parser';
import { inferKind, evaluateNode, ValueKind } from './formula/evaluator';
import { FormulaNode } from './formula/ast';

export interface FormulaValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  resultKind?: 'number' | 'date' | 'text';
}

// Shared by SortHandler and FilterHandler (both gt/lt operator gating and
// the actual comparison) to decide whether a column's stored value should
// be compared numerically. A single definition here means the three
// call sites can never drift out of sync with each other. 'date' counts as
// numeric here too - it's still a raw comparable timestamp, "date" only
// matters for display (see FunctionRenderer).
export function isNumericColumn(col: ColumnDef | undefined): boolean {
  if (!col) return false;
  if (col.type === 'date' || col.type === 'number') return true;
  return col.type === 'function' &&
    (col.constraints?.formulaResultKind === 'number' || col.constraints?.formulaResultKind === 'date');
}

const COLUMN_REF_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

// Formulas are AUTHORED against column names ("{{ Price }}") but STORED
// against column ids ("{{ col_abc123 }}"), so a rename never invalidates a
// reference - the id never changes. These two functions are the only place
// that translates between the two; parseFormula()/inferKind()/evaluateNode()
// only ever operate on storage-form (id-based) text.

// Display (typed by the user) -> storage (persisted in constraints.formula).
// A name that doesn't match any column is left untouched, so it still parses
// but surfaces as an "unknown column" error at evaluation - same behavior as
// a typo would have under the old name-based storage. Reports which names
// matched more than one column, so the editor can warn about the resulting
// first-match-wins ambiguity.
export function formulaToStorageText(displayText: string, columns: ColumnDef[]): { text: string; duplicateNames: string[] } {
  const duplicateNames = new Set<string>();
  const text = displayText.replace(COLUMN_REF_PATTERN, (match, rawName: string) => {
    const matches = columns.filter(c => c.name === rawName);
    if (matches.length === 0) return match;
    if (matches.length > 1) duplicateNames.add(rawName);
    return `{{ ${matches[0].id} }}`;
  });
  return { text, duplicateNames: [...duplicateNames] };
}

// Storage -> display, for loading a formula into the editor. An id that no
// longer resolves (its column was deleted) is left as the raw id - still
// valid syntax, it'll just surface as an "unknown column" error, same as
// any other unresolvable reference.
export function formulaToDisplayText(storageText: string, columns: ColumnDef[]): string {
  return storageText.replace(COLUMN_REF_PATTERN, (match, rawId: string) => {
    const col = columns.find(c => c.id === rawId);
    return col ? `{{ ${col.name} }}` : match;
  });
}

// Maps an inferred ValueKind to the persisted 'number'/'text' classification
// Sort/Filter use to decide whether to compare a Function column numerically.
// NUMERIC_DATE counts as numeric here too - a bare `{{ DateColumn }}`
// reference holds the same raw numeric timestamp a Date column does.
function toStoredResultKind(kind: ValueKind): 'number' | 'date' | 'text' {
  if (kind === 'NUMBER') return 'number';
  if (kind === 'NUMERIC_DATE') return 'date';
  return 'text';
}

function collectColumnRefIds(node: FormulaNode, ids: Set<string>): void {
  switch (node.kind) {
    case 'columnRef':
      ids.add(node.columnId);
      return;
    case 'unaryMinus':
      collectColumnRefIds(node.operand, ids);
      return;
    case 'binaryOp':
      collectColumnRefIds(node.left, ids);
      collectColumnRefIds(node.right, ids);
      return;
    case 'functionCall':
      node.args.forEach(arg => collectColumnRefIds(arg, ids));
      return;
    default:
      return;
  }
}

export class FormulaHandler {
  // Which "{rowId}::{columnId}" cells failed to evaluate on the most recent
  // recomputeAll() pass. FunctionRenderer reads this instead of
  // re-evaluating the formula itself on every render - recomputeAll() has
  // already parsed/evaluated everything by the time cells render.
  private erroredCells = new Set<string>();

  // Which column ids each Function column's formula references, rebuilt on
  // every recomputeAll() pass. Lets callers ask "does editing column X
  // matter to any formula" instead of "does any formula exist" - so editing
  // a column no formula depends on doesn't force a full table re-render.
  private columnDependencies = new Map<string, Set<string>>();

  constructor(private data: TableData) {}

  private static cellKey(rowId: string, columnId: string): string {
    return `${rowId}::${columnId}`;
  }

  // True if the given cell's formula failed to evaluate on the last
  // recomputeAll() pass (parse error, type error, unknown column, etc).
  public hasError(rowId: string, columnId: string): boolean {
    return this.erroredCells.has(FormulaHandler.cellKey(rowId, columnId));
  }

  // True if any Function column's formula references the given column id,
  // per the last recomputeAll() pass.
  public dependsOnColumn(columnId: string): boolean {
    for (const deps of this.columnDependencies.values()) {
      if (deps.has(columnId)) return true;
    }
    return false;
  }

  // Parses and type-checks a DISPLAY-form expression (as typed by the user)
  // against the current columns without evaluating it — used for live
  // validation in the formula editor. Translates to storage form first,
  // same as saving would, so validation exactly matches what will actually
  // be persisted.
  public validate(displayExpression: string, columns: ColumnDef[]): FormulaValidationResult {
    const trimmed = displayExpression.trim();
    if (!trimmed) {
      return { valid: false, error: 'Formula is empty' };
    }

    const { text: storageText, duplicateNames } = formulaToStorageText(trimmed, columns);

    let ast: FormulaNode;
    try {
      ast = parseFormula(storageText);
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
    }

    let kind: ValueKind;
    try {
      kind = inferKind(ast, columns);
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
    }

    const warning = duplicateNames.length
      ? `Multiple columns are named ${duplicateNames.map(n => `"${n}"`).join(', ')} — the first match will be used.`
      : undefined;

    return { valid: true, warning, resultKind: toStoredResultKind(kind) };
  }

  // Write-through: recomputes every `type: 'function'` column across the
  // given rows (defaults to the whole table) and writes results directly
  // into row.cells[col.id] - '' on any parse/type/eval failure - so
  // SortHandler/FilterHandler/SearchHandler/generateCsv() keep reading plain
  // cell data with no changes of their own. Parses each formula column's
  // expression once and reuses the AST across all rows, rather than
  // re-parsing per cell. Returns true if any cell's value actually changed,
  // so callers can skip a needless save.
  public recomputeAll(columns: ColumnDef[] = this.data.columns, rows: AgentableRow[] = this.data.rows): boolean {
    // Rebuilt from scratch every pass rather than incrementally cleared, so
    // a deleted row's/column's stale entry can never linger.
    this.erroredCells.clear();
    this.columnDependencies.clear();

    const formulaColumns = columns.filter(c => c.type === 'function');
    if (formulaColumns.length === 0) return false;

    let changed = false;

    formulaColumns.forEach(col => {
      // Self-heals formulas still holding name-based "{{ ColumnName }}" text
      // - either saved before column refs were switched to id-based storage,
      // or hand-edited directly in the file. Idempotent for text that's
      // already id-based: a "{{ }}" ref that doesn't match any column's
      // name just passes through unchanged, so this is safe to run on every
      // pass rather than needing to detect "is this legacy text" up front.
      const rawFormula = col.constraints?.formula ?? '';
      const { text: upgradedFormula } = formulaToStorageText(rawFormula, columns);
      if (upgradedFormula !== rawFormula) {
        col.constraints = { ...col.constraints, formula: upgradedFormula };
        changed = true;
      }

      const expression = upgradedFormula.trim();
      let parsedAst: FormulaNode | null = null;
      let evaluatableAst: FormulaNode | null = null;
      let resultKind: 'number' | 'date' | 'text' | undefined;

      if (expression) {
        try {
          parsedAst = parseFormula(expression);
        } catch {
          parsedAst = null;
        }
        if (parsedAst) {
          try {
            resultKind = toStoredResultKind(inferKind(parsedAst, columns));
            evaluatableAst = parsedAst;
          } catch {
            evaluatableAst = null;
          }
        }
      }

      // Track dependencies from whatever successfully parsed, even if it
      // didn't type-check - so a formula stays "watching" the right columns
      // (and can recover on the next edit to any of them) rather than
      // going dependency-less the moment it breaks.
      const dependencies = new Set<string>();
      if (parsedAst) collectColumnRefIds(parsedAst, dependencies);
      this.columnDependencies.set(col.id, dependencies);

      // Keep formulaResultKind in sync with what the formula actually
      // type-checks to right now, not just what it was when last edited -
      // otherwise Sort/Filter can keep treating a column as numeric long
      // after a column it references changes type (or is deleted) and
      // breaks it.
      if (col.constraints?.formulaResultKind !== resultKind) {
        col.constraints = { ...col.constraints, formulaResultKind: resultKind };
        changed = true;
      }

      rows.forEach(row => {
        let newValue = '';
        if (evaluatableAst) {
          try {
            newValue = String(evaluateNode(evaluatableAst, row, columns));
          } catch {
            this.erroredCells.add(FormulaHandler.cellKey(row.id, col.id));
          }
        } else {
          this.erroredCells.add(FormulaHandler.cellKey(row.id, col.id));
        }
        if (row.cells[col.id] !== newValue) {
          row.cells[col.id] = newValue;
          changed = true;
        }
      });
    });

    return changed;
  }
}
