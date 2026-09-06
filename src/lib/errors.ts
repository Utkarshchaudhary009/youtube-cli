/** A user-facing CLI error: one actionable line, no stack trace. */
export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** Formats any thrown value for display; returns a one-liner for CliError. */
export function formatError(err: unknown, json: boolean): string {
  if (err instanceof CliError) {
    return json ? JSON.stringify({ error: { code: err.code, message: err.message } }, null, 2) : `error: ${err.message}`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return json
    ? JSON.stringify({ error: { code: "UNKNOWN", message } }, null, 2)
    : `error: ${message}`;
}
