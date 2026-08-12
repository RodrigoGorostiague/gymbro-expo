export class AsyncTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms.`);
    this.name = 'AsyncTimeoutError';
  }
}

/**
 * Bounds UI-owned remote work. It deliberately does not cancel the underlying
 * request: callers must preserve their idempotency key when they offer retry.
 */
export function withTimeout<T>(operation: PromiseLike<T> | T, timeoutMs: number, name = 'Operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AsyncTimeoutError(name, timeoutMs)), timeoutMs);
    Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
