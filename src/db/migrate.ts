import { down, status, up } from "@atlas/migrate";
import { db } from "./index.ts";

const cmd = process.argv[2] ?? "up";
const dir = "migrations";

if (cmd === "up") {
  const applied = await up(db, dir);
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "nothing to apply");
} else if (cmd === "down") {
  const rolled = await down(db, dir);
  console.log(rolled ? `rolled back: ${rolled}` : "nothing to roll back");
} else if (cmd === "status") {
  for (const m of await status(db, dir)) console.log(`${m.appliedAt ? "✓" : "·"} ${m.name}`);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}

db.close?.();
