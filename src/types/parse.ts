/**
 * Type-level format-string parser.
 *
 * The result is a tuple where each element is either a {@link LiteralT} run
 * of literal text, or a {@link PlaceholderT} description of a single
 * substitution. The runtime parser in `../parser.ts` mirrors this shape and
 * its semantics.
 *
 * Parsing is intentionally loose: any format fragment the parser cannot
 * recognise becomes a {@link UnknownT} token, which makes downstream type
 * computation gracefully fall back to `unknown` / `string`. This keeps
 * compile-time errors focused on genuine user mistakes rather than on corner
 * cases of the grammar.
 */

/** A single character in a base-10 integer. */
export type Digit =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9';

/** The set of valid specifier characters. */
export type SpecifierChar =
  | 'b'
  | 'c'
  | 'd'
  | 'i'
  | 'e'
  | 'f'
  | 'g'
  | 'j'
  | 'o'
  | 's'
  | 't'
  | 'T'
  | 'u'
  | 'v'
  | 'x'
  | 'X';

/** A reference to an argument — implicit, explicit index, or named path. */
export type RefT =
  | { kind: 'implicit' }
  | { kind: 'explicit'; index: string }
  | { kind: 'named'; path: string };

/** Literal text token. */
export interface LiteralT {
  kind: 'literal';
  text: string;
}

/** Placeholder token. */
export interface PlaceholderT {
  kind: 'placeholder';
  ref: RefT;
  spec: SpecifierChar;
  /** True when width, precision, or a custom pad char is present. */
  modified: boolean;
}

/** Placeholder that could not be parsed — caller falls back to `unknown`. */
export interface UnknownT {
  kind: 'unknown';
}

export type FormatToken = LiteralT | PlaceholderT | UnknownT;

// --- Digit reading -----------------------------------------------------------

/**
 * Greedily reads leading digits from `F`. Returns a tuple `[digits, rest]`.
 */
type ReadDigits<F extends string, Acc extends string = ''> = F extends `${infer H extends Digit}${infer R}`
  ? ReadDigits<R, `${Acc}${H}`>
  : [Acc, F];

// --- Flag / width / precision stripping --------------------------------------

type StripLeftAlign<F extends string> = F extends `-${infer R}` ? R : F;

type StripPadFlag<F extends string> = F extends `0${infer R}`
  ? { rest: StripLeftAlign<R>; modified: true }
  : F extends `'${infer _Char}${infer R}`
    ? { rest: StripLeftAlign<R>; modified: true }
    : { rest: StripLeftAlign<F>; modified: false };

type StripAllFlags<F extends string> = F extends `+${infer R}`
  ? StripPadFlag<R> extends { rest: infer R2 extends string; modified: infer M }
    ? { rest: R2; modified: M }
    : never
  : StripPadFlag<F>;

type StripWidth<F extends string> = ReadDigits<F> extends [infer D extends string, infer R extends string]
  ? D extends ''
    ? { rest: F; modified: false }
    : { rest: R; modified: true }
  : never;

type StripPrecision<F extends string> = F extends `.${infer R}`
  ? ReadDigits<R> extends [infer D extends string, infer R2 extends string]
    ? D extends ''
      ? { rest: F; modified: false }
      : { rest: R2; modified: true }
    : { rest: F; modified: false }
  : { rest: F; modified: false };

// --- Placeholder body (post-ref) parsing -------------------------------------

/**
 * Parses the portion of a placeholder after the optional ref (named or
 * explicit positional): `[flags][width][.precision]specifier`.
 *
 * Returns `{ spec; tail; modified }` where `tail` is the format-string
 * remainder *after* the specifier char, and `modified` is `true` if the
 * placeholder carried width/precision/custom-pad (which disables literal
 * substitution in the return type).
 */
type ParseAfterRef<F extends string> = StripAllFlags<F> extends {
  rest: infer F1 extends string;
  modified: infer M1;
}
  ? StripWidth<F1> extends { rest: infer F2 extends string; modified: infer M2 }
    ? StripPrecision<F2> extends { rest: infer F3 extends string; modified: infer M3 }
      ? F3 extends `${infer S extends SpecifierChar}${infer Tail}`
        ? {
            spec: S;
            tail: Tail;
            modified: M1 extends true ? true : M2 extends true ? true : M3 extends true ? true : false;
          }
        : never
      : never
    : never
  : never;

// --- Explicit-positional ref detection ---------------------------------------

type ParseExplicitIndex<F extends string> = ReadDigits<F> extends [
  infer D extends string,
  infer R extends string,
]
  ? D extends ''
    ? { matched: false }
    : R extends `$${infer After}`
      ? { matched: true; index: D; rest: After }
      : { matched: false }
  : { matched: false };

// --- Single placeholder parsing ----------------------------------------------

/**
 * Parses one placeholder starting *after* the leading `%`. Returns the
 * placeholder plus the remaining format-string tail, or {@link UnknownT} on
 * parse failure.
 */
type ParseOnePlaceholder<F extends string> = F extends `(${infer Path})${infer R1}`
  ? ParseAfterRef<R1> extends {
      spec: infer S extends SpecifierChar;
      tail: infer T extends string;
      modified: infer M extends boolean;
    }
    ? {
        token: { kind: 'placeholder'; ref: { kind: 'named'; path: Path }; spec: S; modified: M };
        tail: T;
      }
    : { token: { kind: 'unknown' }; tail: '' }
  : ParseExplicitIndex<F> extends {
        matched: true;
        index: infer I extends string;
        rest: infer R1 extends string;
      }
    ? ParseAfterRef<R1> extends {
        spec: infer S extends SpecifierChar;
        tail: infer T extends string;
        modified: infer M extends boolean;
      }
      ? {
          token: { kind: 'placeholder'; ref: { kind: 'explicit'; index: I }; spec: S; modified: M };
          tail: T;
        }
      : { token: { kind: 'unknown' }; tail: '' }
    : ParseAfterRef<F> extends {
          spec: infer S extends SpecifierChar;
          tail: infer T extends string;
          modified: infer M extends boolean;
        }
      ? {
          token: { kind: 'placeholder'; ref: { kind: 'implicit' }; spec: S; modified: M };
          tail: T;
        }
      : { token: { kind: 'unknown' }; tail: '' };

// --- Top-level tokeniser -----------------------------------------------------

/**
 * Parses the entire format string into an ordered tuple of tokens.
 *
 * Literal `%%` collapses to a single `%` in the preceding literal run, as per
 * the runtime behaviour.
 */
export type ParseFormat<F extends string, Acc extends FormatToken[] = []> = F extends ''
  ? Acc
  : F extends `${infer Pre}%${infer Rest}`
    ? Rest extends `%${infer Rest2}`
      ? // `%%` — fold into the preceding literal.
        ParseFormat<Rest2, AppendLiteral<Acc, `${Pre}%`>>
      : ParseOnePlaceholder<Rest> extends {
            token: infer Tok extends PlaceholderT | UnknownT;
            tail: infer Tail extends string;
          }
        ? ParseFormat<Tail, AppendPlaceholder<AppendLiteral<Acc, Pre>, Tok>>
        : AppendLiteral<Acc, F>
    : AppendLiteral<Acc, F>;

type AppendLiteral<Acc extends FormatToken[], Text extends string> = Text extends ''
  ? Acc
  : [...Acc, { kind: 'literal'; text: Text }];

type AppendPlaceholder<Acc extends FormatToken[], Tok extends PlaceholderT | UnknownT> = [
  ...Acc,
  Tok,
];
