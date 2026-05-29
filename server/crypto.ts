import { createHash, randomBytes, randomUUID } from "node:crypto";

export function createUuid(): string {
  return randomUUID();
}

export function createRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasskeyLabel(): string {
  return `prodnote-${randomBytes(4).toString("base64url").slice(0, 5).toUpperCase()}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}
