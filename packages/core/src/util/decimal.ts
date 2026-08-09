/**
 * decimal 문자열 산술.
 *
 * 스펙이 가격·금액을 number 가 아니라 문자열로 주는 이유는 정밀도다.
 * 내부적으로 10^SCALE 배율의 BigInt 로만 계산한다.
 * (AUTO_TRADE_VER2 core 포팅)
 */

const SCALE = 12
const UNIT = 10n ** BigInt(SCALE)

/** 10^12 배율로 스케일된 고정소수점 값. */
export type Dec = bigint

export const ZERO: Dec = 0n

const DECIMAL_RE = /^[+-]?(\d+)(\.(\d+))?$/

/** decimal 문자열 → Dec. 형식이 아니면 예외를 던진다. */
export function dec(value: string | number | null | undefined): Dec {
  if (value === null || value === undefined || value === '') return ZERO
  const s = typeof value === 'number' ? String(value) : value.trim()
  const m = DECIMAL_RE.exec(s)
  if (!m) throw new TypeError(`invalid decimal string: ${JSON.stringify(value)}`)

  const negative = s.startsWith('-')
  const intPart = m[1] ?? '0'
  const fracRaw = m[3] ?? ''
  const frac = fracRaw.slice(0, SCALE).padEnd(SCALE, '0')
  const magnitude = BigInt(intPart) * UNIT + BigInt(frac || '0')
  return negative ? -magnitude : magnitude
}

export function decSafe(value: string | number | null | undefined, fallback: Dec = ZERO): Dec {
  try {
    return dec(value)
  } catch {
    return fallback
  }
}

export const add = (a: Dec, b: Dec): Dec => a + b
export const sub = (a: Dec, b: Dec): Dec => a - b
export const mul = (a: Dec, b: Dec): Dec => (a * b) / UNIT
export const neg = (a: Dec): Dec => -a
export const abs = (a: Dec): Dec => (a < 0n ? -a : a)
export const isZero = (a: Dec): boolean => a === 0n
export const cmp = (a: Dec, b: Dec): number => (a === b ? 0 : a > b ? 1 : -1)

export function div(a: Dec, b: Dec): Dec {
  if (b === 0n) throw new RangeError('division by zero')
  return (a * UNIT) / b
}

export function sum(values: readonly Dec[]): Dec {
  let acc = ZERO
  for (const v of values) acc += v
  return acc
}

/**
 * 표시용 문자열. 반올림은 half-up, 음수는 절댓값 기준으로 반올림한다.
 */
export function toFixed(value: Dec, dp = 0): string {
  if (dp < 0) throw new RangeError('dp must be >= 0')
  const negative = value < 0n
  let v = negative ? -value : value

  const drop = BigInt(SCALE - dp)
  if (drop > 0n) {
    const divisor = 10n ** drop
    const remainder = v % divisor
    v = v / divisor
    if (remainder * 2n >= divisor) v += 1n
  }

  const s = v.toString().padStart(dp + 1, '0')
  const intPart = dp === 0 ? s : s.slice(0, s.length - dp)
  const fracPart = dp === 0 ? '' : s.slice(s.length - dp)
  const body = fracPart ? `${intPart}.${fracPart}` : intPart
  return negative && v !== 0n ? `-${body}` : body
}

export function toDisplay(value: Dec, dp = 0): string {
  const s = toFixed(value, dp)
  const negative = s.startsWith('-')
  const body = negative ? s.slice(1) : s
  const [int = '0', frac] = body.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const out = frac ? `${grouped}.${frac}` : grouped
  return negative ? `-${out}` : out
}

export function toSigned(value: Dec, dp = 0): string {
  const s = toDisplay(value, dp)
  return value > 0n ? `+${s}` : s
}

/** 스펙의 손익률은 소수비율(0.1516 = 15.16%). 백분율 문자열로. */
export function ratioToPercent(value: Dec, dp = 2): string {
  return toSigned(mul(value, dec(100)), dp)
}

export const toNumber = (value: Dec): number => Number(value) / Number(UNIT)
