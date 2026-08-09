import { describe, expect, it } from 'vitest'
import { formatOrderNotifyMessage } from '../src/alert/order-notify.js'

describe('formatOrderNotifyMessage', () => {
  it('formats accepted', () => {
    const t = formatOrderNotifyMessage({
      kind: 'accepted',
      orderId: 'ord-1',
      symbol: '005930',
      market: 'KR',
      side: 'BUY',
      orderType: 'LIMIT',
      quantity: '10',
      price: '70000',
      source: 'manual'
    })
    expect(t).toContain('주문 접수')
    expect(t).toContain('005930')
  })

  it('formats reserve requeue', () => {
    const t = formatOrderNotifyMessage({
      kind: 'reserve',
      action: 'requeued',
      symbol: 'AAPL',
      market: 'US',
      side: 'BUY',
      orderType: 'LIMIT',
      quantity: '1',
      price: '180',
      requeueCount: 2
    })
    expect(t).toContain('재등록')
    expect(t).toContain('AAPL')
  })
})
