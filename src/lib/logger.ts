type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  verbose?: boolean;
}

class Logger {
  private verbose: boolean = false;

  constructor(options: LogOptions = {}) {
    this.verbose = options.verbose || false;
  }

  setVerbose(verbose: boolean) {
    this.verbose = verbose;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    emoji?: string,
  ): string {
    const timestamp = new Date().toISOString();
    return `${emoji || ''} [${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, emoji?: string) {
    if (this.verbose) {
      console.log(this.formatMessage('debug', message, emoji));
    }
  }

  info(message: string, emoji?: string) {
    console.log(this.formatMessage('info', message, emoji));
  }

  warn(message: string, emoji?: string) {
    console.warn(this.formatMessage('warn', message, emoji));
  }

  error(message: string, emoji?: string) {
    console.error(this.formatMessage('error', message, emoji));
  }
}

export const logger = new Logger();
