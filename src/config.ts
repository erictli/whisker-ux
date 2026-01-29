import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";

const CONFIG_DIR = path.join(os.homedir(), ".config", "whisker");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface WhiskerGlobalConfig {
  anthropicApiKey?: string;
}

export function getApiKey(): string | undefined {
  // Environment variable takes precedence
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Try reading from config file
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
  }

  const apiKey = await question("Enter your Anthropic API key: ");
  rl.close();

  if (!apiKey.trim()) {
    console.log("No key provided. Setup cancelled.");
    return;
  }

  if (!apiKey.startsWith("sk-ant-")) {
    console.log("Warning: Key doesn't look like an Anthropic API key (should start with sk-ant-)");
  }

  saveApiKey(apiKey.trim());
  console.log("");
  console.log(`API key saved to ${CONFIG_FILE}`);
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
