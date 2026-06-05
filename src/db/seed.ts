import { hash } from "@atlas/auth";
import { config } from "../config.ts";
import { db, from, insertRow, users } from "./index.ts";

const email = config.adminEmail.toLowerCase().trim();
const password = config.adminPassword;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then run `bun run seed`.");
  process.exit(1);
}

const existing = await db.one(from(users).where((q) => q("email").equals(email)));
if (existing) {
  console.log(`admin ${email} already exists`);
} else {
  await insertRow(users, { email, name: "Admin", password: await hash(password) });
  console.log(`seeded admin: ${email}`);
}

db.close?.();
