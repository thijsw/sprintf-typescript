/**
 * Public entry point.
 *
 * ```ts
 * import { sprintf, vsprintf } from 'sprintf-typescript';
 * ```
 */
export { sprintf, vsprintf } from './sprintf.js'

export type {
  Token,
  Literal,
  Placeholder,
  Specifier,
  Flags,
  Ref,
  RefPositionalImplicit,
  RefPositionalExplicit,
  RefNamed,
  PathSegment,
  PathKeySegment,
  PathIndexSegment,
} from './tokens.js'

export type {
  ParseFormat,
  FormatToken,
  PlaceholderT,
  LiteralT,
  UnknownT,
  RefT,
  SpecifierChar,
  ArgsOf,
  FormatResult,
  TypeForSpec,
} from './types/index.js'
