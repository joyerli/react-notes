/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import invariant from 'shared/invariant';
import invokeGuardedCallbackImpl from './invokeGuardedCallbackImpl';

// Used by Fiber to simulate a try-catch.
// 翻译：Fiber 使用它来模拟 try-catch。
let hasError: boolean = false;
let caughtError: mixed = null;

// Used by event system to capture/rethrow the first error.
// 翻译：被事件系统用来捕获/重新抛出第一个错误。
// 在事件队列中执行之间监听器，记录第一个异常对象
let hasRethrowError: boolean = false;
let rethrowError: mixed = null;

const reporter = {
  onError(error: mixed) {
    hasError = true;
    caughtError = error;
  },
};

/**
 * Call a function while guarding against errors that happens within it.
 * Returns an error if it throws, otherwise null.
 *
 * In production, this is implemented using a try-catch. The reason we don't
 * use a try-catch directly is so that we can swap out a different
 * implementation in DEV mode.
 *
 * @param {String} name of the guard to use for logging or debugging
 * @param {Function} func The function to invoke
 * @param {*} context The context to use when calling the function
 * @param {...*} args Arguments for function
 */
// 翻译：调用一个函数，同时防止其中发生的错误。 如果抛出，则返回错误，否则返回 null。
// 在生产中，这是使用 try-catch 实现的。 我们不直接使用 try-catch 的原因是我们可以在 DEV 模式下换出不同的实现。

// 调用一个受保护的回掉函数
// react中会将使用者设置的函数属性(主要是事件监听器)都受保护的方式执行，避免出错崩坏整个react系统
export function invokeGuardedCallback<A, B, C, D, E, F, Context>(
  name: string | null,
  func: (a: A, b: B, c: C, d: D, e: E, f: F) => mixed,
  context: Context,
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
): void {
  // 重制参数
  hasError = false;
  caughtError = null;
  // 调用实现，重制this
  // invokeGuardedCallbackImpl在生产环境跟开发环境是不一样的实现，开发环境更多提示
  // 错误会报错在reporter对象中
  invokeGuardedCallbackImpl.apply(reporter, arguments);
}

/**
 * Same as invokeGuardedCallback, but instead of returning an error, it stores
 * it in a global so it can be rethrown by `rethrowCaughtError` later.
 * TODO: See if caughtError and rethrowError can be unified.
 *
 * @param {String} name of the guard to use for logging or debugging
 * @param {Function} func The function to invoke
 * @param {*} context The context to use when calling the function
 * @param {...*} args Arguments for function
 */

// 翻译：
// 与 invokeGuardedCallback 相同，但不是返回错误，而是将其存储在全局中，
// 以便稍后可以通过 `rethrowCaughtError` 重新抛出。
// TODO: 看看是否可以统一caughtError和rethrowError。
// react中会将使用者设置的函数属性都受保护的方式执行，避免出错崩坏整个react系统
export function invokeGuardedCallbackAndCatchFirstError<
  A,
  B,
  C,
  D,
  E,
  F,
  Context,
>(
  // 函数名
  name: string | null,
  // 回掉函数
  func: (a: A, b: B, c: C, d: D, e: E, f: F) => void,
  // 上下文
  context: Context,
  // 事件参数
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
): void {
  // 调用受保护的回调，维持this指向
  invokeGuardedCallback.apply(this, arguments);
  // 如果有异常
  if (hasError) {
    // 获取异常并且清空
    const error = clearCaughtError();
    // 如果没有重新抛出了异常
    // 下面这段代码保证在调用rethrowCaughtError之前，只记录第一个异常对象
    if (!hasRethrowError) {
      // 标记
      hasRethrowError = true;
      rethrowError = error;
    }
  }
}

/**
 * During execution of guarded functions we will capture the first error which
 * we will rethrow to be handled by the top level error handler.
 */
// 翻译：在执行受保护的函数期间，我们将捕获第一个错误，我们将重新抛出该错误以由顶级错误处理程序处理。

// 抛出来一段时间批量执行某个函数的首次异常
export function rethrowCaughtError() {
  if (hasRethrowError) {
    const error = rethrowError;
    hasRethrowError = false;
    rethrowError = null;
    throw error;
  }
}

export function hasCaughtError() {
  return hasError;
}

// 获取异常对象后，重制全局保存异常对象变量
export function clearCaughtError() {
  if (hasError) {
    const error = caughtError;
    hasError = false;
    caughtError = null;
    return error;
  } else {
    invariant(
      false,
      'clearCaughtError was called but no error was captured. This error ' +
        'is likely caused by a bug in React. Please file an issue.',
    );
  }
}
