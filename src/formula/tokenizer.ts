// src/formula/tokenizer.ts

export type TokenType = 'number' | 'string' | 'columnRef' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'identifier' | 'eof';

export interface Token {
  type: TokenType;
  value: string; // raw text — for columnRef this is the trimmed inner name, for operator the symbol
  pos: number;   // character offset in the source, for error messages
}

export class FormulaTokenizeError extends Error {}

const SINGLE_CHAR_OPERATORS = ['>', '<', '+', '-', '*', '/'];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let i = 0;

  const peek = (offset = 0) => source[i + offset];

  while (i < len) {
    const ch = source[i];

    if (/\s/.test(ch)) { i++; continue; }

    // Column reference: {{ Name }}
    if (ch === '{' && peek(1) === '{') {
      const start = i;
      i += 2;
      const nameStart = i;
      const closeIdx = source.indexOf('}}', i);
      if (closeIdx === -1) {
        throw new FormulaTokenizeError(`Unterminated "{{" starting at position ${start}`);
      }
      const name = source.slice(nameStart, closeIdx).trim();
      if (!name) {
        throw new FormulaTokenizeError(`Empty column reference "{{}}" at position ${start}`);
      }
      tokens.push({ type: 'columnRef', value: name, pos: start });
      i = closeIdx + 2;
      continue;
    }

    // String literal: "..." or '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let value = '';
      while (i < len && source[i] !== quote) {
        value += source[i];
        i++;
      }
      if (i >= len) {
        throw new FormulaTokenizeError(`Unterminated string starting at position ${start}`);
      }
      i++; // consume closing quote
      tokens.push({ type: 'string', value, pos: start });
      continue;
    }

    // Number literal
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1) || ''))) {
      const start = i;
      let numStr = '';
      while (i < len && /[0-9.]/.test(source[i])) {
        numStr += source[i];
        i++;
      }
      tokens.push({ type: 'number', value: numStr, pos: start });
      continue;
    }

    // Two-character operator
    if (ch === '=' && peek(1) === '=') {
      tokens.push({ type: 'operator', value: '==', pos: i });
      i += 2;
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: '(', pos: i }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')', pos: i }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',', pos: i }); i++; continue; }

    if (SINGLE_CHAR_OPERATORS.includes(ch)) {
      tokens.push({ type: 'operator', value: ch, pos: i });
      i++;
      continue;
    }

    // Identifier: a bare word, only meaningful as a function name (e.g. "if")
    // immediately followed by "(" - column references always use {{ }}.
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      let word = '';
      while (i < len && /[A-Za-z0-9_]/.test(source[i])) {
        word += source[i];
        i++;
      }
      tokens.push({ type: 'identifier', value: word, pos: start });
      continue;
    }

    throw new FormulaTokenizeError(`Unexpected character "${ch}" at position ${i}`);
  }

  tokens.push({ type: 'eof', value: '', pos: len });
  return tokens;
}
