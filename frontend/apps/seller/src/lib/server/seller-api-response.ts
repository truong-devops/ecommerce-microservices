import { NextResponse } from 'next/server';

export type SellerApiSource = 'backend';

export function ok<T>(data: T, source: SellerApiSource = 'backend', status = 200): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        source,
        timestamp: new Date().toISOString()
      }
    },
    { status }
  );
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    },
    { status }
  );
}
