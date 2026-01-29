# Whisker

AI-powered usability testing CLI. Whisker uses Claude's computer use capability to navigate your website like a real user, identifying UX issues, bugs, and accessibility problems.

```
╭────────────────────────────────────────────────────────────────────╮
│                                                                    │
│  WHISKER v0.1.0                                                    │
│  AI-Powered Usability Testing                                      │
│                                                                    │
│   _._     _,-'""`-._                                               │
│  (,-.`._,'(       |`-/|                                            │
│      `-.-' \ )-`( , o o)                                           │
│            `-    \`_`"'-                                           │
│                                                                    │
╰────────────────────────────────────────────────────────────────────╯
```

## How It Works

1. **Launch**: Opens a visible Chromium browser at your URL
2. **Navigate**: Claude sees the screen and decides what actions to take (click, type, scroll)
3. **Think Aloud**: Claude narrates its thought process, noting confusion or issues
4. **Capture**: Screenshots are taken after each action
5. **Analyze**: Claude reviews the session to identify UX issues, bugs, and accessibility problems
6. **Report**: Generates detailed findings with severity levels, reproduction steps, and suggested fixes

## Quick Start

### 1. Install Whisker

```bash
npm install -g whisker-ux
```

### 2. Get Your API Key

Get an Anthropic API key from: https://console.anthropic.com/settings/keys

### 3. Set Up Your Key

**Option A: Interactive setup (recommended)**
```bash
whisker setup
```

**Option B: Create a .env file**
```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env
```

**Option C: Environment variable**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 4. Run a Test

```bash
whisker "Find the pricing page" --url https://your-site.com
```

### 5. View Results

Open `.whisker/report.md` to see the findings.

---

## Run Without Installing (npx)

If you prefer not to install globally:

```bash
# Set your API key first (choose one method from Step 3 above)
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Run with npx
npx whisker-ux "Find the pricing page" --url https://your-site.com
```

## Usage

```bash
whisker <task> --url <url> [options]
```

### Arguments

- `<task>` - The task to complete (e.g., "Sign up for an account", "Find the pricing page")

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-u, --url <url>` | URL of the site to test (required) | - |
| `-p, --persona <persona>` | Persona description for the tester | - |
| `-m, --max-steps <number>` | Maximum navigation steps | 50 |
| `-v, --viewport <WxH>` | Viewport size | 1280x800 |
| `-o, --output <dir>` | Output directory | .whisker |

### Examples

**Basic test:**
```bash
whisker "Find the contact page" --url https://example.com
```

**With persona:**
```bash
whisker "Complete the checkout flow" \
  --url http://localhost:3000 \
  --persona "First-time user, not tech-savvy, age 65"
```

**Custom viewport (mobile):**
```bash
whisker "Navigate to settings" \
  --url https://myapp.com \
  --viewport 375x667
```

**Limit steps:**
```bash
whisker "Find pricing information" \
  --url https://startup.com \
  --max-steps 10
```

## Output

Whisker generates a report with task completion status, a summary, and detailed findings organized by severity (P0-P3). Each finding includes reproduction steps, screenshot references, and suggested fixes.

```
.whisker/
├── report.md           # Human-readable findings report
├── report.json         # Structured JSON for automation
└── screenshots/
    ├── step-001.png
    ├── step-002.png
    └── ...
```

## Commands

### `whisker setup`

Configure your Anthropic API key interactively.

### `whisker logout`

Remove your stored API key.

### `whisker run <task>` (default)

Run a usability test. This is the default command.

## Configuration

### API Key

Whisker looks for your Anthropic API key in this order:

1. `ANTHROPIC_API_KEY` environment variable
2. `.env.local` file in current directory (for local overrides)
3. `.env` file in current directory
4. `~/.config/whisker/config.json` (set via `whisker setup`)

### Requirements

- Node.js 18+
- Anthropic API key with access to Claude's computer use capability

## Programmatic Usage

```typescript
import { runSession, writeReport, WhiskerConfig } from 'whisker-ux';

const config: WhiskerConfig = {
  task: "Sign up for an account",
  url: "https://example.com",
  maxSteps: 50,
  viewport: { width: 1280, height: 800 },
  outputDir: ".whisker"
};

const { report, sessionLog } = await runSession(config);
await writeReport(report, sessionLog, config.outputDir);

console.log(`Task completed: ${report.taskCompleted}`);
console.log(`Found ${report.findings.length} issues`);
```

## Troubleshooting

### "No Anthropic API key configured"

Run `whisker setup` or set the `ANTHROPIC_API_KEY` environment variable.

### Playwright browser issues

Whisker uses Playwright's Chromium. If you encounter browser issues:

```bash
npx playwright install chromium
```

### Rate limiting

If you hit API rate limits, reduce `--max-steps` or wait before retrying.

### Browser not visible

The browser window should appear during testing. If it doesn't, ensure you're not running in a headless environment.

## License

MIT

## Contributing

Issues and pull requests welcome at [github.com/ericli/whisker-ux](https://github.com/ericli/whisker-ux).
