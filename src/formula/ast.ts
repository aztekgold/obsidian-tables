// src/formula/ast.ts

export type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  // columnId, not a display name - parseFormula() only ever runs against
  // storage-form text (see FormulaHandler's formulaToStorageText/
  // formulaToDisplayText), where "{{ ... }}" refs have already been
  // resolved to a stable column id, so renames never invalidate them.
  | { kind: 'columnRef'; columnId: string }
  | { kind: 'unaryMinus'; operand: FormulaNode }
  | { kind: 'binaryOp'; op: '+' | '-' | '*' | '/' | '==' | '>' | '<'; left: FormulaNode; right: FormulaNode }
  | { kind: 'functionCall'; name: string; args: FormulaNode[] };
