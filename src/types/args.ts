import type { FormatToken, PlaceholderT } from './parse.js'
import type { TypeForSpec } from './specifier-map.js'

/**
 * Determines the runtime argument shape implied by a parsed format string.
 *
 * - A format with any named placeholders produces a single-element tuple
 *   `[obj]` where `obj` is the nested object type implied by the named paths.
 * - A format with only positional placeholders produces a tuple where element
 *   `i` is typed by the specifier of the `i`-th argument (implicit placeholders
 *   consume one slot each, explicit `%N$` placeholders refer to slot `N`).
 * - A format that mixes named and positional placeholders, or that contains
 *   unparseable placeholders, falls back to `unknown[]`.
 */
export type ArgsOf<Tokens extends readonly FormatToken[]> =
  FilterPlaceholders<Tokens> extends infer Phs
    ? Phs extends readonly PlaceholderT[]
      ? Classify<Phs> extends 'named'
        ? readonly [Prettify<NamedArgs<Phs>>]
        : Classify<Phs> extends 'positional'
          ? PositionalArgs<Phs>
          : Phs extends readonly []
            ? readonly []
            : readonly unknown[]
      : readonly unknown[]
    : readonly unknown[]

// --- Token filtering ---------------------------------------------------------

type FilterPlaceholders<Tokens extends readonly FormatToken[]> =
  Tokens extends readonly [infer H, ...infer R extends readonly FormatToken[]]
    ? H extends PlaceholderT
      ? readonly [H, ...FilterPlaceholders<R>]
      : H extends { kind: 'unknown' }
        ? 'unparseable'
        : FilterPlaceholders<R>
    : readonly []

// --- Named vs positional classification -------------------------------------

type Classify<Phs extends readonly PlaceholderT[]> =
  HasNamed<Phs> extends true
    ? HasPositional<Phs> extends true
      ? 'mixed'
      : 'named'
    : 'positional'

type HasNamed<Phs extends readonly PlaceholderT[]> = Phs extends readonly [
  infer H extends PlaceholderT,
  ...infer R extends readonly PlaceholderT[],
]
  ? H['ref']['kind'] extends 'named'
    ? true
    : HasNamed<R>
  : false

type HasPositional<Phs extends readonly PlaceholderT[]> = Phs extends readonly [
  infer H extends PlaceholderT,
  ...infer R extends readonly PlaceholderT[],
]
  ? H['ref']['kind'] extends 'named'
    ? HasPositional<R>
    : true
  : false

// --- Positional tuple construction ------------------------------------------

/**
 * Walks placeholders in order, building a tuple whose slots reflect each
 * specifier. Implicit placeholders consume the next free slot; explicit
 * `%N$` placeholders write to slot `N-1`, growing the tuple as needed.
 */
type PositionalArgs<
  Phs extends readonly PlaceholderT[],
  Acc extends readonly unknown[] = readonly [],
  Cursor extends readonly unknown[] = readonly [],
> = Phs extends readonly [
  infer H extends PlaceholderT,
  ...infer R extends readonly PlaceholderT[],
]
  ? H['ref'] extends { kind: 'implicit' }
    ? PositionalArgs<
        R,
        SetTupleAt<Acc, Cursor['length'], TypeForSpec<H['spec']>>,
        readonly [unknown, ...Cursor]
      >
    : H['ref'] extends { kind: 'explicit'; index: infer I extends string }
      ? StringToIndex<I> extends infer Idx extends number
        ? PositionalArgs<
            R,
            SetTupleAt<Acc, Idx, TypeForSpec<H['spec']>>,
            Cursor
          >
        : PositionalArgs<R, Acc, Cursor>
      : PositionalArgs<R, Acc, Cursor>
  : Acc

/** Converts a string digit sequence to a numeric index (1-based → 0-based). */
type StringToIndex<S extends string> = S extends `${infer N extends number}`
  ? Subtract1<N>
  : never

type Subtract1<N extends number, C extends readonly unknown[] = readonly []> = [
  unknown,
  ...C,
]['length'] extends N
  ? C['length']
  : Subtract1<N, [unknown, ...C]>

/**
 * Widens `Acc` to at least `Index + 1` slots, placing `T` at `Index`. Any
 * slots that are grown into without being written keep type `unknown`.
 */
type SetTupleAt<
  Acc extends readonly unknown[],
  Index extends number,
  T,
> = Acc['length'] extends Index
  ? readonly [...Acc, T]
  : Index extends Acc['length']
    ? readonly [...Acc, T]
    : Acc extends readonly [infer H, ...infer R extends readonly unknown[]]
      ? Index extends 0
        ? readonly [T, ...R]
        : Subtract1<Index> extends infer J extends number
          ? readonly [H, ...SetTupleAt<R, J, T>]
          : Acc
      : GrowAndSet<Acc, Index, T>

/**
 * If `Acc` is shorter than `Index`, extends it with `unknown` slots up to the
 * required length and then places `T` at the tail.
 */
type GrowAndSet<
  Acc extends readonly unknown[],
  Index extends number,
  T,
  C extends readonly unknown[] = Acc,
> = C['length'] extends Index
  ? readonly [...C, T]
  : GrowAndSet<Acc, Index, T, readonly [...C, unknown]>

// --- Named-args object construction -----------------------------------------

/**
 * Merges the per-placeholder object shapes into a single nested type.
 *
 * `%(a.b)s` + `%(a.c)d` → `{ a: { b: unknown; c: number } }`.
 */
type NamedArgs<Phs extends readonly PlaceholderT[]> = UnionToIntersection<
  NamedArgsUnion<Phs>
>

type NamedArgsUnion<Phs extends readonly PlaceholderT[]> =
  Phs extends readonly [
    infer H extends PlaceholderT,
    ...infer R extends readonly PlaceholderT[],
  ]
    ? H['ref'] extends { kind: 'named'; path: infer P extends string }
      ? BuildNested<SplitPath<P>, TypeForSpec<H['spec']>> | NamedArgsUnion<R>
      : NamedArgsUnion<R>
    : never

/** Flattens `foo[0].bar` → `foo.0.bar` for a single split pass below. */
type NormalizePath<P extends string> =
  P extends `${infer A}[${infer N}]${infer B}`
    ? NormalizePath<`${A}.${N}${B}`>
    : P

/** Splits `a.b.c` into `['a', 'b', 'c']`. */
type SplitPath<P extends string> = SplitOnDot<NormalizePath<P>>

type SplitOnDot<S extends string> = S extends `${infer A}.${infer B}`
  ? [A, ...SplitOnDot<B>]
  : [S]

/** Builds a nested object type from a key path: `['a','b'] + T` → `{a:{b:T}}`. */
type BuildNested<Keys extends readonly string[], Val> = Keys extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? R extends readonly []
    ? { [K in H]: Val }
    : { [K in H]: BuildNested<R, Val> }
  : Val

// --- Utility: union → intersection ------------------------------------------

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => 0 : never
) extends (x: infer I) => 0
  ? I
  : never

type Prettify<T> = T extends object ? { [K in keyof T]: Prettify<T[K]> } : T
