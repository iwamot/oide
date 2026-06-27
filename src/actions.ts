/**
 * Minimal GitHub Actions toolkit: read inputs and emit workflow commands
 * without pulling in `@actions/core` (and its dependency tree).
 */

/** Read an action input, mirroring `core.getInput` (env lookup + trim). */
export function getInput(name: string): string {
  return (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}

export function info(message: string): void {
  write(message);
}

export function notice(message: string): void {
  write(`::notice::${escapeData(message)}`);
}

export function warning(message: string): void {
  write(`::warning::${escapeData(message)}`);
}

export function setFailed(message: string): void {
  write(`::error::${escapeData(message)}`);
  process.exitCode = 1;
}

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
