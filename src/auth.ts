import { chromium, BrowserContext } from "playwright";
import { getAuthStatePath, ensureAuthDir, authStateExists } from "./config.js";
import { printLoginPrompt, printLoginComplete, waitForEnterKey } from "./ui.js";
import * as fs from "node:fs";

interface AuthCaptureOptions {
  url: string;
  name: string;
  viewport?: { width: number; height: number };
}

export async function runAuthCapture(options: AuthCaptureOptions): Promise<void> {
  const { url, name, viewport = { width: 1280, height: 800 } } = options;

  // Check if auth state already exists
  if (authStateExists(name)) {
    throw new Error(
      `Auth state "${name}" already exists. Use "whisker auth delete ${name}" to remove it first.`
    );
  }

  console.log("");
  console.log(`Saving auth state as: ${name}`);
  console.log(`Opening: ${url}`);
  console.log("");

  const browser = await chromium.launch({
    headless: false,
    args: [`--window-size=${viewport.width},${viewport.height + 100}`],
  });

  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for user to log in
    printLoginPrompt();
    await waitForEnterKey();
    printLoginComplete();

    // Ensure auth directory exists with proper permissions
    ensureAuthDir();

    // Save storage state
    const authPath = getAuthStatePath(name);
    await context.storageState({ path: authPath });

    // Set file permissions (read/write only for owner)
    try {
      fs.chmodSync(authPath, 0o600);
    } catch {
      // Ignore on platforms that don't support POSIX permissions
    }

    console.log(`Auth state saved to: ${authPath}`);
    console.log("");
    console.log(`Use it with: whisker run "task" --url <url> --auth ${name}`);
  } finally {
    if (context) {
      await context.close();
    }
    await browser.close();
  }
}
