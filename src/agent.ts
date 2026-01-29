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
} from "./types.js";
import { printTestStart, startSpinner, stopSpinner, startWaitingSpinner, clearSpinner, printStepComplete } from "./ui.js";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_SCREENSHOTS_FOR_ANALYSIS = 10; // Limit screenshots sent to analysis phase
const BETA_FLAG = "computer-use-2025-01-24";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

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
    stopSpinner(`Browser ready at ${config.url}`);

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
  const startTime = Date.now();
  const steps: SessionStep[] = [];
  const observations: string[] = [];

  const computerTool: Anthropic.Beta.Messages.BetaToolComputerUse20250124 = {
    type: "computer_20250124",
    name: "computer",
    display_width_px: config.viewport.width,
    display_height_px: config.viewport.height,
    display_number: 1,
  };

  const systemPrompt = getNavigationSystemPrompt(config);
  const messages: BetaMessageParam[] = [
    {
      role: "user",
      content: `Please begin the usability test. The browser is already open to ${config.url}. Complete this task: ${config.task}`,
    },
  ];

  let stepCount = 0;

  while (stepCount < config.maxSteps) {
    // Show waiting spinner while waiting for API response
    startWaitingSpinner();

    let response: BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: [computerTool],
        messages,
        betas: [BETA_FLAG],
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
    let currentThinking = "";

    // First pass: collect thinking text
    for (const block of response.content) {
      if (block.type === "text") {
        observations.push(block.text);
        currentThinking += block.text + " ";
      }
    }

    // Second pass: process tool uses with the collected thinking
    for (const block of response.content) {
      if (block.type === "tool_use") {
        hasToolUse = true;
        stepCount++;
        const action = block.input as ComputerAction;
        const actionDesc = formatAction(action);

        // Show spinner while executing
        startSpinner(`Step ${stepCount}: ${actionDesc}`);

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

        // Take screenshot after action
        const screenshotBase64 = await browser.takeScreenshot();

        // Print completed step
        stopSpinner(`Step ${stepCount}: ${actionDesc}`);

        steps.push({
          stepNumber: stepCount,
          action,
          screenshotBase64,
          timestamp: Date.now(),
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
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
        media_type: "image/png",
        data: step.screenshotBase64,
      },
    });
  }

  content.push({
    type: "text",
    text: "\n\nPlease analyze the session log and screenshots above, then produce a structured JSON report of findings.",
  });

  const response = await client.messages.create({
    model: MODEL,
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
      modelUsed: MODEL,
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
    parts.push(`${step.stepNumber}. ${actionDesc}`);
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
