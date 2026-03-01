import { NextResponse } from "next/server";

export type ApiEnvelope<T> = {
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
};

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  const payload: ApiEnvelope<T> = { data, error: null, meta };
  return NextResponse.json(payload, { status });
}

export function fail(message: string, status = 400, meta?: Record<string, unknown>) {
  const payload: ApiEnvelope<null> = { data: null, error: message, meta };
  return NextResponse.json(payload, { status });
}