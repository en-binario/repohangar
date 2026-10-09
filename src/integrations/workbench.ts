// The VS Code commands and notifications the integrations use, recorded for the integration tests.

import * as vscode from 'vscode';

export interface Notification {
  severity: 'information' | 'warning' | 'error';
  text: string;
  buttons: string[];
}

export class CommandRunner {
  /** Every command run while `record` is true (integration tests). */
  readonly executed: { command: string; args: unknown[] }[] = [];
  record = false;
  /** Commands replaced by a function (integration tests). */
  readonly overrides = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  async execute<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
    if (this.record) this.executed.push({ command, args });
    const override = this.overrides.get(command);
    if (override) return (await override(...args)) as T;
    return vscode.commands.executeCommand<T>(command, ...args);
  }

  getCommands(): Promise<string[]> {
    return Promise.resolve(vscode.commands.getCommands(true));
  }
}

export class Notifier {
  /** Every notification shown while `record` is true (integration tests). */
  readonly shown: Notification[] = [];
  record = false;
  /** Answers a notification instead of showing it (integration tests); returns the button to click. */
  answer: ((notification: Notification) => string | undefined) | undefined;

  async show(severity: Notification['severity'], text: string, ...buttons: string[]): Promise<string | undefined> {
    const notification = { severity, text, buttons };
    if (this.record) this.shown.push(notification);
    if (this.answer) return this.answer(notification);
    const show =
      severity === 'error'
        ? vscode.window.showErrorMessage
        : severity === 'warning'
          ? vscode.window.showWarningMessage
          : vscode.window.showInformationMessage;
    return show(text, ...buttons);
  }
}
