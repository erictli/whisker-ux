#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import { runSession } from "./agent.js";
import { writeReport } from "./report.js";
import { WhiskerConfig } from "./types.js";
import { getApiKey, runSetup, getConfigPath, deleteApiKey } from "./config.js";
import { printBanner, printConfig, printResults, printError } from "./ui.js";

const program = new Command();

program
  .name("whisker")
  .description("AI-powered usability testing CLI using Claude computer use")
  .version("0.1.0");

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
  .action(async (task: string, opts: Record<string, string>) => {
    // Get API key from config or environment
    const apiKey = getApiKey();
    if (!apiKey) {
      printError(
        `No Anthropic API key configured.\n\nRun setup: npx tsx src/cli.ts setup\nOr set env: export ANTHROPIC_API_KEY=sk-ant-...\n\nConfig: ${getConfigPath()}`
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

    const config: WhiskerConfig = {
      task,
      url: opts.url,
      persona: opts.persona,
      maxSteps,
      viewport: { width, height },
      outputDir: opts.output,
    };

    // Print banner and config
    printBanner();
    printConfig(
      config.task,
      config.url,
      config.persona,
      config.maxSteps,
      `${config.viewport.width}x${config.viewport.height}`
    );

    try {
      const { report, sessionLog } = await runSession(config);
      const { markdownPath, jsonPath, screenshotDir } = await writeReport(
        report,
        sessionLog,
        config.outputDir
      );

      // Print results with the new UI
      const absoluteOutputDir = path.resolve(config.outputDir);
      printResults(
        report.taskCompleted,
        report.summary,
        report.findings,
        config.outputDir,
        absoluteOutputDir
      );
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
