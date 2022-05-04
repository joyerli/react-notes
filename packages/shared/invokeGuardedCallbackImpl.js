/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import invariant from 'shared/invariant';

// 生产环境下的实现调用受保护的回掉函数
function invokeGuardedCallbackProd<A, B, C, D, E, F, Context>(
  name: string | null,
  func: (a: A, b: B, c: C, d: D, e: E, f: F) => mixed,
  context: Context,
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
) {
  // 回掉函数参数列表
  const funcArgs = Array.prototype.slice.call(arguments, 3);
  try {
    // 调用函数
    func.apply(context, funcArgs);
  } catch (error) {
    // 报错
    this.onError(error);
  }
}

// 如果是生产环境实现
let invokeGuardedCallbackImpl = invokeGuardedCallbackProd;

// dev环境换成开发实现
// 简单来说，为了避免在开发环境中，控制台和devtools的方便排查，不会像生产一样，只报错首个错误和延迟报错。
// 在开发环境中使用伪造window对象中的异常事件进行报错
if (__DEV__) {
  // In DEV mode, we swap out invokeGuardedCallback for a special version
  // that plays more nicely with the browser's DevTools. The idea is to preserve
  // "Pause on exceptions" behavior. Because React wraps all user-provided
  // functions in invokeGuardedCallback, and the production version of
  // invokeGuardedCallback uses a try-catch, all user exceptions are treated
  // like caught exceptions, and the DevTools won't pause unless the developer
  // takes the extra step of enabling pause on caught exceptions. This is
  // unintuitive, though, because even though React has caught the error, from
  // the developer's perspective, the error is uncaught.
  //
  // To preserve the expected "Pause on exceptions" behavior, we don't use a
  // try-catch in DEV. Instead, we synchronously dispatch a fake event to a fake
  // DOM node, and call the user-provided callback from inside an event handler
  // for that fake event. If the callback throws, the error is "captured" using
  // a global event handler. But because the error happens in a different
  // event loop context, it does not interrupt the normal program flow.
  // Effectively, this gives us try-catch behavior without actually using
  // try-catch. Neat!

  // Check that the browser supports the APIs we need to implement our special
  // DEV version of invokeGuardedCallback

  // 翻译：
  // 在 DEV 模式下，我们将 invokeGuardedCallback 换成一个可以更好地与浏览器的 DevTools 配合使用的特殊版本。
  // 这个想法是保留“暂停异常”行为。
  // 因为 React 将所有用户提供的函数包装在 invokeGuardedCallback 中，
  // 并且 invokeGuardedCallback 的生产版本使用 try-catch，所以所有用户异常都被视为捕获的异常，
  // 除非开发人员采取额外的步骤来启用 pause on，否则 DevTools 不会暂停 捕获的异常。
  //  然而，这是不直观的，因为即使 React 已经捕获了错误，从开发人员的角度来看，错误是未被捕获的。

  // 为了保持预期的“异常暂停”行为，我们不在 DEV 中使用 try-catch。
  // 相反，我们将假事件同步分派到假 DOM 节点，并从事件处理程序内部为该假事件调用用户提供的回调。
  // 如果回调抛出，则使用全局事件处理程序“捕获”错误。
  // 但是因为错误发生在不同的事件循环上下文中，所以它不会中断正常的程序流程。
  // 实际上，这为我们提供了 try-catch 行为，而无需实际使用 try-catch。 整洁的！

  // 检查浏览器是否支持我们需要实现我们的特殊 DEV 版本的 invokeGuardedCallback 的 API

  // 确定在浏览器中且支持手动触发事件
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.createEvent === 'function'
  ) {
    // 伪造一个节点
    const fakeNode = document.createElement('react');

    invokeGuardedCallbackImpl = function invokeGuardedCallbackDev<
      A,
      B,
      C,
      D,
      E,
      F,
      Context,
    >(
      name: string | null,
      func: (a: A, b: B, c: C, d: D, e: E, f: F) => mixed,
      context: Context,
      a: A,
      b: B,
      c: C,
      d: D,
      e: E,
      f: F,
    ) {
      // If document doesn't exist we know for sure we will crash in this method
      // when we call document.createEvent(). However this can cause confusing
      // errors: https://github.com/facebookincubator/create-react-app/issues/3482
      // So we preemptively throw with a better message instead.

      // 翻译：
      // 如果文档不存在，我们肯定会在调用 document.createEvent() 时在此方法中崩溃。
      // 然而，这可能会引起混乱，所以我们先发制人地抛出一个更好的消息。

      // 如果document不存在，则报错
      invariant(
        typeof document !== 'undefined',
        'The `document` global was defined when React was initialized, but is not ' +
          'defined anymore. This can happen in a test environment if a component ' +
          'schedules an update from an asynchronous callback, but the test has already ' +
          'finished running. To solve this, you can either unmount the component at ' +
          'the end of your test (and ensure that any asynchronous operations get ' +
          'canceled in `componentWillUnmount`), or you can change the test itself ' +
          'to be asynchronous.',
      );
      // 创建一个事件
      const evt = document.createEvent('Event');

      let didCall = false;
      // Keeps track of whether the user-provided callback threw an error. We
      // set this to true at the beginning, then set it to false right after
      // calling the function. If the function errors, `didError` will never be
      // set to false. This strategy works even if the browser is flaky and
      // fails to call our global error handler, because it doesn't rely on
      // the error event at all.
      // 翻译：
      // 跟踪用户提供的回调是否引发错误。 我们在开始时将其设置为 true，
      // 然后在调用函数后立即将其设置为 false。 如果函数出错，`didError` 将永远不会被设置为 false。
      // 即使浏览器不稳定并且无法调用我们的全局错误处理程序，此策略也有效，因为它根本不依赖错误事件。
      let didError = true;

      // Keeps track of the value of window.event so that we can reset it
      // during the callback to let user code access window.event in the
      // browsers that support it.

      // 翻译：
      // 跟踪 window.event 的值，以便我们可以在回调期间重置它，让用户代码在支持它的浏览器中访问 window.event。
      const windowEvent = window.event;

      // Keeps track of the descriptor of window.event to restore it after event
      // dispatching: https://github.com/facebook/react/issues/13688

      // 翻译：
      // 跟踪 window.event 的描述符以在事件发生后恢复它

      const windowEventDescriptor = Object.getOwnPropertyDescriptor(
        window,
        'event',
      );

      // 在出发后恢复
      function restoreAfterDispatch() {
        // We immediately remove the callback from event listeners so that
        // nested `invokeGuardedCallback` calls do not clash. Otherwise, a
        // nested call would trigger the fake event handlers of any call higher
        // in the stack.
        // 翻译：
        // 我们立即从事件侦听器中删除回调，以便嵌套的 `invokeGuardedCallback` 调用不会发生冲突。
        // 否则，嵌套调用将触发堆栈中更高调用的虚假事件处理程序。
        fakeNode.removeEventListener(evtType, callCallback, false);

        // We check for window.hasOwnProperty('event') to prevent the
        // window.event assignment in both IE <= 10 as they throw an error
        // "Member not found" in strict mode, and in Firefox which does not
        // support window.event.
        // 翻译：
        // 我们检查 window.hasOwnProperty('event') 以防止在 IE <= 10 中分配 window.event，
        // 因为它们在严格模式下会抛出错误“未找到成员”，并且在不支持 window.event 的 Firefox 中。
        if (
          typeof window.event !== 'undefined' &&
          window.hasOwnProperty('event')
        ) {
          window.event = windowEvent;
        }
      }

      // Create an event handler for our fake event. We will synchronously
      // dispatch our fake event using `dispatchEvent`. Inside the handler, we
      // call the user-provided callback.
      // 翻译：
      // 为我们的假事件创建一个事件处理程序。
      // 我们将使用 `dispatchEvent` 同步调度我们的假事件。 在处理程序内部，我们调用用户提供的回调。

      const funcArgs = Array.prototype.slice.call(arguments, 3);
      function callCallback() {
        didCall = true;
        restoreAfterDispatch();
        func.apply(context, funcArgs);
        didError = false;
      }

      // Create a global error event handler. We use this to capture the value
      // that was thrown. It's possible that this error handler will fire more
      // than once; for example, if non-React code also calls `dispatchEvent`
      // and a handler for that event throws. We should be resilient to most of
      // those cases. Even if our error event handler fires more than once, the
      // last error event is always used. If the callback actually does error,
      // we know that the last error event is the correct one, because it's not
      // possible for anything else to have happened in between our callback
      // erroring and the code that follows the `dispatchEvent` call below. If
      // the callback doesn't error, but the error event was fired, we know to
      // ignore it because `didError` will be false, as described above.

      // 翻译：
      // 创建一个全局错误事件处理程序。 我们使用它来捕获抛出的值。
      // 这个错误处理程序可能会多次触发；
      // 例如，如果非 React 代码也调用 `dispatchEvent` 并且该事件的处理程序会抛出。
      // 我们应该对大多数情况有弹性。 即使我们的错误事件处理程序多次触发，最后一个错误事件也总是被使用。
      // 如果回调确实出错，我们知道最后一个错误事件是正确的，因为在我们的回调错误和下面的 `dispatchEvent`
      // 调用之后的代码之间不可能发生任何其他事情。 如果回调没有出错，
      // 但触发了错误事件，我们知道要忽略它，因为 `didError` 将是假的，如上所述。

      let error;
      // Use this to track whether the error event is ever called.
      // 翻译： 使用它来跟踪是否曾经调用过错误事件。
      let didSetError = false;
      let isCrossOriginError = false;

      function handleWindowError(event) {
        error = event.error;
        didSetError = true;
        if (error === null && event.colno === 0 && event.lineno === 0) {
          isCrossOriginError = true;
        }
        if (event.defaultPrevented) {
          // Some other error handler has prevented default.
          // Browsers silence the error report if this happens.
          // We'll remember this to later decide whether to log it or not.
          // 翻译：
          // 其他一些错误处理程序阻止了默认值。
          // 如果发生这种情况，浏览器会静音错误报告。 我们会记住这一点，以便稍后决定是否记录它。
          if (error != null && typeof error === 'object') {
            try {
              error._suppressLogging = true;
            } catch (inner) {
              // Ignore.
            }
          }
        }
      }

      // Create a fake event type.
      // 翻译: 创建一个假事件
      const evtType = `react-${name ? name : 'invokeguardedcallback'}`;

      // Attach our event handlers
      // 翻译：触发时间处理器
      window.addEventListener('error', handleWindowError);
      fakeNode.addEventListener(evtType, callCallback, false);

      // Synchronously dispatch our fake event. If the user-provided function
      // errors, it will trigger our global error handler.
      // 翻译：同步调度我们的假事件。 如果用户提供的函数出错，它将触发我们的全局错误处理程序。
      evt.initEvent(evtType, false, false);
      fakeNode.dispatchEvent(evt);

      if (windowEventDescriptor) {
        Object.defineProperty(window, 'event', windowEventDescriptor);
      }

      if (didCall && didError) {
        if (!didSetError) {
          // The callback errored, but the error event never fired.
          // 翻译：回调出错，但错误事件从未触发。
          error = new Error(
            'An error was thrown inside one of your components, but React ' +
              "doesn't know what it was. This is likely due to browser " +
              'flakiness. React does its best to preserve the "Pause on ' +
              'exceptions" behavior of the DevTools, which requires some ' +
              "DEV-mode only tricks. It's possible that these don't work in " +
              'your browser. Try triggering the error in production mode, ' +
              'or switching to a modern browser. If you suspect that this is ' +
              'actually an issue with React, please file an issue.',
          );
        } else if (isCrossOriginError) {
          error = new Error(
            "A cross-origin error was thrown. React doesn't have access to " +
              'the actual error object in development. ' +
              'See https://reactjs.org/link/crossorigin-error for more information.',
          );
        }
        this.onError(error);
      }

      // Remove our event listeners
      // 翻译：移除我们的事件监听器
      window.removeEventListener('error', handleWindowError);

      if (!didCall) {
        // Something went really wrong, and our event was not dispatched.
        // https://github.com/facebook/react/issues/16734
        // https://github.com/facebook/react/issues/16585
        // Fall back to the production implementation.
        restoreAfterDispatch();
        return invokeGuardedCallbackProd.apply(this, arguments);
      }
    };
  }
}

export default invokeGuardedCallbackImpl;
