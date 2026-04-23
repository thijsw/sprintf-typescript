import { formatTokens } from './formatter.js'
import { parseFormat } from './parser.js'
import type { Token } from './tokens.js'
import type { ArgsOf, FormatResult, ParseFormat } from './types/index.js'

/**
 * When `F` is the unrefined `string` type (e.g. a runtime variable), we cannot
 * parse it at the type level, so we fall back to accepting any arguments.
 * Otherwise we derive the arg shape from the format literal.
 */
type ArgsFor<F extends string> = string extends F
  ? readonly unknown[]
  : ArgsOf<ParseFormat<F>>

/** Likewise for the return type: only narrow when `F` is a literal. */
type ResultFor<
  F extends string,
  A extends readonly unknown[],
> = string extends F ? string : FormatResult<ParseFormat<F>, A>

/**
 * Upper bound on the parse-tree cache. Prevents unbounded growth if callers
 * pass a large number of distinct, user-controlled format strings.
 */
const MAX_CACHE_SIZE = 1024

const parseCache = new Map<string, readonly Token[]>()

/** Returns the parse tree for `format`, memoised across calls. */
function getParseTree(format: string): readonly Token[] {
  const cached = parseCache.get(format)
  if (cached !== undefined) {
    return cached
  }
  const tokens = parseFormat(format)
  if (parseCache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest entry to keep cache size bounded. `Map` iterates in
    // insertion order, so `keys().next()` gives us the eldest key.
    const eldest = parseCache.keys().next()
    if (!eldest.done) {
      parseCache.delete(eldest.value)
    }
  }
  parseCache.set(format, tokens)
  return tokens
}

/**
 * Formats a string according to `format`, substituting each placeholder with
 * the corresponding argument.
 *
 * @example
 * ```ts
 * sprintf('Hello, %s!', 'world');
 * // ⇒ "Hello, world!"
 *
 * sprintf('%(name)s is %(age)d', { name: 'Dolly', age: 3 });
 * // ⇒ "Dolly is 3"
 * ```
 *
 * The generic overload parses `format` at the type level so the argument
 * tuple (or named-args object) is type-checked against the placeholders, and
 * the return type is narrowed to the computed template-literal wherever
 * possible. The plain-string overload is used when `format` is not a literal
 * or when inference hits the TypeScript recursion limit.
 */
export function sprintf<const F extends string, const A extends ArgsFor<F>>(
  format: F,
  ...args: A
): ResultFor<F, A>
export function sprintf(format: string, ...args: unknown[]): string {
  return formatTokens(getParseTree(format), args)
}

/**
 * Identical to {@link sprintf} but accepts an array of arguments instead of
 * a rest parameter. Useful when the argument list is built programmatically.
 *
 * @example
 * ```ts
 * vsprintf('%s - %s', ['foo', 'bar']);   // ⇒ "foo - bar"
 * ```
 */
export function vsprintf<const F extends string, const A extends ArgsFor<F>>(
  format: F,
  args?: A,
): ResultFor<F, A>
export function vsprintf(format: string, args?: readonly unknown[]): string {
  return formatTokens(getParseTree(format), args ?? [])
}
