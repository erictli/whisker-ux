export interface WhiskerConfig {
  task: string;
  url: string;
  persona?: string;
  maxSteps: number;
  viewport: { width: number; height: number };
  outputDir: string;
}

export interface ComputerAction {
  action: string;
  coordinate?: [number, number];
  start_coordinate?: [number, number];
  text?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
}

export interface SessionStep {
  stepNumber: number;
  action: ComputerAction;
  screenshotBase64: string;
  timestamp: number;
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
