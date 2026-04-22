/**
 * Type-level mapping from a specifier character to the runtime argument type
 * the formatter accepts. See {@link ../formatter.ts} for the corresponding
 * runtime behaviour.
 */
export type TypeForSpec<S extends string> = S extends
  | 'b'
  | 'c'
  | 'd'
  | 'i'
  | 'e'
  | 'f'
  | 'g'
  | 'o'
  | 'u'
  | 'x'
  | 'X'
  ? number
  : S extends 's' | 'j' | 't' | 'T' | 'v'
    ? unknown
    : never;
