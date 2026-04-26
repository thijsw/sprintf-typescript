# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-04-26

### Changed

- Upgraded to Vite 8.
- Switched the package manager and CI to pnpm; removed `package-lock.json`
  in favour of `pnpm-lock.yaml`.
- Internal code hygiene pass across `src` and `test` with no behavioural
  changes; added a Prettier config.

## [1.0.0] - 2026-04-22

### Added

- Initial release. `sprintf` and `vsprintf` implementations authored in
  TypeScript, API-compatible with `sprintf-js`.
- Full format-specifier support: `b c d i e f g o s t T u v x X j %`.
- Flags (`+`, `-`, `0`, `'<char>'`), width, and precision.
- Named arguments with nested path traversal (`%(user.name)s`,
  `%(items[0].id)d`).
- Positional argument swapping (`%2$s %1$s`).
- Function-valued arguments evaluated lazily (except for `%T` and `%v`).
- Bounded parse-tree cache.
- Template-literal-typed overloads: argument types and (where possible)
  return type are inferred from the format string at compile time.
- ESM-only package, Node.js ≥ 20, zero runtime dependencies.
