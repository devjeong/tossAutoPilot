import type { Clock } from '../util/clock.js'
import { systemClock } from '../util/clock.js'

/** 초당 capacity 허용 토큰 버킷 (X-RateLimit-Limit 대응). */
export class TokenBucket {
  private tokens: number
  private lastRefill: number
  private capacity: number

  constructor(
    capacity: number,
    private readonly clock: Clock = systemClock
  ) {
    this.capacity = Math.max(1, capacity)
    this.tokens = this.capacity
    this.lastRefill = clock.now()
  }

  private refill(): void {
    const now = this.clock.now()
    const elapsedSec = (now - this.lastRefill) / 1000
    if (elapsedSec <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.capacity)
    this.lastRefill = now
  }

  async take(n = 1): Promise<void> {
    for (;;) {
      this.refill()
      if (this.tokens >= n) {
        this.tokens -= n
        return
      }
      const deficit = n - this.tokens
      const waitMs = Math.max(10, Math.ceil((deficit / this.capacity) * 1000))
      await this.clock.sleep(waitMs)
    }
  }

  observeHeaders(limit: number | undefined, remaining: number | undefined): void {
    if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
      this.capacity = limit
    }
    if (remaining !== undefined && Number.isFinite(remaining) && remaining >= 0) {
      this.tokens = Math.min(this.tokens, Math.min(remaining, this.capacity))
      this.lastRefill = this.clock.now()
    }
  }

  penalize(retryAfterSec: number): void {
    this.tokens = 0
    this.lastRefill = this.clock.now() + Math.max(0, retryAfterSec) * 1000
  }

  /** 0~1 여유 비율 */
  headroom(): number {
    this.refill()
    return this.tokens / this.capacity
  }

  get limit(): number {
    return this.capacity
  }
}
