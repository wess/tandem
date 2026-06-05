import { command } from "../command/index.ts";
import { publishCommand } from "./publish.ts";

// Parent for project-level workflow scaffolding. Today there's only one
// subcommand (`publish`) — future additions (CI, deploy, etc.) slot in
// here without taking another top-level command slot on the CLI.
export const workflowCommand = command("workflow", {
  description: "Scaffold GitHub Actions workflows into a project",
  subcommands: [publishCommand],
  run: () => {
    console.log("Usage: atlas workflow <subcommand>\n");
    console.log("Subcommands:");
    console.log(`  publish   Drop .github/workflows/publish.yml into the current project`);
  },
});
