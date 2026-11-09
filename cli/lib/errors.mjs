/** An error the CLI prints as one line, without a stack trace. exitCode: 1 tool, 2 usage, 3 auth. */
export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}
