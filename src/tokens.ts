/**
 * Shared token types produced by the parser and consumed by the formatter.
 *
 * The parser turns a format string into an array of {@link Token}s. Each token
 * is either a run of literal text (including the collapsed result of `%%`) or
 * a {@link Placeholder} describing a single substitution.
 */

/**
 * All specifier characters recognised by the format grammar. A `%%` in a
 * format string is handled as a literal token, not a specifier.
 */
export type Specifier =
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

/** A key access in a named-argument path (`foo` in `foo.bar[0]`). */
export interface PathKeySegment {
  readonly kind: 'key';
  readonly name: string;
}

/** A numeric index access in a named-argument path (`0` in `foo[0]`). */
export interface PathIndexSegment {
  readonly kind: 'index';
  readonly index: number;
}

export type PathSegment = PathKeySegment | PathIndexSegment;

/** `%N$s` — reference to the Nth positional argument (1-based). */
export interface RefPositionalExplicit {
  readonly kind: 'positional-explicit';
  readonly index: number;
}

/** `%s` — takes the next argument in order. */
export interface RefPositionalImplicit {
  readonly kind: 'positional-implicit';
}

/** `%(path)s` — traverses the single named-args object. */
export interface RefNamed {
  readonly kind: 'named';
  readonly path: readonly PathSegment[];
  /** The original path text between the parentheses, for error messages. */
  readonly source: string;
}

export type Ref = RefPositionalExplicit | RefPositionalImplicit | RefNamed;

/** Flag modifiers parsed from the placeholder. */
export interface Flags {
  /** `+` — emit a leading `+` on non-negative numeric values. */
  readonly sign: boolean;
  /** `-` — left-align within `width` instead of right-aligning. */
  readonly leftAlign: boolean;
  /**
   * Character used to pad out to `width`. `' '` (space) is the default;
   * `'0'` indicates the `0` flag; any other value indicates a `'<char>'`
   * custom pad character.
   */
  readonly padChar: string;
  /** True when the `0` flag was explicitly present (controls sign/pad order). */
  readonly zeroPad: boolean;
}

/** A single `%...` placeholder parsed from the format string. */
export interface Placeholder {
  readonly kind: 'placeholder';
  /** Original text of the placeholder, useful for diagnostics. */
  readonly source: string;
  readonly ref: Ref;
  readonly flags: Flags;
  readonly width: number | undefined;
  readonly precision: number | undefined;
  readonly specifier: Specifier;
}

/** A run of literal characters (including the result of collapsing `%%`). */
export interface Literal {
  readonly kind: 'literal';
  readonly text: string;
}

export type Token = Literal | Placeholder;
