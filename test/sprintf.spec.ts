import { describe, expect, it } from 'vitest'
import { sprintf, vsprintf } from '../src/index.js'

describe('sprintf — literal output and %%', () => {
  it('passes through a string with no placeholders', () => {
    expect(sprintf('hello world')).toBe('hello world')
  })

  it('renders `%%` as a literal percent sign', () => {
    expect(sprintf('100%%')).toBe('100%')
    expect(sprintf('%% %s %%', 'middle')).toBe('% middle %')
  })
})

describe('sprintf — positional arguments', () => {
  it('fills implicit placeholders in order', () => {
    expect(sprintf('%s and %s', 'foo', 'bar')).toBe('foo and bar')
  })

  it('supports positional swapping via `%N$`', () => {
    expect(sprintf('%2$s %3$s a %1$s', 'cracker', 'Polly', 'wants')).toBe(
      'Polly wants a cracker',
    )
  })

  it('allows an explicit index to reuse an argument', () => {
    expect(sprintf('%1$s %1$s', 'echo')).toBe('echo echo')
  })
})

describe('sprintf — named arguments', () => {
  it('resolves a single key', () => {
    expect(sprintf('Hello %(name)s', { name: 'Dolly' })).toBe('Hello Dolly')
  })

  it('resolves a nested key path', () => {
    expect(sprintf('%(user.name)s', { user: { name: 'Nested' } })).toBe(
      'Nested',
    )
  })

  it('resolves an index segment inside a path', () => {
    expect(sprintf('%(users[0].name)s', { users: [{ name: 'First' }] })).toBe(
      'First',
    )
  })

  it('throws a TypeError when a path encounters null/undefined', () => {
    // Runtime-only check — intentionally violate the compile-time shape.
    const fmt = '%(a.b)s' as string
    expect(() => sprintf(fmt, { a: null })).toThrow(TypeError)
    expect(() => sprintf(fmt, { a: undefined })).toThrow(TypeError)
  })
})

describe('sprintf — function-valued arguments', () => {
  it('calls function args for the default specifiers', () => {
    expect(sprintf('%s', () => 'computed')).toBe('computed')
    // Function-valued arg for %d is a runtime feature; the static type expects
    // a number, so cast through the non-literal overload.
    const fmt = '%d' as string
    expect(sprintf(fmt, () => 42)).toBe('42')
  })

  it('passes the function itself to `%T` and `%v`', () => {
    expect(sprintf('%T', () => 'hi')).toBe('function')
    // %v reads the primitive; for a function, `valueOf` returns itself and
    // `String(...)` produces its source, which starts with the keyword.
    expect(sprintf('%v', () => 'hi').startsWith('(')).toBe(true)
  })
})

describe('sprintf — specifier behaviours', () => {
  it('`%s` stringifies any value', () => {
    expect(sprintf('%s', 'hi')).toBe('hi')
    expect(sprintf('%s', 42)).toBe('42')
    expect(sprintf('%s', true)).toBe('true')
    expect(sprintf('%s', null)).toBe('null')
  })

  it('`%s` with precision truncates', () => {
    expect(sprintf('%.3s', 'abcdef')).toBe('abc')
  })

  it('`%d` and `%i` produce signed integers', () => {
    expect(sprintf('%d', 42)).toBe('42')
    expect(sprintf('%i', -7)).toBe('-7')
    expect(sprintf('%d', 3.9)).toBe('3')
    expect(sprintf('%d', -3.9)).toBe('-3')
  })

  it('`%b` emits binary representation', () => {
    expect(sprintf('%b', 5)).toBe('101')
    expect(sprintf('%b', 0)).toBe('0')
  })

  it('`%o` emits unsigned octal', () => {
    expect(sprintf('%o', 8)).toBe('10')
    expect(sprintf('%o', -1)).toBe('37777777777')
  })

  it('`%u` emits unsigned decimal', () => {
    expect(sprintf('%u', -1)).toBe('4294967295')
    expect(sprintf('%u', 7)).toBe('7')
  })

  it('`%x` and `%X` emit hexadecimal', () => {
    expect(sprintf('%x', 255)).toBe('ff')
    expect(sprintf('%X', 255)).toBe('FF')
    expect(sprintf('%x', -1)).toBe('ffffffff')
  })

  it('`%c` renders a char from its code', () => {
    expect(sprintf('%c', 65)).toBe('A')
  })

  it('`%e` renders exponential notation', () => {
    expect(sprintf('%e', 12345)).toBe('1.2345e+4')
    expect(sprintf('%.2e', 12345)).toBe('1.23e+4')
  })

  it('`%f` renders fixed-point', () => {
    expect(sprintf('%f', 3.14)).toBe('3.14')
    // Matches Number.prototype.toFixed; IEEE 754 rounding applies.
    expect(sprintf('%.2f', Math.PI)).toBe('3.14')
    expect(sprintf('%.3f', 2)).toBe('2.000')
  })

  it('`%g` renders general-precision float', () => {
    expect(sprintf('%g', 100)).toBe('100')
    expect(sprintf('%.2g', 100)).toBe('100')
    expect(sprintf('%.4g', 1.23456)).toBe('1.235')
  })

  it('`%t` renders a boolean', () => {
    expect(sprintf('%t', 1)).toBe('true')
    expect(sprintf('%t', 0)).toBe('false')
    expect(sprintf('%.2t', true)).toBe('tr')
  })

  it('`%T` renders the argument type tag', () => {
    expect(sprintf('%T', 'x')).toBe('string')
    expect(sprintf('%T', 42)).toBe('number')
    expect(sprintf('%T', [])).toBe('array')
    expect(sprintf('%T', null)).toBe('null')
  })

  it('`%v` renders the primitive via valueOf', () => {
    // A boxed Number's valueOf returns a primitive number.
    // eslint-disable-next-line no-new-wrappers
    const boxed = new Number(7)
    expect(sprintf('%v', boxed)).toBe('7')
    expect(sprintf('%v', 'plain')).toBe('plain')
  })

  it('`%j` renders JSON, reinterpreting width as indent', () => {
    expect(sprintf('%j', { a: 1 })).toBe('{"a":1}')
    expect(sprintf('%2j', { a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('throws TypeError when a numeric specifier gets a non-numeric value', () => {
    // Deliberately wrong types to exercise the runtime guard.
    const fmt1 = '%d' as string
    const fmt2 = '%f' as string
    expect(() => sprintf(fmt1, 'abc')).toThrow(TypeError)
    expect(() => sprintf(fmt2, 'xyz')).toThrow(TypeError)
  })
})

describe('sprintf — width, precision, padding', () => {
  it('pads on the right when `-` flag is set', () => {
    expect(sprintf('%-5s|', 'hi')).toBe('hi   |')
  })

  it('pads on the left by default', () => {
    expect(sprintf('%5s|', 'hi')).toBe('   hi|')
  })

  it('zero-pads with the `0` flag and places the sign before the zeros', () => {
    expect(sprintf('%05d', 42)).toBe('00042')
    expect(sprintf('%05d', -42)).toBe('-0042')
  })

  it('uses a custom pad char via `"\'<char>"` flag', () => {
    expect(sprintf("%'*5s", 'x')).toBe('****x')
  })

  it('prefixes the `+` sign for non-negative numeric output when flag is set', () => {
    expect(sprintf('%+d', 3)).toBe('+3')
    expect(sprintf('%+d', -3)).toBe('-3')
  })

  it('honours precision on floats', () => {
    expect(sprintf('%.2f', Math.PI)).toBe('3.14')
  })
})

describe('vsprintf', () => {
  it('accepts an array of arguments', () => {
    expect(vsprintf('%s / %s', ['a', 'b'])).toBe('a / b')
  })

  it('tolerates a missing args array', () => {
    expect(vsprintf('hello')).toBe('hello')
  })
})

describe('sprintf — caching', () => {
  it('returns identical results across repeated calls with the same format', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(sprintf('cached %d', i)).toBe(`cached ${i}`)
    }
  })
})
