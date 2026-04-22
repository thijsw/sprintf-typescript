import type { Placeholder, Specifier, Token } from './tokens.js';

/**
 * Renders a parsed token stream against the runtime argument list.
 *
 * This function implements the runtime semantics of each specifier. Specifiers
 * that expect numbers throw a {@link TypeError} when given a non-coercible
 * value, matching `sprintf-js`. For `%j` (JSON) the placeholder's `width` is
 * reinterpreted as the JSON indent — and padding/alignment does not apply.
 *
 * Function-valued arguments are invoked at render time with no arguments, and
 * the return value is used in their place — except for `%T` (type tag) and
 * `%v` (primitive value), where the function is treated as the value itself.
 */
export function formatTokens(tokens: readonly Token[], args: readonly unknown[]): string {
  let out = '';
  // 1-based cursor mirrors sprintf's numbering of positional args — however we
  // expose args as 0-based to callers, so we adjust when indexing.
  let implicitCursor = 0;

  for (const token of tokens) {
    if (token.kind === 'literal') {
      out += token.text;
      continue;
    }

    const placeholder = token;
    let rawArg: unknown;
    switch (placeholder.ref.kind) {
      case 'positional-implicit':
        rawArg = args[implicitCursor];
        implicitCursor += 1;
        break;
      case 'positional-explicit':
        // Format strings use 1-based indices; the runtime tuple is 0-based.
        rawArg = args[placeholder.ref.index - 1];
        break;
      case 'named':
        rawArg = resolveNamedArg(args, placeholder);
        break;
    }

    // Lazily evaluate function-valued args, but %T and %v get the callable itself.
    const arg =
      typeof rawArg === 'function' &&
      placeholder.specifier !== 'T' &&
      placeholder.specifier !== 'v'
        ? (rawArg as () => unknown)()
        : rawArg;

    if (placeholder.specifier === 'j') {
      // JSON is emitted verbatim; width reinterpreted as indent.
      out += JSON.stringify(arg, null, placeholder.width ?? 0);
      continue;
    }

    const body = renderBody(placeholder.specifier, arg, placeholder);
    out += applyAlignmentAndPadding(body, placeholder);
  }

  return out;
}

/**
 * Walks the named-argument path against the single object argument. Throws
 * with a helpful message when the path encounters `null` or `undefined`.
 */
function resolveNamedArg(args: readonly unknown[], placeholder: Placeholder): unknown {
  if (placeholder.ref.kind !== 'named') {
    throw new Error('unreachable: expected named ref');
  }
  // Named placeholders consume the single "named args" object, which must be
  // supplied as the first runtime argument.
  let value: unknown = args[0];
  for (const segment of placeholder.ref.path) {
    if (value === null || value === undefined) {
      throw new TypeError(
        `sprintf: cannot read property of ${String(value)} while resolving %(${placeholder.ref.source})`,
      );
    }
    if (segment.kind === 'key') {
      value = (value as Record<string, unknown>)[segment.name];
    } else {
      value = (value as ReadonlyArray<unknown>)[segment.index];
    }
  }
  return value;
}

/**
 * Per-specifier body rendering. Returns the textual body *without* width
 * padding or sign prefix (those are composed by {@link applyAlignmentAndPadding}).
 */
function renderBody(specifier: Specifier, arg: unknown, placeholder: Placeholder): string {
  switch (specifier) {
    case 's': {
      const s = String(arg);
      return placeholder.precision !== undefined ? s.slice(0, placeholder.precision) : s;
    }
    case 'd':
    case 'i':
      return String(requireInt(arg, specifier));
    case 'b':
      return requireInt(arg, specifier).toString(2);
    case 'o':
      return toUint32(requireInt(arg, specifier)).toString(8);
    case 'u':
      return String(toUint32(requireInt(arg, specifier)));
    case 'x':
      return toUint32(requireInt(arg, specifier)).toString(16);
    case 'X':
      return toUint32(requireInt(arg, specifier)).toString(16).toUpperCase();
    case 'c':
      return String.fromCharCode(requireInt(arg, specifier));
    case 'e': {
      const n = requireFloat(arg, specifier);
      return placeholder.precision !== undefined
        ? n.toExponential(placeholder.precision)
        : n.toExponential();
    }
    case 'f': {
      const n = requireFloat(arg, specifier);
      return placeholder.precision !== undefined ? n.toFixed(placeholder.precision) : String(n);
    }
    case 'g': {
      const n = requireFloat(arg, specifier);
      if (placeholder.precision === undefined) return String(n);
      // `toPrecision` introduces trailing zeros; round-tripping through Number
      // strips them, matching typical %g behaviour.
      return String(Number(n.toPrecision(placeholder.precision)));
    }
    case 't': {
      const s = String(Boolean(arg));
      return placeholder.precision !== undefined ? s.slice(0, placeholder.precision) : s;
    }
    case 'T': {
      const s = typeTag(arg);
      return placeholder.precision !== undefined ? s.slice(0, placeholder.precision) : s;
    }
    case 'v': {
      const primitive =
        arg !== null && arg !== undefined && typeof (arg as { valueOf?: () => unknown }).valueOf === 'function'
          ? (arg as { valueOf: () => unknown }).valueOf()
          : arg;
      const s = String(primitive);
      return placeholder.precision !== undefined ? s.slice(0, placeholder.precision) : s;
    }
    case 'j':
      // Handled in the caller — JSON does not go through body rendering.
      throw new Error('unreachable: %j is rendered inline');
  }
}

/**
 * Applies the `+` sign flag, width, and padding rules. Sign handling only
 * engages for the "true number" specifiers `d i e f g` — matching sprintf-js,
 * since the bit-twiddling specifiers (`b o u x X`) already produce unsigned
 * output, and `c` / `s` / `t` / `T` / `v` / `j` are not numeric.
 */
function applyAlignmentAndPadding(body: string, placeholder: Placeholder): string {
  let text = body;
  let sign = '';
  const { flags, width, specifier } = placeholder;
  const signEligible =
    specifier === 'd' ||
    specifier === 'i' ||
    specifier === 'e' ||
    specifier === 'f' ||
    specifier === 'g';

  if (signEligible) {
    const isNegative = text.startsWith('-');
    if (isNegative) {
      sign = '-';
      text = text.slice(1);
    } else if (flags.sign) {
      sign = '+';
    }
  }

  if (width === undefined) {
    return sign + text;
  }

  const padLength = width - (sign.length + text.length);
  if (padLength <= 0) {
    return sign + text;
  }
  const pad = flags.padChar.repeat(padLength);

  if (flags.leftAlign) {
    return sign + text + pad;
  }
  if (flags.padChar === '0') {
    // Zero-pad places the sign *before* the zeros so the number reads as one
    // block (e.g. `-0042` not `000-42`).
    return sign + pad + text;
  }
  return pad + sign + text;
}

/** Coerce `arg` to an integer or throw a `TypeError` matching sprintf-js. */
function requireInt(arg: unknown, specifier: Specifier): number {
  const n = typeof arg === 'number' ? arg : Number(arg);
  if (Number.isNaN(n)) {
    throw new TypeError(
      `sprintf: expected a number for %${specifier}, got ${describe(arg)}`,
    );
  }
  // Truncate toward zero, matching `parseInt`-like behaviour.
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}

/** Coerce `arg` to a float or throw a `TypeError` matching sprintf-js. */
function requireFloat(arg: unknown, specifier: Specifier): number {
  const n = typeof arg === 'number' ? arg : Number(arg);
  if (Number.isNaN(n)) {
    throw new TypeError(
      `sprintf: expected a number for %${specifier}, got ${describe(arg)}`,
    );
  }
  return n;
}

/** Coerce a signed integer to unsigned 32-bit, as used by `%o`, `%u`, `%x`, `%X`. */
function toUint32(n: number): number {
  return n >>> 0;
}

/** The value used by `%T`: the lowercased internal class name. */
function typeTag(arg: unknown): string {
  return Object.prototype.toString.call(arg).slice(8, -1).toLowerCase();
}

function describe(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  const t = typeof arg;
  return t === 'object' ? typeTag(arg) : t;
}
