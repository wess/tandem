import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { command, flag } from "../command/index.ts";

// Locate the bundled publish workflow template. Same lookup pattern as
// init/templates.ts so both the monorepo and the published-to-npm layouts
// resolve correctly.
const findSharedFile = (rel: string): string | null => {
  const monorepoPath = join(dirname(import.meta.dir), "..", "..", "templates", "_shared", rel);
  if (existsSync(monorepoPath)) return monorepoPath;
  const nmPath = join(process.cwd(), "node_modules", "@atlas", "cli", "templates", "_shared", rel);
  if (existsSync(nmPath)) return nmPath;
  return null;
};

export const publishCommand = command("publish", {
  description: "Drop .github/workflows/publish.yml into the current project",
  flags: {
    force: flag("f", { type: "boolean", default: false, description: "Overwrite an existing publish.yml" }),
  },
  run: async (args) => {
    const src = findSharedFile(".github/workflows/publish.yml");
    if (!src) {
      console.error("Could not locate templates/_shared/.github/workflows/publish.yml in the atlas install.");
      process.exit(1);
    }

    const dest = join(process.cwd(), ".github", "workflows", "publish.yml");
    if (existsSync(dest) && !args.flags.force) {
      console.error(`Refusing to overwrite ${dest} — pass --force to replace it.`);
      process.exit(1);
    }

    mkdirSync(dirname(dest), { recursive: true });
    const content = await Bun.file(src).text();
    await Bun.write(dest, content);

    console.log(`  wrote .github/workflows/publish.yml`);
    console.log(`\nNext:`);
    console.log(`  • Confirm package.json has a "version" field`);
    console.log(`  • Confirm Dockerfile is at the repo root`);
    console.log(`  • Optional: add DOCKERHUB_USERNAME + DOCKERHUB_TOKEN secrets to mirror to Docker Hub`);
  },
});
