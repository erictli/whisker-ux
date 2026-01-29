#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSession } from "./agent.js";
import { writeReport } from "./report.js";
import { WhiskerConfig } from "./types.js";
import { getApiKey, runSetup, getConfigPath, deleteApiKey, listAuthStates, deleteAuthState, authStateExists, getAuthDir } from "./config.js";
import { printConfig, printResults, printError } from "./ui.js";
import { runAuthCapture } from "./auth.js";

interface RunOptions {
  url: string;
  persona?: string;
  maxSteps: string;
  viewport: string;
  output: string;
  login?: boolean;
  auth?: string;
  screenshotWindow: string;
}

// Validate auth state name to prevent path traversal attacks
// Only allow alphanumeric characters, underscores, and hyphens
const AUTH_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function validateAuthName(name: string): boolean {
  return AUTH_NAME_PATTERN.test(name) && name.length > 0 && name.length <= 64;
}

// Read version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));
const VERSION = packageJson.version;

const program = new Command();

program
  .name("whisker")
  .description("AI-powered usability testing CLI using Claude computer use")
  .version(VERSION);

// Setup command
program
  .command("setup")
  .description("Configure your Anthropic API key")
  .action(async () => {
    await runSetup();
  });

// Logout command
program
  .command("logout")
  .description("Remove stored API key")
  .action(() => {
    const deleted = deleteApiKey();
    if (deleted) {
      console.log("API key removed from", getConfigPath());
    } else {
      console.log("No stored API key found.");
    }
  });

// Run command (main functionality)
program
  .command("run", { isDefault: true })
  .description("Run a usability test")
  .argument("<task>", "Task description (e.g., 'Add a product to cart')")
  .requiredOption("-u, --url <url>", "URL of the site to test")
  .option("-p, --persona <persona>", "Persona description for the tester")
  .option("-m, --max-steps <number>", "Maximum number of steps", "50")
  .option("-v, --viewport <WxH>", "Viewport size (e.g., 1280x800)", "1280x800")
  .option("-o, --output <dir>", "Output directory", ".whisker")
  .option("-l, --login", "Pause for manual login before AI takes over")
  .option("-a, --auth <name>", "Use saved authentication state")
  .option("-w, --screenshot-window <number>", "Screenshots to keep in context (reduces token usage)", "5")
  .action(async (task: string, opts: RunOptions) => {
    // Get API key from config or environment
    const apiKey = getApiKey();
    if (!apiKey) {
      const cwd = process.cwd();
      const configPath = getConfigPath();
      printError(
        `No Anthropic API key found.\n\n` +
        `Checked these locations:\n` +
        `  • ANTHROPIC_API_KEY environment variable\n` +
        `  • ${cwd}/.env.local\n` +
        `  • ${cwd}/.env\n` +
        `  • ${configPath}\n\n` +
        `Quick setup - create a .env file:\n` +
        `  echo "ANTHROPIC_API_KEY=sk-ant-..." > .env\n\n` +
        `Or run interactive setup:\n` +
        `  whisker setup\n\n` +
        `Get your API key at: https://console.anthropic.com/settings/keys`
      );
      process.exit(1);
    }

    // Set for the Anthropic SDK to pick up
    process.env.ANTHROPIC_API_KEY = apiKey;

    // Parse viewport
    const viewportParts = opts.viewport.split("x");
    if (viewportParts.length !== 2) {
      printError("Invalid viewport format. Use WxH (e.g., 1280x800)");
      process.exit(1);
    }
    const width = parseInt(viewportParts[0], 10);
    const height = parseInt(viewportParts[1], 10);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
      printError("Invalid viewport dimensions. Use positive integers.");
      process.exit(1);
    }

    // Parse max steps
    const maxSteps = parseInt(opts.maxSteps, 10);
    if (isNaN(maxSteps) || maxSteps <= 0) {
      printError("max-steps must be a positive integer");
      process.exit(1);
    }

    // Validate auth name if provided
    if (opts.auth && !validateAuthName(opts.auth)) {
      printError(
        `Invalid auth name "${opts.auth}".\n` +
        `Names must contain only letters, numbers, underscores, and hyphens (max 64 chars).`
      );
      process.exit(1);
    }

    // Parse screenshot window
    const screenshotWindow = parseInt(opts.screenshotWindow, 10);
    if (isNaN(screenshotWindow) || screenshotWindow <= 0) {
      printError("screenshot-window must be a positive integer");
      process.exit(1);
    }

    const config: WhiskerConfig = {
      task,
      url: opts.url,
      persona: opts.persona,
      maxSteps,
      viewport: { width, height },
      outputDir: opts.output,
      interactiveLogin: opts.login,
      authStateName: opts.auth,
      screenshotWindow,
    };

    // Print banner and config
    printConfig(
      config.task,
      config.url,
      VERSION,
      config.persona,
      config.maxSteps,
      `${config.viewport.width}x${config.viewport.height}`
    );

    try {
      const { report, sessionLog } = await runSession(config);
      await writeReport(report, sessionLog, config.outputDir, VERSION);

      // Print results
      printResults(
        report.taskCompleted,
        report.summary,
        report.findings,
        config.outputDir
      );
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Auth command group
const authCommand = program
  .command("auth")
  .description("Manage saved authentication states");

// Auth save subcommand
authCommand
  .command("save <name>")
  .description("Save browser auth state for reuse")
  .requiredOption("-u, --url <url>", "URL to open for login")
  .option("-v, --viewport <WxH>", "Viewport size (e.g., 1280x800)", "1280x800")
  .action(async (name: string, opts: { url: string; viewport: string }) => {
    // Validate auth name to prevent path traversal
    if (!validateAuthName(name)) {
      printError(
        `Invalid auth name "${name}".\n` +
        `Names must contain only letters, numbers, underscores, and hyphens (max 64 chars).`
      );
      process.exit(1);
    }

    // Parse viewport
    const viewportParts = opts.viewport.split("x");
    if (viewportParts.length !== 2) {
      printError("Invalid viewport format. Use WxH (e.g., 1280x800)");
      process.exit(1);
    }
    const width = parseInt(viewportParts[0], 10);
    const height = parseInt(viewportParts[1], 10);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
      printError("Invalid viewport dimensions. Use positive integers.");
      process.exit(1);
    }

    try {
      await runAuthCapture({
        url: opts.url,
        name,
        viewport: { width, height },
      });
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Auth list subcommand
authCommand
  .command("list")
  .description("List saved authentication states")
  .action(() => {
    const states = listAuthStates();
    if (states.length === 0) {
      console.log("No saved authentication states.");
      console.log("");
      console.log("Save one with: whisker auth save <name> --url <login-url>");
      return;
    }

    console.log("");
    console.log("Saved authentication states:");
    console.log("");
    for (const state of states) {
      const date = new Date(state.savedAt);
      const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();
      console.log(`  ${state.name}`);
      console.log(`    Saved: ${dateStr}`);
      console.log(`    Path:  ${state.filePath}`);
      console.log("");
    }
    console.log(`Auth directory: ${getAuthDir()}`);
  });

// Auth delete subcommand
authCommand
  .command("delete <name>")
  .description("Delete a saved authentication state")
  .action((name: string) => {
    // Validate auth name to prevent path traversal
    if (!validateAuthName(name)) {
      printError(
        `Invalid auth name "${name}".\n` +
        `Names must contain only letters, numbers, underscores, and hyphens (max 64 chars).`
      );
      process.exit(1);
    }

    if (!authStateExists(name)) {
      printError(`Auth state "${name}" not found.`);
      process.exit(1);
    }

    const deleted = deleteAuthState(name);
    if (deleted) {
      console.log(`Auth state "${name}" deleted.`);
    } else {
      printError(`Failed to delete auth state "${name}".`);
      process.exit(1);
    }
  });

program.parse();
