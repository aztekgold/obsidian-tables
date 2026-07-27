// src/formula/evaluator.ts
import { ColumnDef, AgentableRow } from '../types';
import { FormulaNode } from './ast';
import { isMultiSelectColumn } from '../utils/columnUtils';

// BOOLEAN is kept distinct from TEXT (even though both render as plain
// strings) so if()'s condition argument can require "an actual comparison"
// rather than accepting any string-shaped value.
export type ValueKind = 'NUMBER' | 'NUMERIC_DATE' | 'TEXT' | 'BOOLEAN';

export class FormulaTypeError extends Error {}

const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';

// date() format strings support fixed-width numeric tokens only (YYYY, YY,
// MM, DD) - deliberately no bare M/D or month names (MMMM), since a
// variable-width token makes the parse position ambiguous. Everything that
// isn't a token is matched as a literal separator character.
type DateFormatToken = { type: 'YYYY' | 'YY' | 'MM' | 'DD' } | { type: 'literal'; char: string };

function tokenizeDateFormat(format: string): DateFormatToken[] {
  const tokens: DateFormatToken[] = [];
  let i = 0;
  while (i < format.length) {
    if (format.startsWith('YYYY', i)) { tokens.push({ type: 'YYYY' }); i += 4; continue; }
    if (format.startsWith('YY', i)) { tokens.push({ type: 'YY' }); i += 2; continue; }
    if (format.startsWith('MM', i)) { tokens.push({ type: 'MM' }); i += 2; continue; }
    if (format.startsWith('DD', i)) { tokens.push({ type: 'DD' }); i += 2; continue; }
    tokens.push({ type: 'literal', char: format[i] });
    i++;
  }
  return tokens;
}

function validateDateFormat(format: string): void {
  const tokens = tokenizeDateFormat(format);
  const yearCount = tokens.filter(t => t.type === 'YYYY' || t.type === 'YY').length;
  const monthCount = tokens.filter(t => t.type === 'MM').length;
  const dayCount = tokens.filter(t => t.type === 'DD').length;
  if (yearCount !== 1 || monthCount !== 1 || dayCount !== 1) {
    throw new FormulaTypeError(`Invalid date() format "${format}" - expected exactly one year token (YYYY or YY), one MM, and one DD`);
  }
}

function parseDateWithFormat(text: string, format: string): number {
  const tokens = tokenizeDateFormat(format);
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let pos = 0;

  for (const token of tokens) {
    if (token.type === 'literal') {
      if (text[pos] !== token.char) {
        throw new FormulaTypeError(`date(): "${text}" doesn't match format "${format}"`);
      }
      pos++;
      continue;
    }
    const width = token.type === 'YYYY' ? 4 : 2;
    const chunk = text.slice(pos, pos + width);
    if (chunk.length !== width || !/^[0-9]+$/.test(chunk)) {
      throw new FormulaTypeError(`date(): "${text}" doesn't match format "${format}"`);
    }
    const num = parseInt(chunk, 10);
    pos += width;
    if (token.type === 'YYYY') year = num;
    else if (token.type === 'YY') year = 2000 + num;
    else if (token.type === 'MM') month = num;
    else day = num;
  }

  if (pos !== text.length) {
    throw new FormulaTypeError(`date(): "${text}" doesn't match format "${format}"`);
  }
  if (year === null || month === null || day === null || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new FormulaTypeError(`date(): "${text}" is not a valid date for format "${format}"`);
  }

  return new Date(year, month - 1, day).getTime();
}

function resolveColumn(columnId: string, columns: ColumnDef[]): ColumnDef | undefined {
  // Falls back to matching by name if the ref isn't a known id - formulas
  // saved before column refs were switched to id-based storage still have
  // raw names in their stored text, and this keeps them working without
  // requiring the user to retype anything (also a mild defensive measure
  // against hand-edited JSON files using names directly).
  return columns.find(c => c.id === columnId) ?? columns.find(c => c.name === columnId);
}

function kindOfColumn(col: ColumnDef): ValueKind {
  if (col.type === 'number') return 'NUMBER';
  if (col.type === 'date') return 'NUMERIC_DATE';
  return 'TEXT';
}

const isNumericKind = (k: ValueKind) => k === 'NUMBER' || k === 'NUMERIC_DATE';

// Type-checks the AST against the current columns, per the v1 rules:
// arithmetic (+ - * /) requires both sides to be exactly number-typed
// columns/literals; >/< requires both sides to be number or date; ==
// allows any type on either side (compared as text). Throws FormulaTypeError
// with a human-readable message on the first violation found.
export function inferKind(node: FormulaNode, columns: ColumnDef[]): ValueKind {
  switch (node.kind) {
    case 'number':
      return 'NUMBER';
    case 'string':
      return 'TEXT';
    case 'unaryMinus': {
      const operandKind = inferKind(node.operand, columns);
      if (operandKind !== 'NUMBER') {
        throw new FormulaTypeError('Unary "-" can only be used on a number');
      }
      return 'NUMBER';
    }
    case 'columnRef': {
      const col = resolveColumn(node.columnId, columns);
      if (!col) throw new FormulaTypeError(`Unknown column reference "${node.columnId}"`);
      if (col.type === 'function') {
        throw new FormulaTypeError(`"${col.name}" is a Function column — formulas can't reference other Function columns`);
      }
      return kindOfColumn(col);
    }
    case 'binaryOp': {
      const leftKind = inferKind(node.left, columns);
      const rightKind = inferKind(node.right, columns);
      switch (node.op) {
        case '+':
        case '-':
        case '*':
        case '/':
          if (leftKind !== 'NUMBER' || rightKind !== 'NUMBER') {
            throw new FormulaTypeError(`"${node.op}" can only be used between number columns`);
          }
          return 'NUMBER';
        case '>':
        case '<':
          if (!isNumericKind(leftKind) || !isNumericKind(rightKind)) {
            throw new FormulaTypeError(`"${node.op}" can only be used between number or date columns`);
          }
          return 'BOOLEAN';
        case '==':
          return 'BOOLEAN'; // any operand type allowed
      }
      break;
    }
    case 'functionCall':
      return inferFunctionCallKind(node.name, node.args, columns);
  }
  throw new FormulaTypeError('Unrecognized formula node');
}

function inferFunctionCallKind(name: string, args: FormulaNode[], columns: ColumnDef[]): ValueKind {
  switch (name) {
    case 'if': {
      if (args.length !== 2 && args.length !== 3) {
        throw new FormulaTypeError('if() requires 2 or 3 arguments: if(condition, valueIfTrue) or if(condition, valueIfTrue, valueIfFalse)');
      }
      const [condition, whenTrue, whenFalseArg] = args;
      // Omitted else defaults to an empty string, same as an empty cell.
      const whenFalse: FormulaNode = whenFalseArg ?? { kind: 'string', value: '' };
      if (inferKind(condition, columns) !== 'BOOLEAN') {
        throw new FormulaTypeError('The first argument to if() must be a comparison, e.g. {{ Price }} < 10');
      }
      const trueKind = inferKind(whenTrue, columns);
      const falseKind = inferKind(whenFalse, columns);
      // Numeric sort/filter only applies when both branches are guaranteed
      // numbers; any other combination (text, dates, booleans, a mix, or an
      // omitted else) is still perfectly valid, it's just reported as TEXT.
      return trueKind === 'NUMBER' && falseKind === 'NUMBER' ? 'NUMBER' : 'TEXT';
    }
    case 'contains': {
      if (args.length !== 2) {
        throw new FormulaTypeError('contains() requires exactly 2 arguments: contains(column, value)');
      }
      const [source, needle] = args;
      if (source.kind !== 'columnRef') {
        throw new FormulaTypeError('The first argument to contains() must be a column reference, e.g. {{ Tags }}');
      }
      inferKind(source, columns); // validates the column exists and isn't a Function column
      inferKind(needle, columns);
      return 'BOOLEAN';
    }
    case 'today': {
      if (args.length !== 0) {
        throw new FormulaTypeError('today() takes no arguments');
      }
      // Same kind a Date column reference resolves to, so today() can be
      // compared with > / < against a date column, or used arithmetically
      // wherever a date's raw numeric timestamp is expected.
      return 'NUMERIC_DATE';
    }
    case 'date': {
      if (args.length !== 1 && args.length !== 2) {
        throw new FormulaTypeError('date() requires 1 or 2 arguments: date(text) or date(text, format)');
      }
      const [textArg, formatArg] = args;
      inferKind(textArg, columns);
      // The format has to be known at parse time (it drives how the text is
      // sliced up), so it must be a literal string, not a column reference
      // or other expression - "date({{ Raw }}, {{ FormatCol }})" isn't
      // supported.
      if (formatArg && formatArg.kind !== 'string') {
        throw new FormulaTypeError('The second argument to date() must be a literal format string, e.g. "DD/MM/YYYY"');
      }
      if (formatArg) validateDateFormat(formatArg.value);
      return 'NUMERIC_DATE';
    }
    default:
      throw new FormulaTypeError(`Unknown function "${name}()"`);
  }
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : parseFloat(String(value ?? ''));
}

// Evaluates the AST against a single row's cells. Assumes inferKind has
// already validated the AST — this still defensively throws FormulaTypeError
// for runtime issues inferKind can't catch (a cell holding non-numeric text
// in a number/date column, division by zero).
export function evaluateNode(node: FormulaNode, row: AgentableRow, columns: ColumnDef[]): number | string {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'string':
      return node.value;
    case 'unaryMinus':
      return -toNumber(evaluateNode(node.operand, row, columns));
    case 'columnRef': {
      const col = resolveColumn(node.columnId, columns);
      if (!col) throw new FormulaTypeError(`Unknown column reference "${node.columnId}"`);
      const raw = row.cells[col.id];
      if (col.type === 'number' || col.type === 'date') {
        const num = toNumber(raw);
        if (isNaN(num)) {
          throw new FormulaTypeError(`"${col.name}" does not contain a valid ${col.type === 'date' ? 'date' : 'number'}`);
        }
        return num;
      }
      return raw == null ? '' : String(raw);
    }
    case 'binaryOp': {
      const leftVal = evaluateNode(node.left, row, columns);
      const rightVal = evaluateNode(node.right, row, columns);
      switch (node.op) {
        case '+': return toNumber(leftVal) + toNumber(rightVal);
        case '-': return toNumber(leftVal) - toNumber(rightVal);
        case '*': return toNumber(leftVal) * toNumber(rightVal);
        case '/': {
          const divisor = toNumber(rightVal);
          if (divisor === 0) throw new FormulaTypeError('Division by zero');
          return toNumber(leftVal) / divisor;
        }
        case '>': return toNumber(leftVal) > toNumber(rightVal) ? 'true' : 'false';
        case '<': return toNumber(leftVal) < toNumber(rightVal) ? 'true' : 'false';
        case '==': return String(leftVal) === String(rightVal) ? 'true' : 'false';
      }
      break;
    }
    case 'functionCall':
      return evaluateFunctionCall(node.name, node.args, row, columns);
  }
  throw new FormulaTypeError('Unrecognized formula node');
}

function evaluateFunctionCall(name: string, args: FormulaNode[], row: AgentableRow, columns: ColumnDef[]): number | string {
  switch (name) {
    case 'if': {
      const [condition, whenTrue, whenFalseArg] = args;
      const whenFalse: FormulaNode = whenFalseArg ?? { kind: 'string', value: '' };
      const conditionVal = evaluateNode(condition, row, columns);
      return conditionVal === 'true'
        ? evaluateNode(whenTrue, row, columns)
        : evaluateNode(whenFalse, row, columns);
    }
    case 'contains': {
      const [source, needleNode] = args;
      // inferKind already guaranteed `source` is a columnRef to a real column.
      if (source.kind !== 'columnRef') {
        throw new FormulaTypeError('The first argument to contains() must be a column reference');
      }
      const col = resolveColumn(source.columnId, columns);
      if (!col) throw new FormulaTypeError(`Unknown column reference "${source.columnId}"`);
      const rawValue = row.cells[col.id];
      const haystack = rawValue == null ? '' : String(rawValue);
      const needle = String(evaluateNode(needleNode, row, columns));

      if (isMultiSelectColumn(col)) {
        const options = haystack.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
        return options.includes(needle.toLowerCase()) ? 'true' : 'false';
      }
      return haystack.toLowerCase().includes(needle.toLowerCase()) ? 'true' : 'false';
    }
    case 'today': {
      // Local midnight, not the exact current moment - Date columns store
      // the day a user picked with no time component, so comparing against
      // "right now" would make a due date of today flip to "overdue" the
      // instant any time has passed since midnight rather than once the
      // day itself has passed.
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }
    case 'date': {
      const [textArg, formatArg] = args;
      const text = String(evaluateNode(textArg, row, columns));
      const format = formatArg && formatArg.kind === 'string' ? formatArg.value : DEFAULT_DATE_FORMAT;
      return parseDateWithFormat(text, format);
    }
    default:
      throw new FormulaTypeError(`Unknown function "${name}()"`);
  }
}
