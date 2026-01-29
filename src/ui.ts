// ANSI color codes - no dependencies needed
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Bright colors
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
};

const c = colors;

// Braille dots spinner frames
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;

// Cool cat ASCII art
const CAT_NORMAL = [
  ` _._     _,-'"\"\`-._`,
  `(,-.\`._,'(       |\\\`-/|`,
  `    \`-.-' \\ )-\`( , o o)`,
  `          \`-    \\\`_\`"'-`,
];

// Box width
const BOX_WIDTH = 70;

// Section divider - dotted line same width as box
const DIVIDER = `${c.dim}${"· ".repeat(35)}${c.reset}`;

// In-box divider (fits inside the box borders)
const BOX_DIVIDER = `· `.repeat(33);

export function printConfig(
  task: string,
  url: string,
  version: string,
  persona?: string,
  maxSteps?: number,
  viewport?: string,
): void {
  const displayVersion = version.startsWith("v") ? version : `v${version}`;

  console.log("");

  // Top border
  console.log(`${c.dim}╭${"─".repeat(BOX_WIDTH - 2)}╮${c.reset}`);
  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  // Title
  const title = "WHISKER";
  const titleLine = `  ${c.brightWhite}${c.bold}${title}${c.reset} ${c.dim}${displayVersion}${c.reset}`;
  const titlePadding = BOX_WIDTH - 2 - 2 - title.length - 1 - displayVersion.length;
  console.log(
    `${c.dim}│${c.reset}${titleLine}${" ".repeat(titlePadding)}${c.dim}│${c.reset}`,
  );

  // Subtitle
  const subtitle = "AI-Powered Usability Testing";
  const subtitlePadding = BOX_WIDTH - 4 - subtitle.length;
  console.log(
    `${c.dim}│${c.reset}  ${c.dim}${subtitle}${c.reset}${" ".repeat(subtitlePadding)}${c.dim}│${c.reset}`,
  );

  // Extra blank line before cat
  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );
  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  // Cat
  for (const line of CAT_NORMAL) {
    const rightPadding = BOX_WIDTH - 4 - line.length;
    console.log(
      `${c.dim}│${c.reset}  ${c.white}${line}${c.reset}${" ".repeat(Math.max(0, rightPadding))}${c.dim}│${c.reset}`,
    );
  }

  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  // Dotted divider inside box
  const dividerPadding = BOX_WIDTH - 4 - BOX_DIVIDER.length;
  console.log(
    `${c.dim}│${c.reset}  ${c.dim}${BOX_DIVIDER}${c.reset}${" ".repeat(Math.max(0, dividerPadding))}${c.dim}│${c.reset}`,
  );

  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  // Config items (no title)
  const printConfigLine = (label: string, value: string) => {
    const labelPad = 12 - label.length; // Space between label: and value
    const maxValueLen = BOX_WIDTH - 4 - label.length - 1 - labelPad; // Available space for value

    let displayValue = value;
    if (value.length > maxValueLen) {
      displayValue = value.slice(0, maxValueLen - 3) + "...";
    }

    const visibleLen = 2 + label.length + 1 + labelPad + displayValue.length;
    const rightPad = BOX_WIDTH - 2 - visibleLen;

    console.log(
      `${c.dim}│${c.reset}  ${c.dim}${label}:${c.reset}${" ".repeat(labelPad)}${c.white}${displayValue}${c.reset}${" ".repeat(Math.max(0, rightPad))}${c.dim}│${c.reset}`,
    );
  };

  printConfigLine("Task", task);
  printConfigLine("URL", url);
  if (persona) {
    printConfigLine("Persona", persona);
  }
  if (maxSteps) {
    printConfigLine("Max steps", String(maxSteps));
  }
  if (viewport) {
    printConfigLine("Viewport", viewport);
  }

  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );
  console.log(`${c.dim}╰${"─".repeat(BOX_WIDTH - 2)}╯${c.reset}`);
  console.log("");
  console.log("");
  console.log(DIVIDER);
  console.log("");
  console.log("");
}

export function printTestStart(): void {
  console.log(`${c.brightWhite}${c.bold}Running Test${c.reset}`);
  console.log("");
}

// Start spinner with a message
export function startSpinner(message: string): void {
  stopSpinnerSilent(); // Clear any existing spinner without printing
  spinnerFrame = 0;
  const paddedMessage = message.padEnd(70); // Pad to ensure we overwrite old content
  process.stdout.write(
    `${c.dim}${SPINNER_FRAMES[spinnerFrame]} ${paddedMessage}${c.reset}`,
  );
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    process.stdout.write(
      `\r${c.dim}${SPINNER_FRAMES[spinnerFrame]} ${paddedMessage}${c.reset}`,
    );
  }, 80);
}

// Stop spinner silently (no output)
function stopSpinnerSilent(): void {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
}

// Stop spinner and show completion
export function stopSpinner(completedMessage?: string): void {
  stopSpinnerSilent();
  if (completedMessage) {
    const paddedMessage = completedMessage.padEnd(70); // Pad to overwrite spinner text
    process.stdout.write(
      `\r${c.brightWhite}✓${c.reset} ${c.dim}${paddedMessage}${c.reset}\n`,
    );
  } else {
    process.stdout.write(`\r\x1b[K`); // Just clear the line
  }
}

// Clear current spinner line without completion message
export function clearSpinner(): void {
  stopSpinnerSilent();
  process.stdout.write(`\r\x1b[K`); // Clear the line
}

// Show waiting spinner (no message, just spinner)
export function startWaitingSpinner(): void {
  stopSpinnerSilent();
  spinnerFrame = 0;
  process.stdout.write(`${c.dim}${SPINNER_FRAMES[spinnerFrame]}${c.reset}`);
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r${c.dim}${SPINNER_FRAMES[spinnerFrame]}${c.reset}`);
  }, 80);
}

export function printStep(message: string): void {
  console.log(`${c.dim}${message}${c.reset}`);
}

export function printStepComplete(message: string): void {
  console.log(`${c.brightWhite}✓${c.reset} ${c.dim}${message}${c.reset}`);
}

// Keep for compatibility
export function printPhaseStart(phase: string): void {
  console.log(`${c.brightWhite}${c.bold}${phase}${c.reset}`);
  console.log("");
}

export function printPhaseComplete(phase: string): void {
  console.log(`${c.dim}${phase} complete${c.reset}`);
}

export function printThinking(text: string): void {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.log(`${c.dim}${line.trim()}${c.reset}`);
    }
  }
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxWidth) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine =
        word.length > maxWidth ? word.slice(0, maxWidth - 3) + "..." : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function printResults(
  taskCompleted: boolean,
  summary: string,
  findings: Array<{
    severity: string;
    id: string;
    title: string;
    description: string;
  }>,
  outputDir: string,
): void {
  console.log("");
  console.log("");
  console.log(DIVIDER);
  console.log("");
  console.log("");

  // Task status in a box with summary - no cat
  const innerWidth = BOX_WIDTH - 6; // Account for border and padding (│  content  │)
  const statusText = taskCompleted ? "TASK COMPLETED" : "TASK NOT COMPLETED";
  const statusColor = taskCompleted ? c.brightWhite : c.red;

  // Top border
  console.log(`${c.dim}╭${"─".repeat(BOX_WIDTH - 2)}╮${c.reset}`);

  // Empty line
  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  // Status text left aligned with padding
  const statusLine = `  ${statusColor}${c.bold}${statusText}${c.reset}`;
  const statusPadding = BOX_WIDTH - 2 - 2 - statusText.length;
  console.log(
    `${c.dim}│${c.reset}${statusLine}${" ".repeat(statusPadding)}${c.dim}│${c.reset}`,
  );

  // Empty line
  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  // Summary text wrapped and left aligned
  const summaryLines = wrapText(summary, innerWidth);
  for (const line of summaryLines) {
    const rightPad = BOX_WIDTH - 4 - line.length;
    console.log(
      `${c.dim}│${c.reset}  ${c.dim}${line}${c.reset}${" ".repeat(Math.max(0, rightPad))}${c.dim}│${c.reset}`,
    );
  }

  // Empty line
  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  // Bottom border
  console.log(`${c.dim}╰${"─".repeat(BOX_WIDTH - 2)}╯${c.reset}`);

  console.log("");
  console.log("");

  // Findings
  console.log(DIVIDER);
  console.log("");
  console.log("");

  if (findings.length > 0) {
    console.log(`${c.brightWhite}${c.bold}FINDINGS${c.reset}`);
    console.log("");

    for (const finding of findings) {
      const label = severityLabel(finding.severity);

      console.log(
        `${label} ${c.white}${c.bold}${finding.id}:${c.reset} ${c.white}${finding.title}${c.reset}`,
      );
      console.log(`${c.dim}${finding.description}${c.reset}`);
      console.log("");
    }
  } else {
    console.log(`${c.brightWhite}${c.bold}FINDINGS${c.reset}`);
    console.log("");
    console.log(`${c.dim}No issues found${c.reset}`);
    console.log("");
  }

  // Output files
  console.log("");
  console.log(DIVIDER);
  console.log("");
  console.log("");
  console.log(`${c.brightWhite}${c.bold}OUTPUT FILES${c.reset}`);
  console.log("");
  console.log(`${c.dim}Report:${c.reset}      ${outputDir}/report.md`);
  console.log(`${c.dim}JSON:${c.reset}        ${outputDir}/report.json`);
  console.log(`${c.dim}Screenshots:${c.reset} ${outputDir}/screenshots/`);
  console.log("");
  console.log(`${c.dim}Tip: Cmd/Ctrl+click to open files${c.reset}`);
  console.log(`${c.dim}AI agents: Read report.json for structured findings${c.reset}`);
  console.log("");
}

export function printError(message: string): void {
  stopSpinnerSilent(); // Make sure spinner is stopped
  console.log("");

  const innerWidth = BOX_WIDTH - 6;

  console.log(`${c.dim}╭${"─".repeat(BOX_WIDTH - 2)}╮${c.reset}`);
  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  const errorText = "ERROR";
  const errorLine = `  ${c.red}${c.bold}${errorText}${c.reset}`;
  const errorPadding = BOX_WIDTH - 2 - 2 - errorText.length;
  console.log(
    `${c.dim}│${c.reset}${errorLine}${" ".repeat(errorPadding)}${c.dim}│${c.reset}`,
  );

  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  for (const line of CAT_NORMAL) {
    const rightPadding = BOX_WIDTH - 4 - line.length;
    console.log(
      `${c.dim}│${c.reset}  ${c.white}${line}${c.reset}${" ".repeat(Math.max(0, rightPadding))}${c.dim}│${c.reset}`,
    );
  }

  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );

  const msgLines = wrapText(message, innerWidth);
  for (const line of msgLines) {
    const rightPad = BOX_WIDTH - 4 - line.length;
    console.log(
      `${c.dim}│${c.reset}  ${c.red}${line}${c.reset}${" ".repeat(Math.max(0, rightPad))}${c.dim}│${c.reset}`,
    );
  }

  console.log(
    `${c.dim}│${c.reset}${" ".repeat(BOX_WIDTH - 2)}${c.dim}│${c.reset}`,
  );
  console.log(`${c.dim}╰${"─".repeat(BOX_WIDTH - 2)}╯${c.reset}`);
  console.log("");
}

function severityLabel(severity: string): string {
  switch (severity) {
    case "critical":
      return `${c.red}[P0]${c.reset}`;
    case "major":
      return `${c.yellow}[P1]${c.reset}`;
    case "minor":
      return `${c.magenta}[P2]${c.reset}`;
    case "suggestion":
      return `${c.dim}[P3]${c.reset}`;
    default:
      return `${c.dim}[${severity.toUpperCase()}]${c.reset}`;
  }
}

export function printLoginPrompt(): void {
  console.log("");
  console.log(`${c.brightYellow}${c.bold}Manual Login Required${c.reset}`);
  console.log(`${c.dim}Log in to the site in the browser window.${c.reset}`);
  console.log(`${c.dim}Press Enter when ready to continue...${c.reset}`);
}

export function printLoginComplete(): void {
  console.log(`${c.brightWhite}✓${c.reset} ${c.dim}Login complete, AI taking over${c.reset}`);
  console.log("");
}

export async function waitForEnterKey(): Promise<void> {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}
