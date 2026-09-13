// src/app/api/track/route.ts
import { NextResponse } from 'next/server';
import { getOrderByDeliveryToken } from '@/lib/server/order';
import { markOrderAsDeliveredByToken } from '@/lib/server/order';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deliveryToken = searchParams.get('delivery_token');

  if (!deliveryToken) {
    return NextResponse.json(
      { ok: false, error: 'delivery_token is required' },
      { status: 400 }
    );
  }

  const order = await getOrderByDeliveryToken(deliveryToken);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: 'Order not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, order });
}

export async function POST(request: Request) {
  const { token } = await request.json();

  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'token is required' },
      { status: 400 }
    );
  }

  const result = await markOrderAsDeliveredByToken(token);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, orderId: result.orderId });
}