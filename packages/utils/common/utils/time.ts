/**
 * Custom error class representing an operation timeout.
 * This error is thrown when a Promise does not resolve within a specified time limit.
 *
 * @example
 * ```ts
 * try {
 *   await withTimeout(someLongRunningPromise(), 1000);
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.error('Operation took too long!');
 *   }
 * }
 * ```
 */
export class TimeoutError extends Error {
  /**
   * Creates an instance of TimeoutError.
   * @param message - An optional message describing the timeout error. Defaults to 'Operation timed out'.
   */
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
    // Maintain proper stack trace for the error.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Executes a promise and throws a TimeoutError if it does not resolve within the specified time.
 * This is a robust alternative to a timeout that resolves with a special value,
 * as it uses idiomatic error handling (`try...catch`).
 *
 * @template T The type of the promise's resolution value.
 * @param promise - The promise to execute.
 * @param ms - The timeout duration in milliseconds. If `ms` is 0 or negative, the original promise is returned without a timeout.
 * @returns A promise that resolves with the result of the input promise, or rejects with a `TimeoutError`.
 * @throws {TimeoutError} If the promise does not resolve within the specified time.
 *
 * @example
 * ```ts
 * import { withTimeout, TimeoutError } from '@talex-touch/utils';
 *
 * async function fetchDataWithTimeout() {
 *   try {
 *     const result = await withTimeout(fetch('https://api.example.com/data'), 3000); // 3-second timeout
 *     console.log('Data fetched:', await result.json());
 *   } catch (error) {
 *     if (error instanceof TimeoutError) {
 *       console.error('Fetch request timed out!');
 *     } else {
 *       console.error('Fetch failed:', error);
 *     }
 *   }
 * }
 *
 * fetchDataWithTimeout();
 * ```
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) {
    // If timeout is 0 or negative, return the original Promise without a timeout mechanism.
    return promise;
  }

  // Create a promise that rejects in <ms> milliseconds
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new TimeoutError(`Promise timed out after ${ms} ms`));
    }, ms);
  });

  // Race the input promise against the timeout promise
  return Promise.race([promise, timeout]);
}

/**
 * Represents a value that can either be a fixed type `T` or a function that dynamically
 * computes `T` based on the current attempt number.
 * @template T The type of the value.
 */
type DynamicValue<T> = T | ((attempt: number) => T);

/**
 * Defines a generic asynchronous function type that returns a Promise.
 * @template T The type of the Promise's resolution value.
 */
type AsyncFunction<T> = (...args: any[]) => Promise<T>;

/**
 * Defines the options for configuring the retrier behavior.
 */
export interface RetrierOptions {
  /**
   * The maximum number of retries.
   * - If a `number`, it represents the fixed number of retries (e.g., `2` means 1 initial attempt + 2 retries = total 3 attempts).
   * - If a `function`, it dynamically calculates the maximum retries based on the current attempt number (starting from 1).
   * @defaultValue 2 (meaning 1 initial attempt + 2 retries, total 3 attempts)
   */
  maxRetries?: DynamicValue<number>;
  /**
   * The timeout duration for each individual attempt in milliseconds.
   * - If a `number`, it represents a fixed timeout for each attempt.
   * - If a `function`, it dynamically calculates the timeout based on the current attempt number.
   * @defaultValue 5000 (5 seconds)
   */
  timeoutMs?: DynamicValue<number>;
  /**
   * Callback invoked at the beginning of each attempt.
   * @param attempt - The current attempt number (starts from 1).
   * @param error - The error from the previous attempt, if any (undefined for the first attempt).
   */
  onAttempt?: (attempt: number, error?: Error) => void;
  /**
   * Callback invoked upon successful completion of the operation.
   * @template T The type of the successful result.
   * @param result - The successful result of the operation.
   * @param attempt - The attempt number on which the operation succeeded.
   */
  onSuccess?: <T>(result: T, attempt: number) => void;
  /**
   * Callback invoked when all retries have been exhausted and the operation ultimately fails.
   * @param error - The final error that caused the operation to fail.
   * @param attempt - The total number of attempts made before final failure.
   */
  onFailure?: (error: Error, attempt: number) => void;
  /**
   * Callback invoked before initiating a retry, indicating that a retry will occur.
   * @param attempt - The attempt number that just failed and will lead to the next retry.
   * @param error - The error that caused the current attempt to fail.
   */
  onRetry?: (attempt: number, error: Error) => void;
  /**
   * Callback invoked when a single attempt times out. Note that this is a specific type of failure that leads to a retry.
   * @param attempt - The attempt number that timed out.
   * @param ms - The timeout duration (in milliseconds) that was set for this specific attempt.
   */
  onTimeout?: (attempt: number, ms: number) => void;
  /**
   * A predicate function that determines whether a given error should trigger a retry.
   * If this function returns `false`, the retrier will immediately stop and throw the error.
   * By default, all errors will trigger a retry (returns `true`).
   * @param error - The error that occurred.
   * @param attempt - The current attempt number.
   * @returns `true` if a retry should occur, `false` otherwise.
   */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Creates a retrier factory function that can wrap any asynchronous method
 * to add configurable retry logic with timeout and event callbacks.
 *
 * @param options - Configuration options for the retrier.
 * @returns A higher-order function. This returned function takes an asynchronous method
 *          and returns a new, wrapped async method with the specified retry logic.
 *
 * @example
 * ```ts
 * import { createRetrier, TimeoutError } from '@talex-touch/utils';
 *
 * // Example of a flaky asynchronous task
 * let globalCallCount = 0;
 * async function flakyApiCall(data: string): Promise<string> {
 *   globalCallCount++;
 *   console.log(`  [API] Attempt ${globalCallCount}: Calling API with ${data}...`);
 *   const delay = Math.random() * 1500 + 500; // 500ms to 2000ms
 *   await new Promise(resolve => setTimeout(resolve, delay));
 *
 *   if (globalCallCount < 3) { // Fail first 2 attempts
 *     throw new Error(`API failed on attempt ${globalCallCount}`);
 *   }
 *   console.log(`  [API] Attempt ${globalCallCount}: API call successful for ${data}!`);
 *   return `Data received: ${data} on attempt ${globalCallCount}`;
 * }
 *
 * async function runCustomRetrier() {
 *   console.log('\n--- Running Custom Retrier Example ---');
 *   globalCallCount = 0; // Reset for example
 *
 *   const myRetrier = createRetrier({
 *     maxRetries: 3, // Total 4 attempts
 *     timeoutMs: (attempt) => 1000 + (attempt * 500), // Increasing timeout: 1.5s, 2s, 2.5s, 3s
 *     onAttempt: (att, err) => console.log(`[Retrier] Attempt ${att} starting. Last err: ${err?.message || 'N/A'}`),
 *     onSuccess: (res, att) => console.log(`[Retrier] ✅ Success on attempt ${att}: ${res}`),
 *     onFailure: (err, att) => console.error(`[Retrier] ❌ Final failure after ${att} attempts: ${err.message}`),
 *     onRetry: (att, err) => console.warn(`[Retrier] 🔄 Retrying. Attempt ${att} failed with: ${err.message}`),
 *     onTimeout: (att, ms) => console.warn(`[Retrier] ⏰ Attempt ${att} timed out after ${ms}ms.`),
 *     shouldRetry: (error) => !(error instanceof TypeError), // Don't retry on TypeError
 *   });
 *
 *   const wrappedFlakyApiCall = myRetrier(flakyApiCall);
 *
 *   try {
 *     const result = await wrappedFlakyApiCall('item-X');
 *     console.log('Final Operation Result:', result);
 *   } catch (error: any) {
 *     console.error('Operation ultimately failed:', error.message);
 *     if (error instanceof TimeoutError) {
 *       console.error('Specifically: A timeout occurred.');
 *     }
 *   }
 * }
 *
 * runCustomRetrier();
 * ```
 */
export function createRetrier(options: RetrierOptions = {}) {
  const {
    maxRetries = 2, // Default: 2 retries (total 3 attempts)
    timeoutMs = 5000, // Default: 5 seconds timeout per attempt
    onAttempt,
    onSuccess,
    onFailure,
    onRetry,
    onTimeout,
    shouldRetry = () => true, // Default: retry on all errors
  } = options;

  /**
   * Resolves a DynamicValue to its concrete value for the given attempt.
   * @template T The type of the dynamic value.
   * @param value - The DynamicValue to resolve.
   * @param attempt - The current attempt number.
   * @returns The concrete value.
   */
  const resolveDynamicValue = <T_Val>(value: DynamicValue<T_Val>, attempt: number): T_Val => {
    return typeof value === 'function' ? (value as (attempt: number) => T_Val)(attempt) : value;
  };

  /**
   * A higher-order function that takes an asynchronous function and returns a new function
   * with retry capabilities applied.
   *
   * @template T The expected return type of the wrapped asynchronous function.
   * @template Func The type of the asynchronous function to be wrapped.
   * @param func - The original asynchronous function to be wrapped with retry logic.
   * @returns A new asynchronous function that, when called, executes the original function
   *          with retry attempts and timeout handling as configured.
   */
  return function <T, Func extends AsyncFunction<T>>(func: Func): ((...args: Parameters<Func>) => Promise<T>) {
    return async function (this: ThisParameterType<Func>, ...args: Parameters<Func>): Promise<T> {
      let currentAttempt = 0;
      let lastError: Error | undefined;

      // Resolve maxRetries once or dynamically per attempt based on DynamicValue type
      const calculatedMaxRetries = resolveDynamicValue(maxRetries, 1); // Calculate for the first attempt as starting point

      // Loop through attempts up to the maximum allowed retries
      while (currentAttempt <= calculatedMaxRetries) {
        currentAttempt++;
        onAttempt?.(currentAttempt, lastError); // Notify about current attempt, including previous error if any

        // Resolve timeoutMs dynamically for the current attempt
        const currentTimeoutMs = resolveDynamicValue(timeoutMs, currentAttempt);

        try {
          // Execute the original function with its original `this` context and arguments,
          // wrapped by the `withTimeout` utility.
          const result = await withTimeout(func.apply(this, args), currentTimeoutMs);
          onSuccess?.(result, currentAttempt); // Notify success
          return result; // Return the successful result
        } catch (error: any) {
          lastError = error; // Store the error for the next attempt's `onAttempt` callback

          // Notify if the specific error was a timeout
          if (error instanceof TimeoutError) {
            onTimeout?.(currentAttempt, currentTimeoutMs);
          } else {
            // console.warn(`Attempt ${currentAttempt} failed with error:`, error.message); // Example internal logging
          }

          // Determine if a retry should proceed based on the `shouldRetry` predicate and max attempts
          const shouldProceedRetry = shouldRetry(error, currentAttempt);

          if (!shouldProceedRetry || currentAttempt > calculatedMaxRetries) {
            onFailure?.(error, currentAttempt); // Notify final failure
            throw error; // Throw the error if no more retries or `shouldRetry` returns false
          }

          onRetry?.(currentAttempt, error); // Notify that a retry will occur
          // Optional: Add a delay here for exponential backoff or other retry strategies.
          // e.g., `await new Promise(resolve => setTimeout(resolve, Math.pow(2, currentAttempt) * 100));`
        }
      }
      // This line should ideally not be reached if the loop's conditions are correct and errors are always thrown.
      throw new Error('Retrier exhausted all attempts without success. This is an unexpected state.');
    };
  };
}

/**
 * A convenience function to apply default retry logic to an asynchronous method.
 * It uses sensible default configurations:
 * - `maxRetries`: 2 (meaning 1 initial attempt + 2 retries, total 3 attempts)
 * - `timeoutMs`: 5000 (5 seconds timeout per attempt)
 * - Includes default logging for attempts, success, failure, and retries.
 *
 * @template T The expected return type of the asynchronous function.
 * @template Func The type of the asynchronous function to be wrapped.
 * @param func - The asynchronous method to be wrapped with default retry logic.
 * @returns A new asynchronous method that automatically includes the default retry behavior.
 *
 * @example
 * ```ts
 * import { useRetrier, TimeoutError } from './your-module'; // Assuming your module path
 *
 * // Example of an async operation that might fail randomly
 * let operationCount = 0;
 * async function unstableOperation(): Promise<string> {
 *   operationCount++;
 *   console.log(`  [Op] Executing unstableOperation, attempt ${operationCount}.`);
 *   const success = Math.random() > 0.6; // 40% chance of success
 *   await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500)); // 0.8s to 1.3s delay
 *
 *   if (!success && operationCount < 3) { // Fail first 2 attempts often
 *     throw new Error(`Unstable operation failed on call ${operationCount}.`);
 *   }
 *   console.log(`  [Op] Unstable operation succeeded on call ${operationCount}.`);
 *   return `Data from unstable operation (Call ${operationCount})`;
 * }
 *
 * async function runUseRetrier() {
 *   console.log('\n--- Running UseRetrier Example ---');
 *   operationCount = 0; // Reset for example
 *
 *   const reliableOperation = useRetrier(unstableOperation);
 *
 *   try {
 *     const result = await reliableOperation();
 *     console.log('Final Result (UseRetrier):', result);
 *   } catch (error: any) {
 *     console.error('Operation failed completely (UseRetrier):', error.message);
 *     if (error instanceof TimeoutError) {
 *       console.error('Specifically: A timeout occurred for UseRetrier example.');
 *     }
 *   }
 *
 *   // Another attempt, showing success
 *   operationCount = 0;
 *   try {
 *     const result = await reliableOperation();
 *     console.log('Final Result (UseRetrier, second run):', result);
 *   } catch (error: any) {
 *     console.error('Operation failed completely (UseRetrier, second run):', error.message);
 *   }
 * }
 *
 * runUseRetrier();
 * ```
 */
export function useRetrier<T, Func extends AsyncFunction<T>>(func: Func): ((...args: Parameters<Func>) => Promise<T>) {
  // Create a retrier instance with default options and common logging callbacks.
  const defaultRetrier = createRetrier({
    maxRetries: 2, // Default: 2 retries
    timeoutMs: 5000, // Default: 5 seconds timeout
    onAttempt: (attempt, error) => {
      if (attempt > 1) {
        console.log(`[UseRetrier Default] Attempt ${attempt} (after previous error: ${error?.message || 'None'})...`);
      } else {
        console.log(`[UseRetrier Default] Starting initial attempt ${attempt}...`);
      }
    },
    onSuccess: (result, attempt) => console.log(`[UseRetrier Default] ✅ Succeeded on attempt ${attempt}. Result:`, result),
    onFailure: (error, attempt) => console.error(`[UseRetrier Default] ❌ Failed after ${attempt} attempts. Final Error:`, error.message),
    onRetry: (attempt, error) => console.warn(`[UseRetrier Default] 🔄 Will retry. Attempt ${attempt} failed with: ${error.message}`),
    onTimeout: (attempt, ms) => console.warn(`[UseRetrier Default] ⏰ Attempt ${attempt} timed out after ${ms}ms.`),
  });
  // Use the created default retrier to wrap the provided function.
  return defaultRetrier(func);
}
