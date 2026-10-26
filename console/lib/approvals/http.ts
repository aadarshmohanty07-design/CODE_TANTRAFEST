import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  ApprovalError,
  getSessionAccount,
} from "./service";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./session";
import { getDefaultStore } from "./store";
import type { Account } from "./types";

const MAX_JSON_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function hitRateLimit(
  key: string,
  limit = 8,
  windowMs = RATE_LIMIT_WINDOW_MS
): boolean {
  const now = Date.now();
  for (const [candidate, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(candidate);
  }
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

export function clearRateLimit(key: string): void {
  rateBuckets.delete(key);
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const hosts = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.split(",")[0].trim());

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApprovalError("The request origin is not valid.", 403);
  }
  if (!hosts.includes(originHost)) {
    throw new ApprovalError("This request came from another origin.", 403);
  }
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) {
    throw new ApprovalError("The request body is too large.", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApprovalError("Send a valid JSON body.");
  }
}

function requestIsSecure(request: NextRequest): boolean {
  return (
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:"
  );
}

export function attachSession(
  response: NextResponse,
  token: string,
  request: NextRequest
): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSession(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function requireApiAccount(
  request: NextRequest
): Promise<Account> {
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  const session = await getSessionAccount(getDefaultStore(), token);
  if (!session) {
    throw new ApprovalError("Sign in to continue.", 401, "unauthenticated");
  }
  return session.account;
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return NextResponse.json(
      { error: `${path}${issue?.message ?? "Check the fields and try again."}` },
      { status: 400 }
    );
  }
  if (error instanceof ApprovalError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  console.error("Approvals API error", error);
  return NextResponse.json(
    { error: "The server could not complete that action." },
    { status: 500 }
  );
}
