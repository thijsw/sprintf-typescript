import { describe, expect, it } from 'vitest'
import { parseFormat } from '../src/parser.js'

describe('parseFormat', () => {
  it('returns an empty tree for the empty string', () => {
    expect(parseFormat('')).toEqual([])
  })

  it('treats a string with no placeholders as a single literal', () => {
    expect(parseFormat('hello world')).toEqual([
      { kind: 'literal', text: 'hello world' },
    ])
  })

  it('collapses "%%" into a literal percent', () => {
    expect(parseFormat('100%%')).toEqual([{ kind: 'literal', text: '100%' }])
  })

  it('parses a single implicit positional placeholder', () => {
    const [tok] = parseFormat('%s')
    expect(tok).toMatchObject({
      kind: 'placeholder',
      ref: { kind: 'positional-implicit' },
      specifier: 's',
    })
  })

  it('parses an explicit positional placeholder', () => {
    const [tok] = parseFormat('%2$d')
    expect(tok).toMatchObject({
      kind: 'placeholder',
      ref: { kind: 'positional-explicit', index: 2 },
      specifier: 'd',
    })
  })

  it('parses a named placeholder with a simple key', () => {
    const [tok] = parseFormat('%(name)s')
    expect(tok).toMatchObject({
      kind: 'placeholder',
      ref: {
        kind: 'named',
        source: 'name',
        path: [{ kind: 'key', name: 'name' }],
      },
      specifier: 's',
    })
  })

  it('parses a named placeholder with a nested key-and-index path', () => {
    const [tok] = parseFormat('%(users[0].name)s')
    expect(tok).toMatchObject({
      kind: 'placeholder',
      ref: {
        kind: 'named',
        source: 'users[0].name',
        path: [
          { kind: 'key', name: 'users' },
          { kind: 'index', index: 0 },
          { kind: 'key', name: 'name' },
        ],
      },
      specifier: 's',
    })
  })

  it('parses flags, width and precision', () => {
    const [tok] = parseFormat("%+'*-10.4f")
    expect(tok).toMatchObject({
      kind: 'placeholder',
      flags: { sign: true, leftAlign: true, padChar: '*', zeroPad: false },
      width: 10,
      precision: 4,
      specifier: 'f',
    })
  })

  it('distinguishes the zero-pad flag from width digits starting with zero', () => {
    // `%05d` → zero-pad flag + width 5.
    const [tok] = parseFormat('%05d')
    expect(tok).toMatchObject({
      flags: { zeroPad: true, padChar: '0' },
      width: 5,
      specifier: 'd',
    })
  })

  it('interleaves literals with multiple placeholders', () => {
    const tokens = parseFormat('a %s b %d c')
    expect(tokens).toMatchObject([
      { kind: 'literal', text: 'a ' },
      { kind: 'placeholder', specifier: 's' },
      { kind: 'literal', text: ' b ' },
      { kind: 'placeholder', specifier: 'd' },
      { kind: 'literal', text: ' c' },
    ])
  })

  it('rejects an unknown specifier', () => {
    expect(() => parseFormat('%q')).toThrow(SyntaxError)
  })

  it('rejects an unterminated named-argument parenthesis', () => {
    expect(() => parseFormat('%(name')).toThrow(SyntaxError)
  })

  it('rejects mixing positional and named placeholders', () => {
    expect(() => parseFormat('%s %(name)s')).toThrow(SyntaxError)
    expect(() => parseFormat('%(name)s %s')).toThrow(SyntaxError)
  })

  it('accepts the full specifier set', () => {
    for (const s of 'bcdiefgostTuvxXj') {
      const tokens = parseFormat(`%${s}`)
      expect(tokens[0]).toMatchObject({ kind: 'placeholder', specifier: s })
    }
  })
})
