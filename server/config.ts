export interface ServerConfig {
  appOrigin: string | null;
  appOrigins: string[];
  cookieSecure: boolean;
  databaseUrl: string;
  isProduction: boolean;
  port: number;
  rpName: string;
  sessionTtlDays: number;
}

export function getServerConfig(): ServerConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const appOrigins = parseOrigins(process.env.APP_ORIGINS ?? process.env.APP_ORIGIN);

  return {
    appOrigin: process.env.APP_ORIGIN ?? null,
    appOrigins: appOrigins.length > 0 ? appOrigins : getDefaultAppOrigins(isProduction),
    cookieSecure: getCookieSecure(process.env.APP_ORIGIN ?? null, isProduction),
    databaseUrl: process.env.DATABASE_URL ?? "postgres://prodnote:prodnote@127.0.0.1:5432/prodnote",
    isProduction,
    port: Number(process.env.PORT ?? 8787),
    rpName: process.env.WEBAUTHN_RP_NAME ?? "ProdNote",
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  };
}

export function getRequestOrigin(requestUrl: string, configuredOrigin: string | null): string {
  return configuredOrigin ?? new URL(requestUrl).origin;
}

export function getRequestRpId(origin: string): string {
  return process.env.WEBAUTHN_RP_ID ?? new URL(origin).hostname;
}

export function isAllowedOrigin(origin: string, requestUrl: string, config: Pick<ServerConfig, "appOrigins">): boolean {
  return origin === new URL(requestUrl).origin || config.appOrigins.includes(origin);
}

export function resolveClientOrigin(
  requestUrl: string,
  originHeader: string | undefined,
  config: Pick<ServerConfig, "appOrigin" | "appOrigins">,
): string {
  if (originHeader && isAllowedOrigin(originHeader, requestUrl, config)) {
    return originHeader;
  }

  return getRequestOrigin(requestUrl, config.appOrigin);
}

function parseOrigins(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function getDefaultAppOrigins(isProduction: boolean): string[] {
  if (isProduction) {
    return [];
  }

  const vitePorts = [5173, 5174, 5175, 5176, 5177, 5178, 5179];
  return vitePorts.flatMap((port) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}

function getCookieSecure(appOrigin: string | null, isProduction: boolean): boolean {
  if (process.env.COOKIE_SECURE) {
    return process.env.COOKIE_SECURE === "true";
  }

  if (appOrigin) {
    return new URL(appOrigin).protocol === "https:";
  }

  return isProduction;
}
