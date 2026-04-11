/**
 * Writes a Cloud Run --env-vars-file from process.env (after dotenv).
 * Uses JSON.stringify for values so special characters in DATABASE_URL are safe.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const db = process.env.DATABASE_URL?.trim();
const session = process.env.SESSION_SECRET?.trim() || "";
if (!db) {
  console.error("DATABASE_URL missing from .env");
  process.exit(1);
}

const lines = [
  `SESSION_SECRET: ${JSON.stringify(session)}`,
  `SESSION_SECURE: "true"`,
  `NODE_ENV: "production"`,
  `DATABASE_URL: ${JSON.stringify(db)}`,
];
const out = join(tmpdir(), `shoestockpro-run-env-${Date.now()}.yaml`);
writeFileSync(out, lines.join("\n"), "utf8");
console.log(out);
