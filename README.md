# sprintf-typescript

A modern, fully-typed TypeScript reimplementation of
[`sprintf-js`](https://github.com/alexei/sprintf.js). It is a **drop-in
replacement** for `sprintf-js` — same functions, same format specifiers, same
semantics — but rewritten from scratch with:

- **Template-literal-typed format strings.** The compiler parses your format
  string and infers argument types, and where possible the return type too.
- **ESM-only.** No CommonJS, no UMD, no AMD, no browser globals.
- **Zero runtime dependencies.**
- **Modern tooling.** Vite, Vitest, oxlint, TypeScript ≥ 5.6, Node.js ≥ 20.

## Install

```sh
npm install sprintf-typescript
```

## Usage

```ts
import { sprintf, vsprintf } from 'sprintf-typescript';

sprintf('Hello, %s!', 'world');
// ⇒ "Hello, world!"   (inferred return type: "Hello, world!")

sprintf('%d items at %.2f each', 3, 9.99);
// ⇒ "3 items at 9.99 each"

sprintf('%(user.name)s has %(user.posts.length)d posts', {
  user: { name: 'Dolly', posts: [/* … */] },
});

vsprintf('%2$s %3$s a %1$s', ['cracker', 'Polly', 'wants']);
// ⇒ "Polly wants a cracker"
```

If a `%d` is given a non-number, or a format string is malformed, you get a
`TypeError` / `SyntaxError` at runtime — and likely a type error at compile
time too.

## Format grammar

```
%[index$|(name)][flags][width][.precision]specifier
```

### Specifiers

| Specifier | Output                                     |
| --------: | ------------------------------------------ |
|       `%` | A literal `%`                              |
|       `b` | Binary integer                             |
|       `c` | Character (from char code)                 |
|    `d` `i` | Signed decimal integer                    |
|       `e` | Scientific notation                        |
|       `f` | Fixed-point float                          |
|       `g` | Float (general, uses `toPrecision`)        |
|       `j` | JSON-serialised value (`width` → indent)   |
|       `o` | Unsigned octal                             |
|       `s` | String (anything coerced via `String(...)`) |
|       `t` | Boolean (`"true"` / `"false"`)             |
|       `T` | Type name (e.g. `"number"`, `"array"`)     |
|       `u` | Unsigned decimal                           |
|       `v` | Primitive via `.valueOf()`                 |
|       `x` | Lowercase hexadecimal                      |
|       `X` | Uppercase hexadecimal                      |

### Flags

| Flag       | Meaning                                            |
| ---------- | -------------------------------------------------- |
| `+`        | Always emit a sign for numeric specifiers          |
| `-`        | Left-align within the width                        |
| `0`        | Pad numeric output with zeros                      |
| `'<char>'` | Pad with `<char>` (any single character after `'`) |

### Named arguments

```ts
sprintf('%(path.to[0].key)s', { path: { to: [{ key: 'hi' }] } });
```

Paths support `.key` and `[index]` access, arbitrarily nested.

### Function-valued arguments

If an argument is a function, it is called with no arguments and its return
value is used — except for `%T` and `%v`, which expect the function value
itself.

## TypeScript story

The generic overloads of `sprintf` / `vsprintf` parse the format string at the
type level, so:

```ts
sprintf('%d', 'oops');
//              ~~~~~ Argument of type 'string' is not assignable to parameter of type 'number'.

sprintf('%s %s', 'only one');
//       ^^^^^^ Expected 3 arguments, but got 2.

const s = sprintf('Hi, %s!', 'world');
//    ^? const s: "Hi, world!"
```

For format strings with width/precision/padding, the compile-time result
gracefully falls back to `string` for that slot while keeping the literal
parts literal.

## Credits

This package is a from-scratch reimplementation. Prior art: the original
[`sprintf-js`](https://github.com/alexei/sprintf.js) by Alexandru Mărășteanu,
which defined the API.

## License

MIT — see [LICENSE](./LICENSE).
