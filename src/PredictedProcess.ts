import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'child_process';

const EXIT_CODE = 0;

interface handleAbortedSignalTriggeredDuringExecutionProps {
  signal?: AbortSignal;
  abortHandler: (event: any) => void;
}

export class PredictedProcess {
  private _childProcess: ChildProcess | null = null;
  private memoizedCache: { [key: string]: PredictedProcess } = {};

  public constructor(
    public readonly id: number,
    public readonly command: string,
  ) {}

  private handleAbortedSignal(): Promise<void> {
    return Promise.reject(
      new DOMException('Signal already aborted!', 'AbortError')
    );
  }

  private handleAbortedSignalTriggeredDuringExecution({ 
    signal, 
    abortHandler
  }: handleAbortedSignalTriggeredDuringExecutionProps): void {
    setTimeout(() => {
      signal?.removeEventListener('abort', abortHandler);
    }, 5000);

    signal?.addEventListener('abort', abortHandler);
  }

  buildCacheKey(signal?: AbortSignal): string {
    return `${this.id}_${signal?.aborted}`;
  }


  /**
   * Spawns and manages a child process to execute a given command, with handling for an optional AbortSignal.
   *
   * Expected behavior:
   * 1. No process should be initiated if a signal that has already been aborted is passed;
   *    instead, the function should reject immediately.
   * 2. The function should reject if the process terminates with an error or if the AbortSignal is triggered during execution.
   * 3. The function should resolve if the process terminates successfully.
   * 4. Regardless of the outcome (resolve or reject), the function should ensure cleanup of the child process and any linked event listeners.
   *
   * @example
   * ```ts
   * const signal = new AbortController().signal
   * const process = new PredictedProcess(1, 'sleep 5; echo "Hello, world!"')
   *
   * process.run(signal).then(() => {
   *   console.log('The process has exited successfully.')
   * }).catch(() => {
   *   console.log('The process has exited with an error.')
   * })
   *
   * signal.abort() // "Hello, world!" should not be printed.
   * ```
   */
  public async run(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return this.handleAbortedSignal();
    }
  
    const cacheKey = this.buildCacheKey(signal);
    if (cacheKey in this.memoizedCache) {
      return;
    }
  
    const promiseToSend = new Promise<void>((resolve, reject) => {
      function closeHandler(event: any) {
        if (event !== EXIT_CODE || !child) {
          return;
        }
  
        child.kill();
        child.removeAllListeners();
  
        return resolve();
      };
  
      function abortHandler(event: any) {
        return reject(
          new DOMException('Signal already aborted', 'AbortError')
        );
      };
  
      function errorHandler(error: any) {
        return reject(error);
      };
  
      const child = spawn(this.command);
      child.on('close', closeHandler);
      child.on('error', errorHandler);
  
      this.handleAbortedSignalTriggeredDuringExecution({
        signal,
        abortHandler,
      });
    }) as Promise<void>;
  
    this.memoizedCache[cacheKey] = this;
  
    try {
      await promiseToSend;
    } catch (error: any) {
      delete this.memoizedCache[cacheKey];
      throw new error;
    }
  }

  /**
   * Returns a memoized version of `PredictedProcess`.
   *
   * Expected behavior:
   * 1. If the `run` method was previously called with the same AbortSignal and completed without errors,
   *    subsequent calls with the same signal should return immediately, bypassing command re-execution.
   * 2. No process should be initiated if the AbortSignal is already aborted before invoking the `run` method.
   * 3. For concurrent invocations with the same AbortSignal, while `run` is in execution,
   *    these calls should await the ongoing process's completion.
   * 4. Results from executions of `run` that encounter errors or are aborted should not be stored in the memoization cache.
   *
   * Note: The uniqueness of a request is determined by the AbortSignal. Each distinct signal is considered a separate request.
   *
   * @example
   * ```ts
   * const process = new PredictedProcess(1, 'sleep 5; echo "Hello, world!"');
   * const memoizedProcess = process.memoize();
   *
   * const signal = new AbortController().signal;
   * memoizedProcess.run(signal).then(() => {
   *   console.log('The process has executed successfully.');
   * }).catch(() => {
   *   console.log('The process execution resulted in an error.');
   * });
   *
   * memoizedProcess.run(signal); // This call will return the cached result if the first call was successful.
   * ```
   */
  public memoize(): PredictedProcess {
    const cacheKey = `${this.id}_undefined`; // cacheKey is ID + signal.aborted

    if (cacheKey in this.memoizedCache) {
      return this.memoizedCache[cacheKey]
    }

    this.memoizedCache[cacheKey] = this;
    return this.memoizedCache[cacheKey];
  }
}
