# Whisker

AI-powered usability testing CLI using Claude's computer use capability.

## Project Structure

```
src/
├── cli.ts       # CLI entry point (commander)
├── agent.ts     # Core logic: navigation + report phases
├── browser.ts   # Playwright browser management
├── config.ts    # API key loading (.env, global config)
├── prompts.ts   # System prompts for Claude
├── report.ts    # Report generation (markdown + JSON)
├── types.ts     # TypeScript interfaces
├── ui.ts        # Terminal output (spinners, colors)
└── index.ts     # Public API exports
```

## Tech Stack

- **Runtime**: Node.js 18+, ESM modules
- **Language**: TypeScript (strict mode)
- **Browser**: Playwright (Chromium)
- **AI**: Anthropic SDK with computer use beta
- **CLI**: Commander.js

## Key Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Run with tsx (no build needed)
npx tsx src/cli.ts # Run directly during development
```

## Architecture

The tool runs in two phases:

1. **Navigation Phase** (`agent.ts:navigationPhase`)
   - Uses Claude computer use to navigate the site
   - Captures screenshots after each action
   - Collects think-aloud observations

2. **Report Phase** (`agent.ts:reportPhase`)
   - Sends session log + screenshots to Claude
   - Gets structured JSON findings
   - Writes markdown and JSON reports

## API Key Priority

Checked in order (see `config.ts:getApiKey`):
1. `ANTHROPIC_API_KEY` env var
2. `.env.local` in cwd
3. `.env` in cwd
4. `~/.config/whisker/config.json`

## Testing Locally

```bash
# Build first
npm run build

# Run a test (needs API key)
./dist/cli.js "Find the login page" --url https://example.com
```

## Publishing

```bash
npm version patch  # or minor/major
npm publish
```

Package name on npm: `whisker-ux`
