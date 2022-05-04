/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  needsStateRestore,
  restoreStateIfNeeded,
} from './ReactDOMControlledComponent';
import {enableDiscreteEventFlushingChange} from 'shared/ReactFeatureFlags';

// Used as a way to call batchedUpdates when we don't have a reference to
// the renderer. Such as when we're dispatching events or if third party
// libraries need to call batchedUpdates. Eventually, this API will go away when
// everything is batched by default. We'll then have a similar API to opt-out of
// scheduled work and instead do synchronous work.

// 谷歌翻译：
// 当我们没有对渲染器的引用时，用作调用 batchedUpdates 的一种方式。
// 例如当我们调度事件或第三方库需要调用 batchedUpdates 时。
//最终，当默认情况下对所有内容进行批处理时，此 API 将消失。 然后，我们将有一个类似的 API 来选择退出计划的工作，而是进行同步工作。

// Defaults
// 批量更新事件的默认实现函数
let batchedUpdatesImpl = function(fn, bookkeeping) {
  // 直接调用
  return fn(bookkeeping);
};

// 离散更新的实现，当前就是直接调用事件
// 允许事件插件做调整
let discreteUpdatesImpl = function(fn, a, b, c, d) {
  return fn(a, b, c, d);
};

// 刷新离散的事件更新的默认实现
// 默认为空函数，但允许事件插件做扩展
let flushDiscreteUpdatesImpl = function() {};
// 批量更新事件
// 允许事件插件做改变
let batchedEventUpdatesImpl = batchedUpdatesImpl;

// 当前是否正在处理事件
let isInsideEventHandler = false;
let isBatchingEventUpdates = false;

// 完成事件操作
function finishEventHandler() {
  // Here we wait until all updates have propagated, which is important
  // when using controlled components within layers:
  // https://github.com/facebook/react/issues/1698
  // Then we restore state of any controlled component.

  // 翻译：
  // 在这里，我们等到所有更新都传播完，
  // 这在层内使用受控组件时很重要：https://github.com/facebook/react/issues/1698，
  // 然后我们恢复任何受控组件的状态。

  // 受控的组件对应的fiber对象是否有待更新
  const controlledComponentsHavePendingUpdates = needsStateRestore();
  if (controlledComponentsHavePendingUpdates) {
    // If a controlled event was fired, we may need to restore the state of
    // the DOM node back to the controlled value. This is necessary when React
    // bails out of the update without touching the DOM.

    // 翻译:
    // 如果触发了受控事件，我们可能需要将 DOM 节点的状态恢复为受控值。 当 React 在不接触 DOM 的情况下退出更新时，这是必要的。

    // 刷新零散的事件更新
    // 当前就是空函数
    flushDiscreteUpdatesImpl();
    // 恢复需要恢复的dom节点的对应组件的fiber对象的状态
    restoreStateIfNeeded();
  }
}

// 批量更新
export function batchedUpdates(fn, bookkeeping) {
  // 如果当前正在处理事件， 直接调用回掉函数处理事件委托队列
  if (isInsideEventHandler) {
    // If we are currently inside another batch, we need to wait until it
    // fully completes before restoring state.
    // 翻译：
    // 如果我们当前在另一个批次中，我们需要等到它完全完成才能恢复状态。
    return fn(bookkeeping);
  }
  // 如果当前不是处于正在处理事件中，开始处理事件，将isInsideEventHandler标记为true，代表当前处于事件处理过程中
  isInsideEventHandler = true;
  try {
    // 批量事件更新
    return batchedUpdatesImpl(fn, bookkeeping);
  } finally {
    // 处理完成后，重制标记
    isInsideEventHandler = false;
    // 完成事件处理后的扫尾工作
    // 一般都是一些fiber节点需要在事件处理完成后，进行状态恢复
    finishEventHandler();
  }
}

// 批量事件更新
export function batchedEventUpdates(fn, a, b) {
  // 是否已经在批量更新的过程中
  if (isBatchingEventUpdates) {
    // If we are currently inside another batch, we need to wait until it
    // fully completes before restoring state.

    // 如果我们当前在另一个批次中，我们需要等到它完全完成才能恢复状态。

    // 如果已经处于批量更新的过程中，则直接调用函数
    return fn(a, b);
  }
  // 标记进入批量更新
  isBatchingEventUpdates = true;
  try {
    // 调用批量事件实现函数
    // 默认情况下也是直接调用
    return batchedEventUpdatesImpl(fn, a, b);
  } finally {
    // 标记退出进入批量更新
    isBatchingEventUpdates = false;
    // 完成事件处理
    finishEventHandler();
  }
}

// 离散事件更新(离散事件的触发)
// 保证在执行的时候，标记为执行中，避免其他逻辑执行
// 离散的含义可以初步理解为非批量
export function discreteUpdates(fn, a, b, c, d) {
  // 保存之前是否在处理事件
  const prevIsInsideEventHandler = isInsideEventHandler;
  // 标记正在处理事件
  isInsideEventHandler = true;
  try {
    // 执行离散更新实现
    // 默认是直接调用
    // 当前是使用 react-reconciler/src/ReactFiberWorkLoop.old.js中的discreteUpdates
    return discreteUpdatesImpl(fn, a, b, c, d);
  } finally {
    // 恢复isInsideEventHandler 为之前的值
    isInsideEventHandler = prevIsInsideEventHandler;
    // 如果还在处理事件(之前就在处理其他的事件操作)
    if (!isInsideEventHandler) {
      // 完成事件操作
      finishEventHandler();
    }
  }
}

let lastFlushedEventTimeStamp = 0;
export function flushDiscreteUpdatesIfNeeded(timeStamp: number) {
  if (enableDiscreteEventFlushingChange) {
    // event.timeStamp isn't overly reliable due to inconsistencies in
    // how different browsers have historically provided the time stamp.
    // Some browsers provide high-resolution time stamps for all events,
    // some provide low-resolution time stamps for all events. FF < 52
    // even mixes both time stamps together. Some browsers even report
    // negative time stamps or time stamps that are 0 (iOS9) in some cases.
    // Given we are only comparing two time stamps with equality (!==),
    // we are safe from the resolution differences. If the time stamp is 0
    // we bail-out of preventing the flush, which can affect semantics,
    // such as if an earlier flush removes or adds event listeners that
    // are fired in the subsequent flush. However, this is the same
    // behaviour as we had before this change, so the risks are low.
    if (
      !isInsideEventHandler &&
      (timeStamp === 0 || lastFlushedEventTimeStamp !== timeStamp)
    ) {
      lastFlushedEventTimeStamp = timeStamp;
      flushDiscreteUpdatesImpl();
    }
  } else {
    if (!isInsideEventHandler) {
      flushDiscreteUpdatesImpl();
    }
  }
}

export function setBatchingImplementation(
  _batchedUpdatesImpl,
  _discreteUpdatesImpl,
  _flushDiscreteUpdatesImpl,
  _batchedEventUpdatesImpl,
) {
  batchedUpdatesImpl = _batchedUpdatesImpl;
  discreteUpdatesImpl = _discreteUpdatesImpl;
  flushDiscreteUpdatesImpl = _flushDiscreteUpdatesImpl;
  batchedEventUpdatesImpl = _batchedEventUpdatesImpl;
}
