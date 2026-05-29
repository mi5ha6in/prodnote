import { Buffer } from "node:buffer";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { isAllowedOrigin, resolveClientOrigin, getRequestRpId, getServerConfig } from "./config";
import { addDays, addMinutes, createPasskeyLabel, createRandomToken, createUuid, hashToken } from "./crypto";
import { sqlClient } from "./db/client";
import { toSqlTimestamp } from "./db/timestamps";

const SESSION_COOKIE = "prodnote_session";
const config = getServerConfig();

type Row = Record<string, unknown>;

export interface AuthUser {
  id: string;
  handle: string;
}

export interface AppVariables {
  user: AuthUser;
}

export const registerVerifySchema = z.object({
  challengeId: z.string().uuid(),
  response: z.custom<RegistrationResponseJSON>(),
});

export const loginVerifySchema = z.object({
  challengeId: z.string().uuid(),
  response: z.custom<AuthenticationResponseJSON>(),
});

export async function createRegistrationOptions(
  requestUrl: string,
  originHeader?: string,
): Promise<{ challengeId: string; label: string; options: unknown }> {
  const origin = resolveClientOrigin(requestUrl, originHeader, config);
  const rpID = getRequestRpId(origin);
  const challengeId = createUuid();
  const label = createPasskeyLabel();
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID,
    userID: Buffer.from(challengeId),
    userName: label,
    userDisplayName: label,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });

  const now = new Date();
  await sqlClient`
    insert into auth_challenges (id, challenge, type, label, expires_at, created_at)
    values (${challengeId}, ${options.challenge}, 'registration', ${label}, ${toSqlTimestamp(addMinutes(now, 10))}, ${toSqlTimestamp(now)})
  `;

  return { challengeId, label, options };
}

export async function verifyRegistration(
  input: z.infer<typeof registerVerifySchema>,
  requestUrl: string,
  context: Context,
  originHeader?: string,
): Promise<AuthUser> {
  const challenge = await readChallenge(input.challengeId, "registration");
  const origin = resolveClientOrigin(requestUrl, originHeader, config);
  const rpID = getRequestRpId(origin);
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw new Error("Passkey не прошёл проверку.");
  }

  const credential = verification.registrationInfo.credential;
  const userId = createUuid();
  const now = new Date();

  await sqlClient.begin(async (transaction) => {
    await transaction`
      insert into users (id, handle, created_at, updated_at)
      values (${userId}, ${challenge.label}, ${toSqlTimestamp(now)}, ${toSqlTimestamp(now)})
    `;
    await transaction`
      insert into passkey_credentials (
        id, user_id, public_key, counter, transports, device_type, backed_up, created_at
      )
      values (
        ${credential.id}, ${userId}, ${Buffer.from(credential.publicKey)}, ${credential.counter},
        ${JSON.stringify(credential.transports ?? [])}::jsonb, ${verification.registrationInfo.credentialDeviceType},
        ${verification.registrationInfo.credentialBackedUp}, ${toSqlTimestamp(now)}
      )
    `;
    await transaction`delete from auth_challenges where id = ${input.challengeId}`;
  });

  await createSession(userId, context);
  return { id: userId, handle: challenge.label };
}

export async function createLoginOptions(requestUrl: string, originHeader?: string): Promise<{ challengeId: string; options: unknown }> {
  const origin = resolveClientOrigin(requestUrl, originHeader, config);
  const rpID = getRequestRpId(origin);
  const challengeId = createUuid();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });
  const now = new Date();

  await sqlClient`
    insert into auth_challenges (id, challenge, type, expires_at, created_at)
    values (${challengeId}, ${options.challenge}, 'authentication', ${toSqlTimestamp(addMinutes(now, 10))}, ${toSqlTimestamp(now)})
  `;

  return { challengeId, options };
}

export async function verifyLogin(
  input: z.infer<typeof loginVerifySchema>,
  requestUrl: string,
  context: Context,
  originHeader?: string,
): Promise<AuthUser> {
  const challenge = await readChallenge(input.challengeId, "authentication");
  const credentialRows = await sqlClient<Row[]>`
    select c.*, u.handle from passkey_credentials c
    join users u on u.id = c.user_id
    where c.id = ${input.response.id}
    limit 1
  `;
  const credentialRow = credentialRows[0];
  if (!credentialRow) {
    throw new Error("Passkey не найден.");
  }

  const origin = resolveClientOrigin(requestUrl, originHeader, config);
  const rpID = getRequestRpId(origin);
  const credential: WebAuthnCredential = {
    id: asString(credentialRow.id),
    publicKey: Buffer.from(credentialRow.public_key as Uint8Array),
    counter: Number(credentialRow.counter),
    transports: parseTransports(credentialRow.transports),
  };
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential,
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw new Error("Passkey не прошёл проверку.");
  }

  await sqlClient.begin(async (transaction) => {
    await transaction`
      update passkey_credentials
      set counter = ${verification.authenticationInfo.newCounter},
        device_type = ${verification.authenticationInfo.credentialDeviceType},
        backed_up = ${verification.authenticationInfo.credentialBackedUp}
      where id = ${credential.id}
    `;
    await transaction`delete from auth_challenges where id = ${input.challengeId}`;
  });

  const user = { id: asString(credentialRow.user_id), handle: asString(credentialRow.handle) };
  await createSession(user.id, context);
  return user;
}

export const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (context, next) => {
  const user = await getSessionUser(context);
  if (!user) {
    return context.json({ error: "Требуется вход." }, 401);
  }

  context.set("user", user);
  await next();
};

export const requireSameOrigin: MiddlewareHandler = async (context, next) => {
  const origin = context.req.header("origin");
  if (!origin) {
    await next();
    return;
  }

  if (!isAllowedOrigin(origin, context.req.url, config)) {
    return context.json({ error: "Недопустимый Origin." }, 403);
  }

  await next();
};

export async function getSessionUser(context: Context): Promise<AuthUser | null> {
  const token = getCookie(context, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const rows = await sqlClient<Row[]>`
    select u.id, u.handle from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > ${toSqlTimestamp(new Date())}
    limit 1
  `;
  const row = rows[0];
  return row ? { id: asString(row.id), handle: asString(row.handle) } : null;
}

export async function logout(context: Context): Promise<void> {
  const token = getCookie(context, SESSION_COOKIE);
  if (token) {
    await sqlClient`delete from sessions where token_hash = ${hashToken(token)}`;
  }

  deleteCookie(context, SESSION_COOKIE, {
    path: "/",
  });
}

async function createSession(userId: string, context: Context): Promise<void> {
  const token = createRandomToken();
  const now = new Date();
  const expiresAt = addDays(now, config.sessionTtlDays);
  await sqlClient`
    insert into sessions (id, user_id, token_hash, expires_at, created_at)
    values (${createUuid()}, ${userId}, ${hashToken(token)}, ${toSqlTimestamp(expiresAt)}, ${toSqlTimestamp(now)})
  `;

  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.cookieSecure,
    path: "/",
    expires: expiresAt,
  });
}

async function readChallenge(challengeId: string, type: "registration" | "authentication"): Promise<{ challenge: string; label: string }> {
  const rows = await sqlClient<Row[]>`
    select challenge, label from auth_challenges
    where id = ${challengeId} and type = ${type} and expires_at > ${toSqlTimestamp(new Date())}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Challenge истёк или не найден.");
  }

  return {
    challenge: asString(row.challenge),
    label: asString(row.label),
  };
}

function parseTransports(value: unknown): WebAuthnCredential["transports"] {
  if (Array.isArray(value)) {
    return value.filter((item): item is NonNullable<WebAuthnCredential["transports"]>[number] => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parseTransports(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
