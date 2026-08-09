/**
 * 주문 접수·체결·예약 텔레그램 메시지 포맷.
 */

export type OrderNotifySource = 'manual' | 'reserved' | 'strategy'

export type OrderAcceptedEvent = {
  kind: 'accepted'
  orderId: string
  symbol: string
  market: 'KR' | 'US'
  side: 'BUY' | 'SELL'
  orderType: 'LIMIT' | 'MARKET'
  quantity: string
  price?: string | null
  source: OrderNotifySource
  paper?: boolean
}

export type OrderFillEvent = {
  kind: 'fill'
  orderId: string
  symbol: string
  market: 'KR' | 'US'
  side: 'BUY' | 'SELL'
  status: string
  filledQuantity: string
  quantity: string
  averageFilledPrice?: string | null
  filledAmount?: string | null
  source: OrderNotifySource
  complete: boolean
}

export type OrderTerminalEvent = {
  kind: 'terminal'
  orderId: string
  symbol: string
  market: 'KR' | 'US'
  side: 'BUY' | 'SELL'
  status: string
  filledQuantity: string
  quantity: string
  source: OrderNotifySource
  detail?: string
}

export type OrderReserveEvent = {
  kind: 'reserve'
  action: 'created' | 'requeued' | 'cancelled' | 'working'
  symbol: string
  market: 'KR' | 'US'
  side: 'BUY' | 'SELL'
  orderType: 'LIMIT' | 'MARKET'
  quantity: string
  price?: string | null
  requeueCount?: number
  detail?: string
}

export type OrderNotifyEvent =
  | OrderAcceptedEvent
  | OrderFillEvent
  | OrderTerminalEvent
  | OrderReserveEvent

function sourceLine(source: OrderNotifySource): string {
  if (source === 'reserved') return '출처: 예약 매매'
  if (source === 'strategy') return '출처: 전략 자동전송'
  return '출처: 수동 주문'
}

export function formatOrderNotifyMessage(ev: OrderNotifyEvent): string {
  if (ev.kind === 'reserve') {
    const sideLabel = ev.side === 'BUY' ? '매수' : '매도'
    const marketLabel = ev.market === 'KR' ? '국내' : '미국'
    const priceLine =
      ev.orderType === 'MARKET' || !ev.price ? '시장가' : `지정가 ${ev.price}`
    const head =
      ev.action === 'created'
        ? '📅 예약 등록'
        : ev.action === 'requeued'
          ? '🔁 예약 재등록 (다음 영업일)'
          : ev.action === 'working'
            ? '📤 예약 → 주문 전송'
            : '🚫 예약 취소'
    return [
      head,
      '',
      `${sideLabel} · ${marketLabel} · ${ev.symbol}`,
      `수량 ${ev.quantity}주 · ${priceLine}`,
      ...(ev.requeueCount != null ? [`재예약 횟수 ${ev.requeueCount}`] : []),
      ...(ev.detail ? [ev.detail] : [])
    ].join('\n')
  }

  const sideLabel = ev.side === 'BUY' ? '매수' : '매도'
  const marketLabel = ev.market === 'KR' ? '국내' : '미국'
  const src = sourceLine(ev.source)

  if (ev.kind === 'accepted') {
    const priceLine =
      ev.orderType === 'MARKET' || !ev.price ? '시장가' : `지정가 ${ev.price}`
    return [
      ev.paper ? '📝 페이퍼 주문 (실전송 없음)' : '📥 주문 접수',
      '',
      `${sideLabel} · ${marketLabel} · ${ev.symbol}`,
      `수량 ${ev.quantity}주 · ${priceLine}`,
      `orderId ${ev.orderId}`,
      src,
      '',
      ev.paper ? 'Paper 모드 — 게이트·본문만 기록.' : '체결되면 이어서 알려 드립니다.'
    ].join('\n')
  }

  if (ev.kind === 'fill') {
    const head = ev.complete ? '✅ 전량 체결' : '🔸 부분 체결'
    const price =
      ev.averageFilledPrice && ev.averageFilledPrice !== '0'
        ? `@ ${ev.averageFilledPrice}`
        : ''
    const amount = ev.filledAmount ? ` · 금액 ${ev.filledAmount}` : ''
    return [
      head,
      '',
      `${sideLabel} · ${marketLabel} · ${ev.symbol}`,
      `체결 ${ev.filledQuantity} / ${ev.quantity}주 ${price}${amount}`.trim(),
      `상태 ${ev.status}`,
      `orderId ${ev.orderId}`,
      src
    ].join('\n')
  }

  const icon =
    ev.status === 'CANCELED' || ev.status === 'CANCEL_REJECTED'
      ? '🚫'
      : ev.status === 'REJECTED'
        ? '❌'
        : '⚪️'
  return [
    `${icon} 주문 종료 · ${ev.status}`,
    '',
    `${sideLabel} · ${marketLabel} · ${ev.symbol}`,
    `체결 ${ev.filledQuantity} / ${ev.quantity}주`,
    `orderId ${ev.orderId}`,
    src,
    ...(ev.detail ? ['', ev.detail] : [])
  ].join('\n')
}
