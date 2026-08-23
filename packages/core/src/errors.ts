export class GithubPageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "GithubPageError";
  }
}

export function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
