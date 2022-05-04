/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import {
  enableSchedulerDebugging,
  enableProfiling,
} from './SchedulerFeatureFlags';
// 下面这些函数，会在不同的构建模式中不一样。
// 当前版本只实现了一种方式，也就是default(./forks/SchedulerHostConfig.default)实现，
//   在这个实现中，如果是dom环境，采用MessageChannel实现requestHostCallback函数。
//   如果不是dom环境，都采用setTimeout实现.
// 当前只有一个default模式，后续可能不同的构建产物采用不同的方式，如react-native，
// 使用ios或者安卓更好的底层api实现
import {
  // 请求一个客户端回掉，这里的回掉可以理解为帧，当前react使用MessageChannel的事件触发来实现下一帧, 也就是宏任务实现
  requestHostCallback,
  // 请求一个客户端定时器
  requestHostTimeout,
  // 取消客户端的定时器
  cancelHostTimeout,
  // 是否需要等待客户端渲染
  shouldYieldToHost,
  // 得到当前事件
  getCurrentTime,
  // 刷新界面频率, fps
  forceFrameRate,
  // 请求重绘
  requestPaint,
} from './SchedulerHostConfig';
import {push, pop, peek} from './SchedulerMinHeap';

// TODO: Use symbols?
import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from './SchedulerPriorities';
import {
  markTaskRun,
  markTaskYield,
  markTaskCompleted,
  markTaskCanceled,
  markTaskErrored,
  markSchedulerSuspended,
  markSchedulerUnsuspended,
  markTaskStart,
  stopLoggingProfilingEvents,
  startLoggingProfilingEvents,
} from './SchedulerProfiling';

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;

// Tasks are stored on a min heap
// 存储的任务队列
// 计时器任务队列
var taskQueue = [];
// 帧任务队列
var timerQueue = [];

// Incrementing id counter. Used to maintain insertion order.
var taskIdCounter = 1;

// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentTask = null;
var currentPriorityLevel = NormalPriority;

// This is set while performing work, to prevent re-entrancy.
// 翻译：这是在执行工作时设置的，以防止重新进入。
var isPerformingWork = false;

var isHostCallbackScheduled = false;
var isHostTimeoutScheduled = false;

// 根据当前时间，调整到期的计时器任务队列到帧处理任务队列中
function advanceTimers(currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  // 翻译：检查不再延迟的任务并将它们添加到队列中。

  // 获取计时器任务队列中的优先级最高的任务
  let timer = peek(timerQueue);
  // 循环处理，将所有已经到点的任务都移动到普通的任务队列（帧处理任务队列）
  while (timer !== null) {
    // 任务已经被取消了
    // 由unstable_cancelCallback可以对一个task进行取消。取消后，在这里忽略
    if (timer.callback === null) {
      // Timer was cancelled.
      // 任务被取消了
      // 从队列中删除当前任务
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // Timer fired. Transfer to the task queue.
      // 定时器触发。 转移到任务队列。

      // task已经到点，需要从定时器任务队列中移动到帧任务队列

      // 删除定时器任务队列中当前任务
      pop(timerQueue);
      // 重新设置任务的排序指标(优先级)
      timer.sortIndex = timer.expirationTime;
      // 压入帧任务队列，压入后会对taskQueue根据优先级重新排序
      push(taskQueue, timer);
      // 开启性能分析
      if (enableProfiling) {
        // 记录信息
        markTaskStart(timer, currentTime);
        timer.isQueued = true;
      }
    } else {
      // Remaining timers are pending.
      // 剩下的定时器任务都处于等待状态
      // 如果当前task没有被取消，也没有到点，那么它和他后面的task都不需要处理，因为都应该处于等待状态
      return;
    }
    // 继续处理下一个，直至碰到第一个等待计时器task
    timer = peek(timerQueue);
  }
}

// 处理下一个timeout事件
// timeout事件触发后的处理流程：
// - 调整计时器的任务到任务队列中去
// - 发现当前没有下一帧的内容在处理，尝试触发下一帧内容处理工作
// - 尝试触发下一帧内容工作成功，则返回
// - 尝试触发下一帧内容工作失败，且计时器任务还有未处理，则出发下一轮计时器。
function handleTimeout(currentTime) {
  // 设置等待调用客户端timeout的标记为否
  isHostTimeoutScheduled = false;
  // 调整计时器任务
  // 根据当前时间，调整到期的计时器任务队列到帧处理任务队列中
  advanceTimers(currentTime);

  // 如果当前不是等待客户端下一帧执行内容
  if (!isHostCallbackScheduled) {
    // 任务队列的队头节点不为空
    if (peek(taskQueue) !== null) {
      // 触发下一帧内容渲染工作
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    } else {
      // 计时器任务队列中还存在任务
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        // 触发下一轮计时器
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

function flushWork(hasTimeRemaining, initialTime) {
  if (enableProfiling) {
    markSchedulerUnsuspended(initialTime);
  }

  // We'll need a host callback the next time work is scheduled.
  // 下次安排工作时，我们需要一个客户端回调。
  isHostCallbackScheduled = false;
  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    // 翻译: 我们安排了超时，但不再需要它。 取消它。
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  isPerformingWork = true;
  const previousPriorityLevel = currentPriorityLevel;
  try {
    if (enableProfiling) {
      try {
        return workLoop(hasTimeRemaining, initialTime);
      } catch (error) {
        if (currentTask !== null) {
          const currentTime = getCurrentTime();
          markTaskErrored(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        throw error;
      }
    } else {
      // No catch in prod code path.
      return workLoop(hasTimeRemaining, initialTime);
    }
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
    if (enableProfiling) {
      const currentTime = getCurrentTime();
      markSchedulerSuspended(currentTime);
    }
  }
}

function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);
  while (
    currentTask !== null &&
    !(enableSchedulerDebugging && isSchedulerPaused)
  ) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // This currentTask hasn't expired, and we've reached the deadline.
      break;
    }
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      if (enableProfiling) {
        markTaskRun(currentTask, currentTime);
      }
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      if (typeof continuationCallback === 'function') {
        currentTask.callback = continuationCallback;
        if (enableProfiling) {
          markTaskYield(currentTask, currentTime);
        }
      } else {
        if (enableProfiling) {
          markTaskCompleted(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
      advanceTimers(currentTime);
    } else {
      pop(taskQueue);
    }
    currentTask = peek(taskQueue);
  }
  // Return whether there's additional work
  if (currentTask !== null) {
    return true;
  } else {
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}

// 支持优先级的方式运行
// 在执行事件处理器的过程中，保证当前的优先级维持为priorityLevel的值
function unstable_runWithPriority(/* 优先级的登记 */priorityLevel, /* 事件处理器 */eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case LowPriority:
    case IdlePriority:
      break;
    // 对于不属于上面五种优先级的值，全部重置为NormalPriority
    default:
      priorityLevel = NormalPriority;
  }

  // 存储当前优先级
  var previousPriorityLevel = currentPriorityLevel;
  // 将当前优先级设置为传入进来的优先级
  currentPriorityLevel = priorityLevel;

  try {
    // 执行函数
    return eventHandler();
  } finally {
    // 恢复原来的优先级
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_next(eventHandler) {
  var priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
}

// 添加调度器任务
function unstable_scheduleCallback(/* 优先级 */priorityLevel, /* 回掉函数 */callback, /* 选项 */options) {
  // 获取当前时间
  var currentTime = getCurrentTime();

  var startTime;
  // 处理选项，设置任务期望的开始时间
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      startTime = currentTime + delay;
    } else {
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }

  // 设置任务执行的超时时间，如果超过超时时间还没有执行，则强制执行
  var timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      // -1
      timeout = IMMEDIATE_PRIORITY_TIMEOUT;
      break;
    case UserBlockingPriority:
      // 250
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
      break;
    case IdlePriority:
      // 永不超时
      timeout = IDLE_PRIORITY_TIMEOUT;
      break;
    case LowPriority:
      // 10s
      timeout = LOW_PRIORITY_TIMEOUT;
      break;
    case NormalPriority:
    default:
      // 5s
      timeout = NORMAL_PRIORITY_TIMEOUT;
      break;
  }

  // 任务过期时间
  var expirationTime = startTime + timeout;

  // 创建一个任务
  var newTask = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime,
    expirationTime,
    sortIndex: -1,
  };
  // 如果开启分析
  if (enableProfiling) {
    // 设置标记信息
    newTask.isQueued = false;
  }

  // 如果开始时间大于当前时间
  // 也就是不期望此刻执行
  if (startTime > currentTime) {
    // This is a delayed task.
    // 翻译：这是一项延迟的任务。

    // 重置任务的排序指标
    newTask.sortIndex = startTime;
    // 将任务压入定时器队列,并且排序，按优先级依次排序
    // timerQueue, 也就是下一个timeout事件触发时，会执行的队列
    push(timerQueue, newTask);
    // 如果当前任务节点不存在任务且 任务是计时器任务队列的第一个节点
    // 证明当前等待执行的任务都需要延迟执行，新增的是排在最前面的一个
    // 如果新增是排在第一个，那么要重建timeout事件处理器，因为新的task的优先级最高，需要取消之前的task的处理
    // 如果新增的不是排在第一个，那么继续以前的timeout事件
    // 如果任务节点存在任务，那么需要执行下一帧内容
    // peek是获取队头元素，但不会删除
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // All tasks are delayed, and this is the task with the earliest delay.
      // 翻译：所有任务都有延迟，这是延迟最早的任务。

      // 是否已经在等待下一个客户端的timeout执行内容
      if (isHostTimeoutScheduled) {
        // 如果已经安排了，则取消上一次的安排
        // 取消的原因是新增了优先级更高的task（newTask）,所以需要取消上一次的
        cancelHostTimeout();
      } else {
        // 标记为安排了timeout处理
        isHostTimeoutScheduled = true;
      }
      // Schedule a timeout.
      // 翻译：调度一个timeout事件执行内容

      // 请求一个客户端的timeout时间，等待一段时间后执行对应的task
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 如果当前task需要立即执行

    // 设置任务的排序标记
    newTask.sortIndex = expirationTime;
    // 将任务放入任务队列中
    push(taskQueue, newTask);
    // 如果开启分析
    if (enableProfiling) {
      // 记录task开始
      markTaskStart(newTask, currentTime);
      // 标记任务已经被处理
      newTask.isQueued = true;
    }
    // Schedule a host callback, if needed. If we're already performing work,
    // wait until the next time we yield.

    // 翻译 如果需要，安排客户端回掉。 如果此时已经在执行工作，延后到下一次。

    // 如果没有安排客户端的下一帧内容且当前没有正在工作
    if (!isHostCallbackScheduled && !isPerformingWork) {
      // 标记已经安排了下一帧内容
      isHostCallbackScheduled = true;
      // 请求一个客户端的下一帧事件，执行清空工作内容
      // TODO: ll flushWork
      // FIXME: 下沉 6
      // FIXME: READ_THIS
      requestHostCallback(flushWork);
    }
  }

  // 需要返回task对象，供使用者缓存做其他操作
  return newTask;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback(flushWork);
  }
}

function unstable_getFirstCallbackNode() {
  return peek(taskQueue);
}

// 取消一个任务节点
function unstable_cancelCallback(task) {
  // 如果开启分析
  if (enableProfiling) {
    // 任务已经被假如到队列中
    if (task.isQueued) {
      // 获取当前时间
      const currentTime = getCurrentTime();
      // 标记任务已经被取消
      markTaskCanceled(task, currentTime);
      // 标记任务退出队列
      task.isQueued = false;
    }
  }

  // Null out the callback to indicate the task has been canceled. (Can't
  // remove from the queue because you can't remove arbitrary nodes from an
  // array based heap, only the first one.)

  // 翻译：
  // 清空回调以指示任务已被取消。 （无法从队列中移除，因为您无法从基于数组的堆中移除任意节点，只能移除第一个。）
  // 意思是不能手动清空队列，只能标记他的状态，等待执行过程中自己忽略


  // 设置任务的回掉函数为空
  task.callback = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

const unstable_requestPaint = requestPaint;

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  shouldYieldToHost as unstable_shouldYield,
  unstable_requestPaint,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
  forceFrameRate as unstable_forceFrameRate,
};

export const unstable_Profiling = enableProfiling
  ? {
      startLoggingProfilingEvents,
      stopLoggingProfilingEvents,
    }
  : null;
