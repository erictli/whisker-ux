// Model selection
export type ModelChoice = 'sonnet' | 'opus' | 'haiku';

export const MODEL_CONFIG: Record<ModelChoice, { modelId: string; betaFlag: string }> = {
  sonnet: { modelId: 'claude-sonnet-4-5-20250929', betaFlag: 'computer-use-2025-01-24' },
  opus: { modelId: 'claude-opus-4-5-20251101', betaFlag: 'computer-use-2025-11-24' },
  haiku: { modelId: 'claude-haiku-4-5-20251001', betaFlag: 'computer-use-2025-01-24' },
};

export interface WhiskerConfig {
  task: string;
  url: string;
  persona?: string;
  maxSteps: number;
  viewport: { width: number; height: number };
  outputDir: string;
  interactiveLogin?: boolean;
  authStateName?: string;
  screenshotWindow?: number; // Number of screenshots to keep in navigation context (default: 5)
  model: ModelChoice;
}

export interface ComputerAction {
  action: string;
  coordinate?: [number, number];
  start_coordinate?: [number, number];
  text?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
}

// Element context captured at click time
export interface ElementContext {
  tagName: string;
  text: string;
  selector: string;
  id?: string;
  className?: string;
}

export interface SessionStep {
  stepNumber: number;
  action: ComputerAction;
  screenshotBase64: string;
  timestamp: number;
  pageUrl: string;
  elementContext?: ElementContext;
}

export interface NetworkFailure {
  url: string;
  method: string;
  status: number;
  statusText: string;
  timestamp: number;
}

export interface SessionLog {
  config: WhiskerConfig;
  steps: SessionStep[];
  observations: string[];
  consoleErrors: string[];
  networkFailures: NetworkFailure[];
  startTime: number;
  endTime: number;
}

export interface Finding {
  id: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  category:
    | "bug"
    | "ux-friction"
    | "accessibility"
    | "performance"
    | "visual"
    | "copy";
  title: string;
  description: string;
  stepsToReproduce?: string[];
  screenshotStepNumber?: number;
  suggestedFix?: string;
  grepPatterns?: string[];
  pageUrl?: string;
  elementSelector?: string;
  elementText?: string;
}

export interface WhiskerReport {
  metadata: {
    task: string;
    url: string;
    persona?: string;
    timestamp: string;
    duration: number;
    totalSteps: number;
    modelUsed: string;
  };
  summary: string;
  findings: Finding[];
  consoleErrors: string[];
  networkFailures: NetworkFailure[];
  taskCompleted: boolean;
  taskCompletionNotes: string;
}
