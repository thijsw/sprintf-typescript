import type {
  Flags,
  PathSegment,
  Placeholder,
  Ref,
  Specifier,
  Token,
} from './tokens.js';

/**
 * Parses a sprintf-style format string into an array of {@link Token}s.
 *
 * Grammar (PEG-ish):
 *
 * ```
 * format      := (literal | '%%' | placeholder)*
 * placeholder := '%' (explicit | named)? flags? width? precision? specifier
 * explicit    := [1-9][0-9]* '$'
 * named       := '(' path ')'
 * path        := identifier (('.' identifier) | ('[' [0-9]+ ']'))*
 * flags       := '+'? ('0' | "'" any)? '-'?          # order matters
 * width       := [0-9]+
 * precision   := '.' [0-9]+
 * specifier   := [bcdefgijostTuvxX]
 * ```
 *
 * The parser is a simple hand-rolled cursor — no giant regex. It throws a
 * {@link SyntaxError} on malformed input, with the offending position included
 * in the message.
 *
 * Mixing positional (`%s`, `%1$s`) and named (`%(name)s`) placeholders in the
 * same format string is rejected at parse time, matching `sprintf-js`'s
 * documented behaviour.
 */
export function parseFormat(format: string): Token[] {
  const tokens: Token[] = [];
  let literalBuffer = '';
  let cursor = 0;
  let sawPositional = false;
  let sawNamed = false;

  const flushLiteral = (): void => {
    if (literalBuffer.length > 0) {
      tokens.push({ kind: 'literal', text: literalBuffer });
      literalBuffer = '';
    }
  };

  while (cursor < format.length) {
    const ch = format.charAt(cursor);

    if (ch !== '%') {
      literalBuffer += ch;
      cursor += 1;
      continue;
    }

    // `%%` collapses to a single literal `%`.
    if (format.charAt(cursor + 1) === '%') {
      literalBuffer += '%';
      cursor += 2;
      continue;
    }

    flushLiteral();
    const { placeholder, nextCursor } = parsePlaceholder(format, cursor);

    if (placeholder.ref.kind === 'named') {
      sawNamed = true;
    } else {
      sawPositional = true;
    }
    if (sawNamed && sawPositional) {
      throw new SyntaxError(
        'sprintf: cannot mix named (%(key)s) and positional (%s / %1$s) placeholders in the same format string.',
      );
    }

    tokens.push(placeholder);
    cursor = nextCursor;
  }

  flushLiteral();
  return tokens;
}

const SPECIFIERS: ReadonlySet<string> = new Set<Specifier>([
  'b',
  'c',
  'd',
  'i',
  'e',
  'f',
  'g',
  'j',
  'o',
  's',
  't',
  'T',
  'u',
  'v',
  'x',
  'X',
]);

interface PlaceholderParseResult {
  readonly placeholder: Placeholder;
  readonly nextCursor: number;
}

/**
 * Parses a single placeholder starting at the `%` at `start`. Returns both the
 * {@link Placeholder} and the index of the character immediately after it.
 */
function parsePlaceholder(format: string, start: number): PlaceholderParseResult {
  // Cursor begins just past the `%`.
  let i = start + 1;

  // --- Optional ref: explicit positional or named ---
  let ref: Ref = { kind: 'positional-implicit' };

  const firstCh = format.charAt(i);
  if (firstCh >= '1' && firstCh <= '9') {
    // Try explicit positional: digits followed by '$'. If no '$' follows, these
    // digits belong to `width` — rewind and let the width parser pick them up.
    let j = i;
    while (j < format.length && isDigit(format.charAt(j))) j += 1;
    if (format.charAt(j) === '$') {
      ref = { kind: 'positional-explicit', index: Number(format.slice(i, j)) };
      i = j + 1;
    }
  } else if (firstCh === '(') {
    const end = format.indexOf(')', i + 1);
    if (end === -1) {
      throw makeSyntaxError('unterminated named-argument parenthesis', format, i);
    }
    const source = format.slice(i + 1, end);
    ref = { kind: 'named', path: parsePath(source, format, i + 1), source };
    i = end + 1;
  }

  // --- Flags, in fixed order: '+', then '0' or "'<char>'", then '-' ---
  let sign = false;
  let leftAlign = false;
  let padChar = ' ';
  let zeroPad = false;

  if (format.charAt(i) === '+') {
    sign = true;
    i += 1;
  }

  const padLead = format.charAt(i);
  if (padLead === '0') {
    zeroPad = true;
    padChar = '0';
    i += 1;
  } else if (padLead === "'") {
    const custom = format.charAt(i + 1);
    if (custom === '' || custom === '$') {
      throw makeSyntaxError('invalid custom pad character after quote', format, i);
    }
    padChar = custom;
    i += 2;
  }

  if (format.charAt(i) === '-') {
    leftAlign = true;
    i += 1;
  }

  // --- Optional width ---
  let width: number | undefined;
  if (isDigit(format.charAt(i))) {
    const wStart = i;
    while (i < format.length && isDigit(format.charAt(i))) i += 1;
    width = Number(format.slice(wStart, i));
  }

  // --- Optional precision ---
  let precision: number | undefined;
  if (format.charAt(i) === '.') {
    i += 1;
    const pStart = i;
    while (i < format.length && isDigit(format.charAt(i))) i += 1;
    if (i === pStart) {
      throw makeSyntaxError('precision `.` must be followed by at least one digit', format, i);
    }
    precision = Number(format.slice(pStart, i));
  }

  // --- Required specifier ---
  const spec = format.charAt(i);
  if (spec === '') {
    throw makeSyntaxError('missing specifier', format, i);
  }
  if (!SPECIFIERS.has(spec)) {
    throw makeSyntaxError(`unknown specifier "${spec}"`, format, i);
  }
  const specifier = spec as Specifier;
  i += 1;

  const flags: Flags = { sign, leftAlign, padChar, zeroPad };

  const placeholder: Placeholder = {
    kind: 'placeholder',
    source: format.slice(start, i),
    ref,
    flags,
    width,
    precision,
    specifier,
  };
  return { placeholder, nextCursor: i };
}

/**
 * Parses a named-argument path like `foo.bar[0].baz` into a list of
 * {@link PathSegment}s. `format` and `offset` are passed only to enrich error
 * messages.
 */
function parsePath(source: string, format: string, offset: number): PathSegment[] {
  const segments: PathSegment[] = [];
  let i = 0;

  // A path must start with an identifier.
  const first = readIdentifier(source, i);
  if (first === null) {
    throw makePathSyntaxError('expected identifier at start of named-argument path', source, format, offset + i);
  }
  segments.push({ kind: 'key', name: first.text });
  i = first.end;

  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === '.') {
      const ident = readIdentifier(source, i + 1);
      if (ident === null) {
        throw makePathSyntaxError('expected identifier after "."', source, format, offset + i);
      }
      segments.push({ kind: 'key', name: ident.text });
      i = ident.end;
    } else if (ch === '[') {
      const idx = readUintUntil(source, i + 1, ']');
      if (idx === null) {
        throw makePathSyntaxError('expected "[<digits>]" index access', source, format, offset + i);
      }
      segments.push({ kind: 'index', index: idx.value });
      i = idx.end + 1; // past the closing bracket
    } else {
      throw makePathSyntaxError(`unexpected character "${ch}" in named-argument path`, source, format, offset + i);
    }
  }

  return segments;
}

interface IdentifierSlice {
  readonly text: string;
  readonly end: number;
}

/** Reads an identifier (`[A-Za-z_][A-Za-z0-9_]*`) starting at `start`. */
function readIdentifier(source: string, start: number): IdentifierSlice | null {
  const head = source.charAt(start);
  if (!isIdentStart(head)) return null;
  let i = start + 1;
  while (i < source.length && isIdentCont(source.charAt(i))) i += 1;
  return { text: source.slice(start, i), end: i };
}

interface UintSlice {
  readonly value: number;
  readonly end: number;
}

/**
 * Reads a non-negative integer ending at the delimiter character `end`.
 * Returns `null` if no digits are present or the delimiter is missing.
 */
function readUintUntil(source: string, start: number, end: string): UintSlice | null {
  let i = start;
  while (i < source.length && isDigit(source.charAt(i))) i += 1;
  if (i === start || source.charAt(i) !== end) return null;
  return { value: Number(source.slice(start, i)), end: i };
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentCont(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9');
}

function makeSyntaxError(msg: string, format: string, position: number): SyntaxError {
  return new SyntaxError(`sprintf: ${msg} at position ${position} in format string "${format}"`);
}

function makePathSyntaxError(
  msg: string,
  path: string,
  format: string,
  position: number,
): SyntaxError {
  return new SyntaxError(
    `sprintf: ${msg} in named-argument path "${path}" at position ${position} in format string "${format}"`,
  );
}
