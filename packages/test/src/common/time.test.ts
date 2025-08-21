
// // 模拟一个异步操作，可能成功，可能失败，可能超时
// let callCount = 0;
// async function mockAsyncTask(shouldFail: boolean, id: string): Promise<string> {
//   callCount++;
//   console.log(`  [Mock] Call ${id} - Attempt ${callCount} started.`);
//   const randomDelay = Math.random() * 2000 + 500; // 500ms to 2500ms
//   await new Promise(resolve => setTimeout(resolve, randomDelay));

//   if (shouldFail && callCount < 3) { // 模拟前两次调用失败
//     const errorType = callCount % 2 === 0 ? 'NetworkError' : 'ServerError';
//     console.warn(`  [Mock] Call ${id} - Attempt ${callCount} failed with ${errorType}.`);
//     throw new Error(`${errorType} on attempt ${callCount}`);
//   }
//   if (randomDelay > 1800) { // 模拟偶尔超时
//       console.warn(`  [Mock] Call ${id} - Attempt ${callCount} too slow, simulating timeout.`);
//       throw new TimeoutError(`Simulated timeout for attempt ${callCount}`);
//   }
//   console.log(`  [Mock] Call ${id} - Attempt ${callCount} succeeded.`);
//   return `Success from ${id} on attempt ${callCount}!`;
// }

// // 重置模拟计数器
// function resetMock() {
//     callCount = 0;
// }

// // --- 示例 1: 使用 createRetrier 自定义配置 ---
// async function runCustomRetrierExample() {
//   console.log('\n--- 示例 1: 使用 createRetrier 自定义配置 (旧版较大示例) ---');
//   resetMock();

//   const customRetrier = createRetrier({
//     maxRetries: (attempt) => attempt < 4 ? 3 : 0, // 动态重试次数，最多尝试 4 次
//     timeoutMs: (attempt) => 1000 * attempt, // 每次超时时间递增
//     onAttempt: (attempt, error) => console.log(`[Custom Retrier] Attempt ${attempt} running... (last error: ${error?.message || 'N/A'})`),
//     onSuccess: (res, att) => console.log(`[Custom Retrier] ✅ Success on attempt ${att}: ${res}`),
//     onFailure: (err, att) => console.error(`[Custom Retrier] ❌ Failed after ${att} attempts: ${err.message}`),
//     onRetry: (att, err) => console.warn(`[Custom Retrier] 🔄 Retrying attempt ${att + 1} due to: ${err.message}`),
//     onTimeout: (att, ms) => console.error(`[Custom Retrier] ⏰ Attempt ${att} timed out after ${ms}ms.`),
//     shouldRetry: (error, attempt) => {
//         if (error.message.includes('ServerError')) {
//             console.log(`[Custom Retrier] Not retrying on ServerError.`);
//             return false; // 特殊错误不重试
//         }
//         return true;
//     }
//   });

//   const wrappedTask = customRetrier(mockAsyncTask);

//   try {
//     const result = await wrappedTask(true, 'CustomTask1');
//     console.log(`Final Result (CustomTask1): ${result}`);
//   } catch (error: any) {
//     console.error(`Final Error (CustomTask1): ${error.message}`);
//     if (error instanceof TimeoutError) {
//       console.error('It was a timeout error!');
//     }
//   }

//   // 模拟一个最终成功的例子
//   resetMock();
//   try {
//     const result = await wrappedTask(false, 'CustomTask2'); // 模拟一个不失败的
//     console.log(`Final Result (CustomTask2): ${result}`);
//   } catch (error: any) {
//     console.error(`Final Error (CustomTask2): ${error.message}`);
//   }
// }

// // --- 示例 2: 使用 useRetrier 默认配置 ---
// async function runUseRetrierExample() {
//   console.log('\n--- 示例 2: 使用 useRetrier 默认配置 (旧版较大示例) ---');
//   resetMock();

//   const wrappedTask = useRetrier(mockAsyncTask);

//   try {
//     const result = await wrappedTask(true, 'UseRetrierTask1');
//     console.log(`Final Result (UseRetrierTask1): ${result}`);
//   } catch (error: any) {
//     console.error(`Final Error (UseRetrierTask1): ${error.message}`);
//     if (error instanceof TimeoutError) {
//       console.error('It was a timeout error!');
//     }
//   }

//   // 模拟一个最终成功的例子
//   resetMock();
//   try {
//     const result = await wrappedTask(false, 'UseRetrierTask2'); // 模拟一个不失败的
//     console.log(`Final Result (UseRetrierTask2): ${result}`);
//   } catch (error: any) {
//     console.error(`Final Error (UseRetrierTask2): ${error.message}`);
//   }
// }

// // --- 运行所有示例 ---
// (async () => {
//   await runCustomRetrierExample();
//   await runUseRetrierExample();
// })();
