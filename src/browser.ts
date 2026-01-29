import { chromium, Browser, Page, BrowserContext } from "playwright";
import { ComputerAction, NetworkFailure, WhiskerConfig } from "./types.js";

function mapKeyNames(key: string): string {
  const keyMap: Record<string, string> = {
    return: "Enter",
    enter: "Enter",
    ctrl: "Control",
    control: "Control",
    super: "Meta",
    cmd: "Meta",
    command: "Meta",
    alt: "Alt",
    shift: "Shift",
    tab: "Tab",
    escape: "Escape",
    esc: "Escape",
    backspace: "Backspace",
    delete: "Delete",
    space: " ",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    pageup: "PageUp",
    pagedown: "PageDown",
    page_up: "PageUp",
    page_down: "PageDown",
    home: "Home",
    end: "End",
  };

  return key
    .split("+")
    .map((part) => {
      const lower = part.trim().toLowerCase();
      return keyMap[lower] ?? part.trim();
    })
    .join("+");
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private consoleErrors: string[] = [];
  private networkFailures: NetworkFailure[] = [];

  constructor(private config: WhiskerConfig) {}

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      args: [
        `--window-size=${this.config.viewport.width},${this.config.viewport.height + 100}`,
      ],
    });

    this.context = await this.browser.newContext({
      viewport: {
        width: this.config.viewport.width,
        height: this.config.viewport.height,
      },
    });

    this.page = await this.context.newPage();

    // Capture console errors
    this.page.on("console", (msg) => {
      if (msg.type() === "error") {
        this.consoleErrors.push(`[${new Date().toISOString()}] ${msg.text()}`);
      }
    });

    // Capture unhandled page errors
    this.page.on("pageerror", (err) => {
      this.consoleErrors.push(
        `[${new Date().toISOString()}] Uncaught: ${err.message}`
      );
    });

    // Capture network failures (4xx/5xx)
    this.page.on("response", (response) => {
      if (response.status() >= 400) {
        this.networkFailures.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
          timestamp: Date.now(),
        });
      }
    });

    // Capture failed requests (network errors)
    this.page.on("requestfailed", (request) => {
      this.networkFailures.push({
        url: request.url(),
        method: request.method(),
        status: 0,
        statusText: request.failure()?.errorText ?? "Request failed",
        timestamp: Date.now(),
      });
    });

    // Handle popups - switch to new page
    this.context.on("page", (newPage) => {
      this.page = newPage;
      newPage.on("console", (msg) => {
        if (msg.type() === "error") {
          this.consoleErrors.push(
            `[${new Date().toISOString()}] ${msg.text()}`
          );
        }
      });
      newPage.on("pageerror", (err) => {
        this.consoleErrors.push(
          `[${new Date().toISOString()}] Uncaught: ${err.message}`
        );
      });
    });

    await this.page.goto(this.config.url, { waitUntil: "domcontentloaded" });
  }

  async takeScreenshot(): Promise<string> {
    if (!this.page) throw new Error("Browser not launched");
    const buffer = await this.page.screenshot({
      type: "png",
      fullPage: false,
    });
    return buffer.toString("base64");
  }

  async executeAction(action: ComputerAction): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    const page = this.page;

    switch (action.action) {
      case "screenshot":
        // No-op: screenshot is taken separately by the caller
        break;

      case "left_click":
        if (action.coordinate) {
          await page.mouse.click(action.coordinate[0], action.coordinate[1], {
            button: "left",
          });
        }
        break;

      case "right_click":
        if (action.coordinate) {
          await page.mouse.click(action.coordinate[0], action.coordinate[1], {
            button: "right",
          });
        }
        break;

      case "middle_click":
        if (action.coordinate) {
          await page.mouse.click(action.coordinate[0], action.coordinate[1], {
            button: "middle",
          });
        }
        break;

      case "double_click":
        if (action.coordinate) {
          await page.mouse.dblclick(
            action.coordinate[0],
            action.coordinate[1]
          );
        }
        break;

      case "triple_click":
        if (action.coordinate) {
          await page.mouse.click(action.coordinate[0], action.coordinate[1], {
            clickCount: 3,
          });
        }
        break;

      case "type":
        if (action.text) {
          await page.keyboard.type(action.text, { delay: 30 });
        }
        break;

      case "key":
        if (action.text) {
          const mapped = mapKeyNames(action.text);
          await page.keyboard.press(mapped);
        }
        break;

      case "mouse_move":
        if (action.coordinate) {
          await page.mouse.move(action.coordinate[0], action.coordinate[1]);
        }
        break;

      case "scroll":
        if (action.coordinate && action.scroll_direction) {
          await page.mouse.move(action.coordinate[0], action.coordinate[1]);
          const amount = (action.scroll_amount ?? 3) * 100;
          const deltaX =
            action.scroll_direction === "left"
              ? -amount
              : action.scroll_direction === "right"
                ? amount
                : 0;
          const deltaY =
            action.scroll_direction === "down"
              ? amount
              : action.scroll_direction === "up"
                ? -amount
                : 0;
          await page.mouse.wheel(deltaX, deltaY);
        }
        break;

      case "left_click_drag":
        if (action.coordinate) {
          const startX = action.start_coordinate?.[0] ?? 0;
          const startY = action.start_coordinate?.[1] ?? 0;
          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.mouse.move(action.coordinate[0], action.coordinate[1]);
          await page.mouse.up();
        }
        break;

      case "wait":
        await new Promise((resolve) => setTimeout(resolve, 2000));
        break;

      default:
        console.warn(`  Unknown action type: ${action.action}`);
    }

    // Brief pause after actions to let the page settle
    if (action.action !== "screenshot" && action.action !== "wait") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  getConsoleErrors(): string[] {
    return [...this.consoleErrors];
  }

  getNetworkFailures(): NetworkFailure[] {
    return [...this.networkFailures];
  }
}
