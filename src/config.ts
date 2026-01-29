import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";

const CONFIG_DIR = path.join(os.homedir(), ".config", "whisker");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const AUTH_DIR = path.join(CONFIG_DIR, "auth");

interface WhiskerGlobalConfig {
  anthropicApiKey?: string;
}

// Load API key from .env files in current directory
// Checks .env.local first (for local overrides), then .env
function loadFromEnvFile(): string | undefined {
  const cwd = process.cwd();
  const envFiles = [".env.local", ".env"];

  for (const filename of envFiles) {
    const envPath = path.join(cwd, filename);
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        // Match ANTHROPIC_API_KEY=value with:
        // - Optional leading whitespace
        // - Optional "export" keyword
        // - Optional spaces around "="
        // - Optional quotes around value
        const match = content.match(
          /^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*["']?([^"'\n]+?)["']?\s*$/m
        );
        if (match?.[1]?.trim()) {
          return match[1].trim();
        }
      }
    } catch {
      // Ignore errors reading this file, try next
    }
  }
  return undefined;
}

export function getApiKey(): string | undefined {
  // 1. Environment variable takes precedence
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // 2. Try .env file in current directory
  const envKey = loadFromEnvFile();
  if (envKey) {
    return envKey;
  }

  // 3. Try global config file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      const config: WhiskerGlobalConfig = JSON.parse(content);
      return config.anthropicApiKey;
    }
  } catch {
    // Ignore errors reading config
  }

  return undefined;
}

export function saveApiKey(apiKey: string): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  let config: WhiskerGlobalConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      config = JSON.parse(content);
    }
  } catch {
    // Start fresh if config is corrupted
  }

  config.anthropicApiKey = apiKey;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_FILE, 0o600); // Read/write only for owner
}

export function saveApiKeyToEnvFile(apiKey: string): void {
  const envPath = path.join(process.cwd(), ".env");
  let content = "";

  // Read existing .env content if it exists
  try {
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
      // Remove existing ANTHROPIC_API_KEY line if present (with optional export prefix)
      content = content.replace(/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=.*\n?/m, "");
    }
  } catch {
    // Start fresh
  }

  // Add the API key
  const newLine = `ANTHROPIC_API_KEY=${apiKey}\n`;
  content = content.trim() ? content.trim() + "\n" + newLine : newLine;

  fs.writeFileSync(envPath, content);

  // Set secure permissions (read/write only for owner)
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // Ignore errors on platforms that don't support POSIX permissions
  }
}

export async function runSetup(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log("");
  console.log("Whisker Setup");
  console.log("─────────────");
  console.log("");
  console.log("Whisker needs an Anthropic API key to use Claude for testing.");
  console.log("Get one at: https://console.anthropic.com/settings/keys");
  console.log("");

  const existingKey = getApiKey();
  if (existingKey) {
    console.log(`Current key: ${existingKey.slice(0, 12)}...${existingKey.slice(-4)}`);
    const overwrite = await question("Replace existing key? (y/N): ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("Setup cancelled.");
      rl.close();
      return;
    }
    console.log("");
  }

  const apiKey = await question("Enter your Anthropic API key: ");

  if (!apiKey.trim()) {
    console.log("No key provided. Setup cancelled.");
    rl.close();
    return;
  }

  if (!apiKey.startsWith("sk-ant-")) {
    console.log("Warning: Key doesn't look like an Anthropic API key (should start with sk-ant-)");
    console.log("");
  }

  // Ask where to save
  console.log("");
  console.log("Where should I save the key?");
  console.log("  1. .env file in current directory (good for this project only)");
  console.log(`  2. Global config at ${CONFIG_FILE} (works everywhere)`);
  console.log("");
  const saveChoice = (await question("Choice (1 or 2, default 2): ")).trim();
  rl.close();

  const trimmedKey = apiKey.trim();
  if (saveChoice === "1") {
    saveApiKeyToEnvFile(trimmedKey);
    console.log("");
    console.log("API key saved to .env file in current directory");
    console.log("Note: Add .env to your .gitignore to keep it secret!");
  } else {
    saveApiKey(trimmedKey);
    console.log("");
    console.log(`API key saved to ${CONFIG_FILE}`);
  }

  console.log("You're ready to use Whisker!");
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function deleteApiKey(): boolean {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      const config: WhiskerGlobalConfig = JSON.parse(content);

      if (config.anthropicApiKey) {
        delete config.anthropicApiKey;

        // If config is now empty, delete the file
        if (Object.keys(config).length === 0) {
          fs.unlinkSync(CONFIG_FILE);
        } else {
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        }
        return true;
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}

// Auth state management

export interface AuthStateInfo {
  name: string;
  savedAt: string;
  filePath: string;
}

export function getAuthStatePath(name: string): string {
  return path.join(AUTH_DIR, `${name}.json`);
}

export function authStateExists(name: string): boolean {
  return fs.existsSync(getAuthStatePath(name));
}

export function ensureAuthDir(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  // Set directory permissions (read/write/execute only for owner)
  try {
    fs.chmodSync(AUTH_DIR, 0o700);
  } catch {
    // Ignore on platforms that don't support POSIX permissions
  }
}

export function listAuthStates(): AuthStateInfo[] {
  const states: AuthStateInfo[] = [];

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      return states;
    }

    const files = fs.readdirSync(AUTH_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const name = file.slice(0, -5); // Remove .json extension
          const filePath = path.join(AUTH_DIR, file);
          const stat = fs.statSync(filePath);
          states.push({
            name,
            savedAt: stat.mtime.toISOString(),
            filePath,
          });
        } catch {
          // Skip files that can't be read (e.g., deleted between readdir and stat)
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }

  return states.sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteAuthState(name: string): boolean {
  try {
    const filePath = getAuthStatePath(name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

export function getAuthDir(): string {
  return AUTH_DIR;
}
