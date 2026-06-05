import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { publishCommand } from "../workflow/publish.ts";

const withTempCwd = async (fn: (dir: string) => Promise<void>) => {
  const dir = join(import.meta.dir, `__test_workflow_${Math.random().toString(36).slice(2)}__`);
  mkdirSync(dir, { recursive: true });
  const prev = process.cwd();
  process.chdir(dir);
  try {
    await fn(dir);
  } finally {
    process.chdir(prev);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  }
};

test("workflow publish writes .github/workflows/publish.yml", async () => {
  await withTempCwd(async (dir) => {
    await publishCommand.run!({ args: [], flags: { force: false } });
    const yamlPath = join(dir, ".github", "workflows", "publish.yml");
    expect(existsSync(yamlPath)).toBe(true);
    const yaml = await Bun.file(yamlPath).text();
    expect(yaml).toContain("name: publish");
  });
});

test("workflow publish refuses to overwrite without --force", async () => {
  await withTempCwd(async (dir) => {
    const yamlPath = join(dir, ".github", "workflows", "publish.yml");
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    await Bun.write(yamlPath, "name: keep-me\n");

    const exit = process.exit;
    let exitCode: number | undefined;
    // process.exit terminates the test runner; trap it so we can assert.
    (process as unknown as { exit: (c?: number) => never }).exit = ((c?: number) => {
      exitCode = c;
      throw new Error("exit");
    }) as never;
    try {
      await expect(publishCommand.run!({ args: [], flags: { force: false } })).rejects.toThrow("exit");
    } finally {
      (process as unknown as { exit: typeof exit }).exit = exit;
    }
    expect(exitCode).toBe(1);
    const yaml = await Bun.file(yamlPath).text();
    expect(yaml).toBe("name: keep-me\n");
  });
});

test("workflow publish overwrites with --force", async () => {
  await withTempCwd(async (dir) => {
    const yamlPath = join(dir, ".github", "workflows", "publish.yml");
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    await Bun.write(yamlPath, "name: keep-me\n");

    await publishCommand.run!({ args: [], flags: { force: true } });
    const yaml = await Bun.file(yamlPath).text();
    expect(yaml).toContain("name: publish");
    expect(yaml).not.toBe("name: keep-me\n");
  });
});
