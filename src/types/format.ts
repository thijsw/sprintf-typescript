import type { FormatToken, PlaceholderT } from './parse.js'

/**
 * Derives the most specific return type possible for a given parsed format
 * and its runtime arguments.
 *
 * The strategy:
 *
 * - Literal text is emitted verbatim into the output template.
 * - `%s` substitutes a literal template of the argument (`${Arg}`), for
 *   any primitive-ish type.
 * - `%d` / `%i` substitute the literal for integer-typed arguments; for
 *   non-integer numbers or generic `number`, that slot degrades to `string`.
 * - Every other specifier, and any placeholder carrying width / precision /
 *   custom padding, degrades to `string` for that slot — since its exact
 *   output depends on computations we cannot feasibly replicate at the
 *   type level.
 */
export type FormatResult<
  Tokens extends readonly FormatToken[],
  Args extends readonly unknown[],
> =
  HasUnparseable<Tokens> extends true
    ? string
    : IsAllNamed<Tokens> extends true
      ? RenderNamed<Tokens, ReadArgZero<Args>>
      : IsAllPositional<Tokens> extends true
        ? RenderPositional<Tokens, Args>
        : string

type ReadArgZero<Args extends readonly unknown[]> = Args extends readonly [
  infer H,
  ...unknown[],
]
  ? H
  : unknown

// --- Classification helpers --------------------------------------------------

type HasUnparseable<Tokens extends readonly FormatToken[]> =
  Tokens extends readonly [infer H, ...infer R extends readonly FormatToken[]]
    ? H extends { kind: 'unknown' }
      ? true
      : HasUnparseable<R>
    : false

type IsAllNamed<Tokens extends readonly FormatToken[]> =
  HasAnyRef<Tokens, 'named'> extends true
    ? HasAnyRef<Tokens, 'implicit'> extends true
      ? false
      : HasAnyRef<Tokens, 'explicit'> extends true
        ? false
        : true
    : false

type IsAllPositional<Tokens extends readonly FormatToken[]> =
  HasAnyRef<Tokens, 'named'> extends true ? false : true

type HasAnyRef<
  Tokens extends readonly FormatToken[],
  Kind extends 'named' | 'implicit' | 'explicit',
> = Tokens extends readonly [infer H, ...infer R extends readonly FormatToken[]]
  ? H extends PlaceholderT
    ? H['ref']['kind'] extends Kind
      ? true
      : HasAnyRef<R, Kind>
    : HasAnyRef<R, Kind>
  : false

// --- Positional rendering ----------------------------------------------------

type RenderPositional<
  Tokens extends readonly FormatToken[],
  Args extends readonly unknown[],
  Cursor extends readonly unknown[] = readonly [],
  Acc extends string = '',
> = Tokens extends readonly [infer H, ...infer R extends readonly FormatToken[]]
  ? H extends { kind: 'literal'; text: infer Text extends string }
    ? RenderPositional<R, Args, Cursor, `${Acc}${Text}`>
    : H extends PlaceholderT
      ? H['ref'] extends { kind: 'implicit' }
        ? RenderPositional<
            R,
            Args,
            readonly [unknown, ...Cursor],
            `${Acc}${AsTemplatePart<Substitute<H, IndexArg<Args, Cursor['length']>>>}`
          >
        : H['ref'] extends { kind: 'explicit'; index: infer I extends string }
          ? RenderPositional<
              R,
              Args,
              Cursor,
              `${Acc}${AsTemplatePart<Substitute<H, IndexArg<Args, Minus1<I>>>>}`
            >
          : `${Acc}${string}`
      : Acc
  : Acc

type IndexArg<
  Args extends readonly unknown[],
  I extends number,
> = I extends keyof Args ? Args[I] : unknown

type Minus1<S extends string> = S extends `${infer N extends number}`
  ? Sub1<N>
  : 0

type Sub1<N extends number, C extends readonly unknown[] = []> = [
  unknown,
  ...C,
]['length'] extends N
  ? C['length']
  : Sub1<N, [unknown, ...C]>

// --- Named rendering --------------------------------------------------------

type RenderNamed<
  Tokens extends readonly FormatToken[],
  Obj,
  Acc extends string = '',
> = Tokens extends readonly [infer H, ...infer R extends readonly FormatToken[]]
  ? H extends { kind: 'literal'; text: infer Text extends string }
    ? RenderNamed<R, Obj, `${Acc}${Text}`>
    : H extends PlaceholderT
      ? H['ref'] extends { kind: 'named'; path: infer P extends string }
        ? RenderNamed<
            R,
            Obj,
            `${Acc}${AsTemplatePart<Substitute<H, ResolvePath<P, Obj>>>}`
          >
        : `${Acc}${string}`
      : Acc
  : Acc

type ResolvePath<P extends string, Obj> = WalkPath<
  SplitPath<NormalizePath<P>>,
  Obj
>

type NormalizePath<P extends string> =
  P extends `${infer A}[${infer N}]${infer B}`
    ? NormalizePath<`${A}.${N}${B}`>
    : P

type SplitPath<S extends string> = S extends `${infer A}.${infer B}`
  ? [A, ...SplitPath<B>]
  : [S]

type WalkPath<Segs extends readonly string[], Obj> = Segs extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? Obj extends readonly unknown[]
    ? H extends `${number}`
      ? Obj[Extract<H, keyof Obj>] extends infer V
        ? WalkPath<R, V>
        : unknown
      : unknown
    : H extends keyof Obj
      ? WalkPath<R, Obj[H]>
      : unknown
  : Obj

// --- Per-placeholder substitution -------------------------------------------

/** Produces the typed string fragment that replaces the placeholder. */
type Substitute<Ph extends PlaceholderT, Arg> = Ph['modified'] extends true
  ? string
  : Ph['spec'] extends 's'
    ? StringifyForS<Arg>
    : Ph['spec'] extends 'd' | 'i'
      ? StringifyInt<Arg>
      : string

type StringifyForS<Arg> = [Arg] extends [never]
  ? string
  : Arg extends string | number | bigint | boolean | null | undefined
    ? `${Arg}`
    : string

type StringifyInt<Arg> = Arg extends bigint
  ? `${Arg}`
  : Arg extends number
    ? IsIntegerLiteral<Arg> extends true
      ? `${Arg}`
      : string
    : string

/** True for a finite integer literal type, false for generic `number` or a float. */
type IsIntegerLiteral<N extends number> = number extends N
  ? false
  : `${N}` extends `${string}.${string}`
    ? false
    : `${N}` extends `${string}e${string}` | `${string}E${string}`
      ? false
      : true

/**
 * Guards against substituted fragments that aren't valid in a template
 * literal (defensive — `Substitute` already narrows to `string`, but this
 * keeps the public signature composable).
 */
type AsTemplatePart<T> = T extends
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  ? T
  : string
