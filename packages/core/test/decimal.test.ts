import { describe, expect, it } from 'vitest'
import {
  add,
  cmp,
  dec,
  div,
  mul,
  ratioToPercent,
  sub,
  sum,
  toDisplay,
  toFixed,
  toSigned
} from '../src/util/decimal.js'

describe('decimal', () => {
  it('부동소수 오차를 만들지 않는다', () => {
    expect(toFixed(add(dec('0.1'), dec('0.2')), 2)).toBe('0.30')
    expect(cmp(add(dec('0.1'), dec('0.2')), dec('0.3'))).toBe(0)
  })

  it('큰 금액도 정확히 더한다', () => {
    const total = sum([dec('112400000'), dec('16042900'), dec('0.5')])
    expect(toFixed(total, 1)).toBe('128442900.5')
  })

  it('원화 환산 곱셈이 정확하다', () => {
    const krw = mul(dec('8214.20'), dec('1384.20'))
    expect(toFixed(krw, 2)).toBe('11370095.64')
    expect(toDisplay(krw, 0)).toBe('11,370,096')
  })

  it('0 으로 나누면 던진다', () => {
    expect(() => div(dec('1'), dec('0'))).toThrow(RangeError)
  })

  it('음수를 올바르게 다룬다', () => {
    expect(toFixed(sub(dec('100'), dec('150')), 0)).toBe('-50')
    expect(toSigned(dec('-84120'))).toBe('-84,120')
  })

  it('소수비율을 백분율로 바꾼다', () => {
    expect(ratioToPercent(dec('0.1516'))).toBe('+15.16')
  })
})
