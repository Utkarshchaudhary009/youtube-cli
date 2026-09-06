export interface Command {
  description: string;
  usage: string;
  run: (argv: string[]) => Promise<void>;
}

const commands: Record<string, Command> = {};

export function registerCommand(name: string, command: Command): void {
  commands[name] = command;
}

export function getCommand(name: string): Command | undefined {
  return commands[name];
}

export function getCommandNames(): string[] {
  return Object.keys(commands);
}
