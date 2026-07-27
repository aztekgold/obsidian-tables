// src/formula/parser.ts
// Recursive-descent parser for the v1 formula grammar:
//
//   expression   := comparison
//   comparison   := additive ( ( '==' | '>' | '<' ) additive )?   // at most one comparison, no chaining
//   additive     := term ( ( '+' | '-' ) term )*
//   term         := factor ( ( '*' | '/' ) factor )*
//   factor       := NUMBER | STRING | columnRef | functionCall | '(' expression ')' | '-' factor
//   columnRef    := '{{' IDENTIFIER '}}'
//   functionCall := IDENTIFIER '(' ( expression ( ',' expression )* )? ')'
//
// functionCall accepts any identifier + arg list syntactically; which names
// are actually recognized (currently just "if") and how many args they
// require is validated later in inferKind, not here.

import { Token, tokenize } from './tokenizer';
import { FormulaNode } from './ast';

export class FormulaParseError extends Error {}

export function parseFormula(source: string): FormulaNode {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = () => tokens[pos];
  const advance = () => tokens[pos++];
  const expect = (type: Token['type'], desc: string) => {
    const tok = peek();
    if (tok.type !== type) {
      throw new FormulaParseError(`Expected ${desc} at position ${tok.pos}, got "${tok.value || tok.type}"`);
    }
    return advance();
  };

  function parseExpression(): FormulaNode {
    return parseComparison();
  }

  function parseComparison(): FormulaNode {
    let left = parseAdditive();
    const tok = peek();
    if (tok.type === 'operator' && (tok.value === '==' || tok.value === '>' || tok.value === '<')) {
      advance();
      const right = parseAdditive();
      left = { kind: 'binaryOp', op: tok.value as '==' | '>' | '<', left, right };
    }
    return left;
  }

  function parseAdditive(): FormulaNode {
    let left = parseTerm();
    while (peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
      const op = advance().value as '+' | '-';
      const right = parseTerm();
      left = { kind: 'binaryOp', op, left, right };
    }
    return left;
  }

  function parseTerm(): FormulaNode {
    let left = parseFactor();
    while (peek().type === 'operator' && (peek().value === '*' || peek().value === '/')) {
      const op = advance().value as '*' | '/';
      const right = parseFactor();
      left = { kind: 'binaryOp', op, left, right };
    }
    return left;
  }

  function parseFactor(): FormulaNode {
    const tok = peek();

    if (tok.type === 'operator' && tok.value === '-') {
      advance();
      return { kind: 'unaryMinus', operand: parseFactor() };
    }
    if (tok.type === 'number') {
      advance();
      return { kind: 'number', value: parseFloat(tok.value) };
    }
    if (tok.type === 'string') {
      advance();
      return { kind: 'string', value: tok.value };
    }
    if (tok.type === 'columnRef') {
      advance();
      return { kind: 'columnRef', columnId: tok.value };
    }
    if (tok.type === 'identifier') {
      advance();
      expect('lparen', `"(" after "${tok.value}"`);
      const args: FormulaNode[] = [];
      if (peek().type !== 'rparen') {
        args.push(parseExpression());
        while (peek().type === 'comma') {
          advance();
          args.push(parseExpression());
        }
      }
      expect('rparen', '")"');
      return { kind: 'functionCall', name: tok.value.toLowerCase(), args };
    }
    if (tok.type === 'lparen') {
      advance();
      const inner = parseExpression();
      expect('rparen', '")"');
      return inner;
    }
    throw new FormulaParseError(`Unexpected token "${tok.value || tok.type}" at position ${tok.pos}`);
  }

  if (tokens.length === 1 && tokens[0].type === 'eof') {
    throw new FormulaParseError('Formula is empty');
  }

  const result = parseExpression();
  const trailing = peek();
  if (trailing.type !== 'eof') {
    throw new FormulaParseError(`Unexpected token "${trailing.value || trailing.type}" at position ${trailing.pos}`);
  }
  return result;
}
