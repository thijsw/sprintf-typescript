/**
 * Type-level barrel. These helpers drive the `sprintf` / `vsprintf` generic
 * overloads so that calling code gets argument and return types inferred
 * directly from the format string.
 */
export type { ParseFormat, FormatToken, PlaceholderT, LiteralT, UnknownT, RefT, SpecifierChar } from './parse.js';
export type { ArgsOf } from './args.js';
export type { FormatResult } from './format.js';
export type { TypeForSpec } from './specifier-map.js';
