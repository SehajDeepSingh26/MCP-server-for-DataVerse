/**
 * Logger utility for MCP D365 Toolkit
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYWORDS = [
  "token",
  "secret",
  "password",
  "authorization",
  "apikey",
  "clientsecret",
];

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const level = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    this.logLevel = level || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  private sanitize(value: unknown, depth = 0): unknown {
    if (depth > 5) {
      return "[Truncated]";
    }

    if (typeof value === "string") {
      if (/^bearer\s+/i.test(value)) {
        return "[Redacted]";
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, depth + 1));
    }

    if (value && typeof value === "object") {
      const input = value as Record<string, unknown>;
      const output: Record<string, unknown> = {};

      for (const key of Object.keys(input)) {
        output[key] = this.isSensitiveKey(key)
          ? "[Redacted]"
          : this.sanitize(input[key], depth + 1);
      }

      return output;
    }

    return value;
  }

  private formatArgs(args: unknown[]): string {
    if (args.length === 0) {
      return "";
    }

    try {
      const sanitized = this.sanitize(args);
      const serialized = JSON.stringify(sanitized);
      const maxLength = 4000;
      const clipped =
        serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
      return ` ${clipped}`;
    } catch {
      return " [Unserializable log arguments]";
    }
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = this.formatArgs(args);
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.error(this.formatMessage("debug", message, ...args));
    }
  }

  // Info logs are often used for important operational messages, so we log them to stderr to ensure they are captured in environments that only capture stdout or stderr.
  info(message: string, ...args: any[]): void {
    if (this.shouldLog("info")) {
      console.error(this.formatMessage("info", message, ...args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog("warn")) {
      console.error(this.formatMessage("warn", message, ...args));
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, ...args));
    }
  }
}

export const logger = new Logger();
