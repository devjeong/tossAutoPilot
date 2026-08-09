/**
 * 주문 멱등키 (clientOrderId). 토스 API 10분 유효.
 * 네트워크 재시도 시 중복 주문을 막는 유일한 선 (SPEC F5.1).
 */

export function makeClientOrderId(prefix = 'tap'): string {
  const ts = Date.now().toString(36)
  const rand = cryptoRandom(8)
  return `${prefix}_${ts}_${rand}`
}

function cryptoRandom(bytes: number): string {
  const arr = new Uint8Array(bytes)
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(arr)
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}
