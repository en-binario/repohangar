// The RepoHangar log output channel (design D-7), for failures that do not deserve a notification. Created at
// activation and shared.

import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class RepoHangarLog implements vscode.Disposable {
  readonly channel = vscode.window.createOutputChannel('RepoHangar', { log: true });
  /** Every line logged while `record` is true (integration tests). */
  readonly lines: { level: LogLevel; message: string }[] = [];
  record = false;

  debug(message: string): void {
    this.write('debug', message);
  }

  info(message: string): void {
    this.write('info', message);
  }

  warn(message: string): void {
    this.write('warn', message);
  }

  error(message: string): void {
    this.write('error', message);
  }

  private write(level: LogLevel, message: string): void {
    if (this.record) this.lines.push({ level, message });
    this.channel[level](message);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
