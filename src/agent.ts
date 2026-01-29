import Anthropic from "@anthropic-ai/sdk";
import { BrowserManager } from "./browser.js";
import {
  getNavigationSystemPrompt,
  getReportSystemPrompt,
} from "./prompts.js";
import {
  WhiskerConfig,
  SessionLog,
  SessionStep,
  ComputerAction,
  WhiskerReport,
  Finding,
  MODEL_CONFIG,
  ElementContext,
} from "./types.js";
import { printTestStart, startSpinner, stopSpinner, startWaitingSpinner, clearSpinner, printStepComplete, printLoginPrompt, printLoginComplete, waitForEnterKey } from "./ui.js";

const MAX_SCREENSHOTS_FOR_ANALYSIS = 10; // Limit screenshots sent to analysis phase
const DEFAULT_SCREENSHOT_WINDOW = 5; // Keep last N screenshots in navigation context

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/**
 * Prunes old screenshots from messages to reduce token usage.
 * Keeps only the last `maxScreenshots` screenshots, replacing older ones with text placeholders.
 * This dramatically reduces context size for long sessions while preserving recent visual context.
 *
 * Tracks individual (messageIndex, blockIndex) pairs to handle messages with multiple screenshots correctly.
 */
function pruneOldScreenshots(
  messages: BetaMessageParam[],
  maxScreenshots: number
): BetaMessageParam[] {
  // Find all screenshot locations as (messageIndex, blockIndex) pairs, newest first
  const screenshotLocations: Array<{ msgIdx: number; blockIdx: number }> = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && Array.isArray(msg.content)) {
      // Iterate blocks in reverse to maintain newest-first order within each message
      for (let j = msg.content.length - 1; j >= 0; j--) {
        const block = msg.content[j];
        if (
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "tool_result" &&
          "content" in block &&
          Array.isArray(block.content)
        ) {
          const hasImage = block.content.some(
            (c: unknown) =>
              typeof c === "object" && c !== null && "type" in c && (c as { type: string }).type === "image"
          );
          if (hasImage) {
            screenshotLocations.push({ msgIdx: i, blockIdx: j });
          }
        }
      }
    }
  }

  // If within limit, return as-is
  if (screenshotLocations.length <= maxScreenshots) {
    return messages;
  }

  // Build set of block locations to prune (older screenshots beyond the window)
  const locationsToPrune = new Set(
    screenshotLocations.slice(maxScreenshots).map(loc => `${loc.msgIdx}:${loc.blockIdx}`)
  );

  // Create pruned copy, only replacing specific blocks
  return messages.map((msg, msgIdx) => {
    if (msg.role === "user" && Array.isArray(msg.content)) {
      // Check if any blocks in this message need pruning
      const hasBlocksToPrune = msg.content.some((_, blockIdx) =>
        locationsToPrune.has(`${msgIdx}:${blockIdx}`)
      );

      if (!hasBlocksToPrune) return msg;

      const newContent = msg.content.map((block, blockIdx) => {
        if (!locationsToPrune.has(`${msgIdx}:${blockIdx}`)) return block;

        if (
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "tool_result" &&
          "content" in block &&
          Array.isArray(block.content)
        ) {
          // Replace image content with text placeholder
          return {
            ...block,
            content: "[Screenshot removed from context to save tokens]",
          };
        }
        return block;
      });
      return { ...msg, content: newContent };
    }
    return msg;
  });
}

export async function runSession(config: WhiskerConfig): Promise<{
  report: WhiskerReport;
  sessionLog: SessionLog;
}> {
  const client = new Anthropic();
  const browser = new BrowserManager(config);

  printTestStart();
  try {
    startSpinner("Launching browser...");
    await browser.launch();
    stopSpinner("Browser launched");

    startSpinner("Navigating to URL...");
    await browser.navigateToUrl();
    stopSpinner(`Browser ready at ${config.url}`);

    // Interactive login: pause for user to log in manually
    if (config.interactiveLogin) {
      printLoginPrompt();
      await waitForEnterKey();
      printLoginComplete();
    }

    const sessionLog = await navigationPhase(client, browser, config);
    printStepComplete(`Navigation complete (${sessionLog.steps.length} steps)`);

    startSpinner("Generating report...");
    const report = await reportPhase(client, sessionLog);
    stopSpinner("Report generated");

    return { report, sessionLog };
  } finally {
    await browser.close();
  }
}

async function navigationPhase(
  client: Anthropic,
  browser: BrowserManager,
  config: WhiskerConfig
): Promise<SessionLog> {
  const { modelId, betaFlag } = MODEL_CONFIG[config.model];
  const startTime = Date.now();
  const steps: SessionStep[] = [];
  const observations: string[] = [];

  const computerTool: Anthropic.Beta.Messages.BetaToolComputerUse20250124 = {
    type: "computer_20250124",
    name: "computer",
    display_width_px: config.viewport.width,
    display_height_px: config.viewport.height,
    display_number: 1,
    cache_control: { type: "ephemeral" },
  };

  // Use array format with cache_control for prompt caching
  const systemPrompt: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    {
      type: "text",
      text: getNavigationSystemPrompt(config),
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: BetaMessageParam[] = [
    {
      role: "user",
      content: `Please begin the usability test. The browser is already open to ${config.url}. Complete this task: ${config.task}`,
    },
  ];

  let stepCount = 0;

  const screenshotWindow = config.screenshotWindow ?? DEFAULT_SCREENSHOT_WINDOW;

  while (stepCount < config.maxSteps) {
    // Show waiting spinner while waiting for API response
    startWaitingSpinner();

    // Prune old screenshots to reduce token usage
    const prunedMessages = pruneOldScreenshots(messages, screenshotWindow);

    let response: BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        tools: [computerTool],
        messages: prunedMessages,
        betas: [betaFlag],
      });
    } catch (err) {
      clearSpinner();
      stopSpinner(`API error: ${err}`);
      throw err;
    }

    // Clear waiting spinner when we get a response
    clearSpinner();

    // Append assistant response to messages
    messages.push({
      role: "assistant",
      content: response.content as BetaContentBlockParam[],
    });

    // Process content blocks
    const toolResults: BetaToolResultBlockParam[] = [];
    let hasToolUse = false;

    // First pass: collect thinking text as observations
    for (const block of response.content) {
      if (block.type === "text") {
        observations.push(block.text);
      }
    }

    // Actions that don't change visual state - skip screenshot to save tokens
    const SKIP_SCREENSHOT_ACTIONS = new Set(["mouse_move"]);

    // Second pass: process tool uses
    for (const block of response.content) {
      if (block.type === "tool_use") {
        hasToolUse = true;
        stepCount++;
        const action = block.input as ComputerAction;
        const actionDesc = formatAction(action);

        // Show spinner while executing
        startSpinner(`Step ${stepCount}: ${actionDesc}`);

        // Capture element context BEFORE click actions (so we get the element being clicked)
        let elementContext: ElementContext | undefined;
        const clickActions = ['left_click', 'right_click', 'double_click', 'triple_click', 'middle_click'];
        if (clickActions.includes(action.action) && action.coordinate) {
          elementContext = await browser.getElementContext(action.coordinate[0], action.coordinate[1]);
        }

        // Execute the action
        if (action.action !== "screenshot") {
          try {
            await browser.executeAction(action);
          } catch (err) {
            // Print failed step
            stopSpinner(`Step ${stepCount}: ${actionDesc} (failed)`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error executing action: ${err instanceof Error ? err.message : String(err)}`,
              is_error: true,
            });
            continue;
          }
        }

        // Print completed step
        stopSpinner(`Step ${stepCount}: ${actionDesc}`);

        // Skip screenshot for non-visual actions to save tokens
        if (SKIP_SCREENSHOT_ACTIONS.has(action.action)) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Action completed. The page looks the same as before.",
          });
          continue;
        }

        // Take screenshot after action
        const screenshotBase64 = await browser.takeScreenshot();

        steps.push({
          stepNumber: stepCount,
          action,
          screenshotBase64,
          timestamp: Date.now(),
          pageUrl: browser.getCurrentUrl(),
          elementContext,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: screenshotBase64,
              },
            },
          ],
        });
      }
    }

    // If no tool use, Claude is done
    if (!hasToolUse) {
      break;
    }

    // Send tool results back
    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  if (stepCount >= config.maxSteps) {
    printStepComplete(`Reached max step limit (${config.maxSteps})`);
  }

  return {
    config,
    steps,
    observations,
    consoleErrors: browser.getConsoleErrors(),
    networkFailures: browser.getNetworkFailures(),
    startTime,
    endTime: Date.now(),
  };
}

function formatAction(action: ComputerAction): string {
  switch (action.action) {
    case "screenshot":
      return "screenshot";
    case "left_click":
      return `click at (${action.coordinate?.[0]}, ${action.coordinate?.[1]})`;
    case "right_click":
      return `right-click at (${action.coordinate?.[0]}, ${action.coordinate?.[1]})`;
    case "double_click":
      return `double-click at (${action.coordinate?.[0]}, ${action.coordinate?.[1]})`;
    case "type":
      return `type "${action.text?.slice(0, 30)}${(action.text?.length ?? 0) > 30 ? "..." : ""}"`;
    case "key":
      return `key "${action.text}"`;
    case "scroll":
      return `scroll ${action.scroll_direction} at (${action.coordinate?.[0]}, ${action.coordinate?.[1]})`;
    case "mouse_move":
      return `move to (${action.coordinate?.[0]}, ${action.coordinate?.[1]})`;
    default:
      return action.action;
  }
}

async function reportPhase(
  client: Anthropic,
  sessionLog: SessionLog
): Promise<WhiskerReport> {
  const { modelId } = MODEL_CONFIG[sessionLog.config.model];
  const systemPrompt = getReportSystemPrompt();
  const sessionSummary = buildSessionSummary(sessionLog);

  // Build content with text summary and screenshots
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  // Add text summary first
  content.push({
    type: "text",
    text: sessionSummary,
  });

  // Add screenshots (sample if too many)
  const steps = sessionLog.steps;
  let screenshotsToInclude: SessionStep[];

  if (steps.length <= MAX_SCREENSHOTS_FOR_ANALYSIS) {
    screenshotsToInclude = steps;
  } else {
    // Sample evenly: always include first and last, plus evenly spaced middle ones
    screenshotsToInclude = [steps[0]];
    const middleCount = MAX_SCREENSHOTS_FOR_ANALYSIS - 2;
    const interval = (steps.length - 2) / (middleCount + 1);
    for (let i = 1; i <= middleCount; i++) {
      const idx = Math.round(i * interval);
      if (idx > 0 && idx < steps.length - 1) {
        screenshotsToInclude.push(steps[idx]);
      }
    }
    screenshotsToInclude.push(steps[steps.length - 1]);
  }

  // Add each screenshot with label
  for (const step of screenshotsToInclude) {
    content.push({
      type: "text",
      text: `\n[Screenshot from Step ${step.stepNumber}: ${formatAction(step.action)}]`,
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: step.screenshotBase64,
      },
    });
  }

  content.push({
    type: "text",
    text: "\n\nPlease analyze the session log and screenshots above, then produce a structured JSON report of findings.",
  });

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude in report phase");
  }

  // Parse JSON - strip markdown fences if present
  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  let parsed: {
    summary: string;
    taskCompleted: boolean;
    taskCompletionNotes: string;
    findings: Finding[];
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `Failed to parse report JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    metadata: {
      task: sessionLog.config.task,
      url: sessionLog.config.url,
      persona: sessionLog.config.persona,
      timestamp: new Date(sessionLog.startTime).toISOString(),
      duration: sessionLog.endTime - sessionLog.startTime,
      totalSteps: sessionLog.steps.length,
      modelUsed: modelId,
    },
    summary: parsed.summary,
    findings: parsed.findings || [],
    consoleErrors: sessionLog.consoleErrors,
    networkFailures: sessionLog.networkFailures,
    taskCompleted: parsed.taskCompleted,
    taskCompletionNotes: parsed.taskCompletionNotes,
  };
}

function buildSessionSummary(sessionLog: SessionLog): string {
  const parts: string[] = [];

  parts.push("# Usability Test Session Log");
  parts.push("");
  parts.push("## Test Configuration");
  parts.push(`- **Task:** ${sessionLog.config.task}`);
  parts.push(`- **URL:** ${sessionLog.config.url}`);
  if (sessionLog.config.persona) {
    parts.push(`- **Persona:** ${sessionLog.config.persona}`);
  }
  parts.push(
    `- **Duration:** ${((sessionLog.endTime - sessionLog.startTime) / 1000).toFixed(1)}s`
  );
  parts.push(`- **Total Steps:** ${sessionLog.steps.length}`);
  parts.push("");

  parts.push("## Tester Observations");
  parts.push(
    "(These are the tester's think-aloud comments during navigation)"
  );
  parts.push("");
  for (const obs of sessionLog.observations) {
    parts.push(obs);
    parts.push("");
  }

  parts.push("## Actions Taken");
  for (const step of sessionLog.steps) {
    const actionDesc = formatAction(step.action);
    let stepLine = `${step.stepNumber}. ${actionDesc}`;
    if (step.pageUrl) {
      stepLine += ` [Page: ${step.pageUrl}]`;
    }
    if (step.elementContext) {
      const ec = step.elementContext;
      stepLine += ` [Element: ${ec.selector}`;
      if (ec.text) {
        stepLine += ` "${ec.text.substring(0, 50)}${ec.text.length > 50 ? '...' : ''}"`;
      }
      stepLine += `]`;
    }
    parts.push(stepLine);
  }
  parts.push("");

  if (sessionLog.consoleErrors.length > 0) {
    parts.push("## Console Errors Detected");
    for (const err of sessionLog.consoleErrors) {
      parts.push(`- ${err}`);
    }
    parts.push("");
  }

  if (sessionLog.networkFailures.length > 0) {
    parts.push("## Network Failures Detected");
    for (const fail of sessionLog.networkFailures) {
      parts.push(
        `- ${fail.method} ${fail.url} → ${fail.status} ${fail.statusText}`
      );
    }
    parts.push("");
  }

  parts.push("---");
  parts.push(
    "Please analyze this session and produce a structured JSON report of findings."
  );

  return parts.join("\n");
}
