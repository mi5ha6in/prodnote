import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import {
  createLoginOptions,
  createRegistrationOptions,
  getSessionUser,
  loginVerifySchema,
  logout,
  registerVerifySchema,
  requireAuth,
  requireSameOrigin,
  verifyLogin,
  verifyRegistration,
  type AppVariables,
} from "./auth";
import { getServerConfig, isAllowedOrigin } from "./config";
import { runMigrations } from "./db/migrate";
import { getSyncedWorkspace, putSyncedWorkspace, type DeletedEntityType } from "./workspace";

const config = getServerConfig();
const deletedEntityTypes = ["project", "tag", "task", "note", "session", "pomodoroCycle", "plan", "event"] as const satisfies readonly DeletedEntityType[];

const putWorkspaceSchema = z.object({
  schemaVersion: z.number().int().positive(),
  baseRevision: z.number().int().nonnegative().optional(),
  deviceId: z.string().min(1).optional(),
  workspace: z.record(z.string(), z.unknown()),
  deletedEntities: z
    .array(
      z.object({
        type: z.enum(deletedEntityTypes),
        id: z.string().min(1),
        deletedAt: z.string().datetime(),
      }),
    )
    .default([]),
});

export const app = new Hono<{ Variables: AppVariables }>();

app.use("*", async (context, next) => {
  const url = new URL(context.req.url);
  if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) {
    url.hostname = "localhost";
    return context.redirect(url.toString(), 302);
  }

  await next();
});

app.use("/api/*", async (context, next) => {
  const origin = context.req.header("origin");
  const originAllowed = origin ? isAllowedOrigin(origin, context.req.url, config) : false;

  if (origin && originAllowed) {
    context.header("Access-Control-Allow-Origin", origin);
    context.header("Access-Control-Allow-Credentials", "true");
    context.header("Access-Control-Allow-Headers", context.req.header("access-control-request-headers") ?? "content-type");
    context.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    context.header("Vary", "Origin");
  }

  if (context.req.method === "OPTIONS") {
    if (origin && !originAllowed) {
      return context.json({ error: "Недопустимый Origin." }, 403);
    }

    return context.body(null, 204);
  }

  await next();
});

app.use("/api/*", async (context, next) => {
  if (context.req.method === "GET" || context.req.method === "HEAD" || context.req.method === "OPTIONS") {
    await next();
    return;
  }

  return requireSameOrigin(context, next);
});

app.get("/api/health", (context) => context.json({ ok: true }));

app.get("/api/me", async (context) => {
  const user = await getSessionUser(context);
  return context.json({
    authenticated: Boolean(user),
    user,
  });
});

app.post("/api/auth/passkey/register/options", async (context) => {
  const result = await createRegistrationOptions(context.req.url, context.req.header("origin"));
  return context.json(result);
});

app.post("/api/auth/passkey/register/verify", async (context) => {
  const body = await readJson(context.req);
  const parsed = registerVerifySchema.parse(body);
  const user = await verifyRegistration(parsed, context.req.url, context, context.req.header("origin"));
  return context.json({ authenticated: true, user });
});

app.post("/api/auth/passkey/login/options", async (context) => {
  const result = await createLoginOptions(context.req.url, context.req.header("origin"));
  return context.json(result);
});

app.post("/api/auth/passkey/login/verify", async (context) => {
  const body = await readJson(context.req);
  const parsed = loginVerifySchema.parse(body);
  const user = await verifyLogin(parsed, context.req.url, context, context.req.header("origin"));
  return context.json({ authenticated: true, user });
});

app.post("/api/auth/logout", async (context) => {
  await logout(context);
  return context.json({ ok: true });
});

app.get("/api/workspace", requireAuth, async (context) => {
  const user = context.get("user");
  return context.json(await getSyncedWorkspace(user.id));
});

app.put("/api/workspace", requireAuth, async (context) => {
  const user = context.get("user");
  const body = await readJson(context.req);
  const parsed = putWorkspaceSchema.parse(body);
  const result = await putSyncedWorkspace(user.id, parsed.workspace as never, parsed.deletedEntities);
  return context.json(result);
});

app.onError((error, context) => {
  const status = error instanceof z.ZodError ? 400 : 500;
  console.error("[api:error]", {
    method: context.req.method,
    path: new URL(context.req.url).pathname,
    status,
    error,
  });

  return context.json(
    {
      error: status === 400 ? "Некорректный запрос." : "Ошибка сервера.",
      details: config.isProduction ? undefined : String(error),
    },
    status,
  );
});

app.get("/assets/*", serveStatic({ root: "./dist" }));
app.get("/icons/*", serveStatic({ root: "./dist" }));
app.get("/manifest.webmanifest", serveStatic({ root: "./dist" }));
app.get("/sw.js", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

if (process.env.NODE_ENV !== "test") {
  await runMigrations();
  serve(
    {
      fetch: app.fetch,
      hostname: "0.0.0.0",
      port: config.port,
    },
    (info) => {
      console.log(`ProdNote server listening on http://${info.address}:${info.port}`);
    },
  );
}

async function readJson(request: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be JSON.");
  }
}
