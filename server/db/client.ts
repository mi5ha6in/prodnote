import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerConfig } from "../config";

const config = getServerConfig();

export const sqlClient = postgres(config.databaseUrl, {
  max: 10,
});

export const db = drizzle(sqlClient);
