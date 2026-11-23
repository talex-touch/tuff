import { describe, expect, it } from 'vitest'
import { evaluateObjectLiteral, evaluateQuery } from './expression-eval'

describe('expression-eval (zero-eval safe parser & evaluator)', () => {
  describe('evaluateObjectLiteral', () => {
    it('parses JS/JSON5 object and array literals with single quotes, trailing commas, and comments', () => {
      const parsed = evaluateObjectLiteral(`
        {
          // single-line comment
          name: 'Tuff',
          version: 2,
          ratio: -0.5,
          hex: 0x10,
          active: true,
          empty: null,
          missing: undefined,
          /* multi-line comment */
          tags: ['json', 'formatter',],
        }
      `)

      expect(parsed).toEqual({
        name: 'Tuff',
        version: 2,
        ratio: -0.5,
        hex: 16,
        active: true,
        empty: null,
        missing: undefined,
        tags: ['json', 'formatter'],
      })
    })

    it('rejects prototype pollution keys and dynamic expressions', () => {
      expect(() => evaluateObjectLiteral('{ __proto__: { polluted: true } }')).toThrow(/Disallowed property/)
      expect(() => evaluateObjectLiteral('{ constructor: 1 }')).toThrow(/Disallowed property/)
      expect(() => evaluateObjectLiteral('{ a: alert(1) }')).toThrow()
    })
  })

  describe('evaluateQuery', () => {
    it('evaluates nested Object.values + arrow map queries', () => {
      const input = {
        teamA: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 17 }],
        teamB: [{ name: 'Carol', age: 25 }],
      }

      expect(evaluateQuery('Object.values(this).map(x => x.map(y => y.name))', input)).toEqual([
        ['Alice', 'Bob'],
        ['Carol'],
      ])
    })

    it('exposes top-level keys as bare identifiers and supports filter, ternary, optional chaining, and templates', () => {
      const input = {
        users: [
          { name: 'Alice', profile: { role: 'admin' }, score: 95 },
          { name: 'Bob', score: 60 },
        ],
        threshold: 80,
      }

      expect(
        // eslint-disable-next-line no-template-curly-in-string
        evaluateQuery('users.filter(u => u.score >= threshold).map(u => `${u.name}:${u.profile?.role ?? "member"}`)', input),
      ).toEqual(['Alice:admin'])
      expect(evaluateQuery('users.length > 1 ? "multi" : "single"', input)).toBe('multi')
    })

    it('does not mutate source arrays when sort or reverse is called', () => {
      const input = { nums: [3, 1, 2] }
      expect(evaluateQuery('nums.sort((a, b) => a - b)', input)).toEqual([1, 2, 3])
      expect(input.nums).toEqual([3, 1, 2])
    })

    it('blocks prototype and constructor escape attempts', () => {
      expect(() => evaluateQuery('this.constructor', { a: 1 })).toThrow(/not allowed/)
      expect(() => evaluateQuery('this["__proto__"]', { a: 1 })).toThrow(/not allowed/)
      expect(() => evaluateQuery('({}["constructor"])', { a: 1 })).toThrow(/not allowed/)
    })
  })
})
