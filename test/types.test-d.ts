import { describe, expectTypeOf, it } from 'vitest';
import { sprintf, vsprintf } from '../src/index.js';

/*
 * These tests exercise the template-literal-typed overloads. They are
 * collected by Vitest's `typecheck` mode — see `npm run test:types` — and
 * failures here surface as TypeScript diagnostics, not runtime errors.
 */

describe('sprintf — type inference', () => {
  it('infers a literal return type for pure-string substitutions', () => {
    const r = sprintf('Hello, %s!', 'world');
    expectTypeOf(r).toEqualTypeOf<'Hello, world!'>();
  });

  it('infers a literal return type for integer literal arguments', () => {
    const r = sprintf('answer = %d', 42);
    expectTypeOf(r).toEqualTypeOf<'answer = 42'>();
  });

  it('falls back to `string` for non-integer number literals in %d', () => {
    const r = sprintf('%d', 3.5);
    expectTypeOf(r).toEqualTypeOf<string>();
  });

  it('falls back to `string` when a slot carries width/precision/padding', () => {
    const r = sprintf('>%5s<', 'hi');
    expectTypeOf(r).toEqualTypeOf<`>${string}<`>();
  });

  it('supports explicit positional swaps', () => {
    const r = sprintf('%2$s %1$s', 'b', 'a');
    expectTypeOf(r).toEqualTypeOf<'a b'>();
  });

  it('types named arguments as a nested object', () => {
    const r = sprintf('%(greeting)s, %(who)s!', { greeting: 'Hi', who: 'world' });
    expectTypeOf(r).toEqualTypeOf<'Hi, world!'>();
  });

  it('types nested named-argument paths', () => {
    const r = sprintf('%(user.name)s', { user: { name: 'Nested' } });
    expectTypeOf(r).toEqualTypeOf<'Nested'>();
  });

  it('rejects a numeric argument for %d that is not a number', () => {
    // @ts-expect-error — %d requires a number.
    sprintf('%d', 'oops');
  });

  it('rejects too few arguments', () => {
    // @ts-expect-error — two placeholders, one argument.
    sprintf('%s %s', 'only');
  });
});

describe('vsprintf — type inference', () => {
  it('infers from the args array', () => {
    const r = vsprintf('%s/%s', ['a', 'b']);
    expectTypeOf(r).toEqualTypeOf<'a/b'>();
  });
});
