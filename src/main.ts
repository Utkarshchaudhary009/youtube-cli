import { CliError, formatError } from "./lib/errors.ts";
import { parseArgs } from "./lib/args.ts";
import { getCommand, getCommandNames, registerCommand } from "./commands/registry.ts";
import "./commands/transcript.ts";

const VERSION = "0.1.0";

registerCommand("help", {
  description: "Show help for all commands",
  usage: "yt help [command]",
  run: async (args) => {
    const [topic] = args;
    if (topic) {
      const cmd = getCommand(topic);
      if (!cmd) throw new CliError("UNKNOWN_COMMAND", `Unknown command: ${topic}. Run 'yt help' to list commands.`);
      console.log(`Usage: ${cmd.usage}\n\n  ${cmd.description}`);
      return;
    }
    console.log(`yt — agent-first YouTube CLI

Usage: yt <command> [args] [--json]

Commands:
${getCommandNames()
  .map((name) => `  ${name.padEnd(14)}${getCommand(name)!.description}`)
  .join("\n")}

Options:
  --json    Machine-readable output on every command
  --help    Show help for a command

Run 'yt help <command>' for details.`);
  },
});

export async function main(argv: string[]): Promise<void> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h") {
    await getCommand("help")!.run([]);
    return;
  }
  if (name === "--version" || name === "-v") {
    console.log(VERSION);
    return;
  }

  const cmd = getCommand(name);
  if (!cmd) {
    throw new CliError("UNKNOWN_COMMAND", `Unknown command: ${name}. Run 'yt help' to list commands.`);
  }

  const parsed = parseArgs(rest, ["help", "json", "plain", "verbose"]);
  if (parsed.flags["help"]) {
    console.log(`Usage: ${cmd.usage}\n\n  ${cmd.description}`);
    return;
  }
  await cmd.run(rest);
}

// Direct execution (bun run src/main.ts / global bin)
if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    const json = process.argv.includes("--json");
    console.error(formatError(err, json));
    process.exit(err instanceof CliError ? err.exitCode : 1);
  }
}
