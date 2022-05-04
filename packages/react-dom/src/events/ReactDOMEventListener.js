/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {AnyNativeEvent} from '../events/PluginModuleType';
import type {FiberRoot} from 'react-reconciler/src/ReactInternalTypes';
import type {Container, SuspenseInstance} from '../client/ReactDOMHostConfig';
import type {DOMEventName} from '../events/DOMEventNames';

// Intentionally not named imports because Rollup would use dynamic dispatch for
// CommonJS interop named imports.
import * as Scheduler from 'scheduler';

import {
  isReplayableDiscreteEvent,
  queueDiscreteEvent,
  hasQueuedDiscreteEvents,
  clearIfContinuousEvent,
  queueIfContinuousEvent,
} from './ReactDOMEventReplaying';
import {
  getNearestMountedFiber,
  getContainerFromFiber,
  getSuspenseInstanceFromFiber,
} from 'react-reconciler/src/ReactFiberTreeReflection';
import {HostRoot, SuspenseComponent} from 'react-reconciler/src/ReactWorkTags';
import {
  type EventSystemFlags,
  IS_CAPTURE_PHASE,
  IS_LEGACY_FB_SUPPORT_MODE,
} from './EventSystemFlags';

import getEventTarget from './getEventTarget';
import {getClosestInstanceFromNode} from '../client/ReactDOMComponentTree';

import {
  enableLegacyFBSupport,
  enableEagerRootListeners,
  decoupleUpdatePriorityFromScheduler,
} from 'shared/ReactFeatureFlags';
import {
  UserBlockingEvent,
  ContinuousEvent,
  DiscreteEvent,
} from 'shared/ReactTypes';
import {getEventPriorityForPluginSystem} from './DOMEventProperties';
import {dispatchEventForPluginEventSystem} from './DOMPluginEventSystem';
import {
  flushDiscreteUpdatesIfNeeded,
  discreteUpdates,
} from './ReactDOMUpdateBatching';
import {
  InputContinuousLanePriority,
  getCurrentUpdateLanePriority,
  setCurrentUpdateLanePriority,
} from 'react-reconciler/src/ReactFiberLane';

const {
  unstable_UserBlockingPriority: UserBlockingPriority,
  unstable_runWithPriority: runWithPriority,
} = Scheduler;

// TODO: can we stop exporting these?
// 翻译: 这里能不导出吗？

// 开启事件是否执行的开关
export let _enabled = true;

// This is exported in FB builds for use by legacy FB layer infra.
// We'd like to remove this but it's not clear if this is safe.

// 翻译： 这在 FB 构建中导出以供遗留 FB 层基础设施使用。我们想删除它，但不清楚这是否安全。

// 设置是否关闭事件执行
export function setEnabled(enabled: ?boolean) {
  _enabled = !!enabled;
}

// 事件是否开启
export function isEnabled() {
  return _enabled;
}

export function createEventListenerWrapper(
  targetContainer: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
): Function {
  return dispatchEvent.bind(
    null,
    domEventName,
    eventSystemFlags,
    targetContainer,
  );
}

// 创建具有优先级的事件侦听器包装器

/**
 * 这里涉及到react中事件分类：离散事件，用户界面阻塞事件，连续事件
 * 离散事件包括：
 *  cancel, click, close, contextmenu, copy, cut, auxclick, dblclick, dragend,
 *  dragstart, drop, focusin, focusout, input, invalid, keydown, keypress,
 *  keyup, mousedown, mouseup, paste, pause, play, pointercancel, pointerdown,
 *  pointerup, ratechange, reset, seeked, submit, touchcancel, touchend,
 *  touchstart, volumechange, change, selectionchange, textInput, compositionstart,
 *  compositionend, compositionupdate,
 * 用户界面阻塞事件：
 *  drag, dragenter, dragexit, dragleave, dragover, mousemove, mouseout, mouseover,
 *  pointermove, pointerout, pointerover, scroll, toggle, touchmove, wheel
 * 连续事件：
 *  abort,animationend,animationiteration,animationstart,transitionend,canplay,
 *  canplaythrough,durationchange,emptied,encrypted,ended,error,gotpointercapture,
 *  load,loadeddata,loadedmetadata,loadstart,lostpointercapture,playing,
 *  progress,seeking,stalled,suspend,timeupdate,waiting
 * 对于不同的事件，委托事件中触发事件的方式是不一样的：
 * 离散事件：使用discreteUpdates实现，这在不同的react框架(react-native, react)上是不一样的，
 *   react-dom框架下使用react-reconciler/src/ReactFiberWorkLoop.old.js的discreteUpdates函数。
 *   基本跟用户界面阻塞事件事件逻辑一致，多了一些标记和执行后清除操作。
 * 用户界面阻塞事件: 使用Scheduler的runWithPriority实现
 * 连续事件（和其他）: 不实用调度器，直接触发事件
 */

export function createEventListenerWrapperWithPriority(
  // 需要添加时间的dom节点
  // => 基本为react挂在的节点
  targetContainer: EventTarget,
  // 事件名
  domEventName: DOMEventName,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags: EventSystemFlags,
): Function {
  // 获取事件优先级,
  // DiscreteEvent: 0, UserBlockingEvent: 1, ContinuousEvent: 2
  const eventPriority = getEventPriorityForPluginSystem(domEventName);
  // 根据事件优先级设置不同的监听函数
  let listenerWrapper;
  switch (eventPriority) {
    case DiscreteEvent:
      // 创建一个监听器，这个监听器使用委托的机制去触发一个离散事件
      listenerWrapper = dispatchDiscreteEvent;
      break;
    case UserBlockingEvent:
      // 创建一个监听器，这个监听器使用委托的机制去触发一个用户界面阻塞事件
      listenerWrapper = dispatchUserBlockingUpdate;
      break;
    case ContinuousEvent:
    default:
      // 直接触发事件
      listenerWrapper = dispatchEvent;
      break;
  }
  // 绑定参数
  return listenerWrapper.bind(
    // 注意,this为空
    null,
    domEventName,
    eventSystemFlags,
    targetContainer,
  );
}

// 离散事件监听器
// 离散事件的概念请百度
function dispatchDiscreteEvent(
  // 事件名
  domEventName,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags,
  // 需要添加时间的dom节点
  // => 基本为react挂在的节点
  container,
  // 原生事件对象
  nativeEvent,
) {
  // 是否开启脸书内部老版本支持，不细看
  if (
    !enableLegacyFBSupport ||
    // If we are in Legacy FB support mode, it means we've already
    // flushed for this event and we don't need to do it again.
    (eventSystemFlags & IS_LEGACY_FB_SUPPORT_MODE) === 0
  ) {
    flushDiscreteUpdatesIfNeeded(nativeEvent.timeStamp);
  }
  // 安全的触发事件
  discreteUpdates(
    // 触发事件，实际逻辑
    dispatchEvent,
    // 事件名
    domEventName,
    // 事件系统标记，为一些二进制值，进行多标记计算
    // => 0
    eventSystemFlags,
    // 需要添加时间的dom节点
    // => 基本为react挂在的节点
    container,
    // 原生事件对象
    nativeEvent,
  );
}

// 触发用户界面阻塞事件
function dispatchUserBlockingUpdate(
  // 原生事件名
  domEventName,
  // 事件系统标记
  eventSystemFlags,
  // 触发容器，委托事件的的事件触发dom节点，一般为react的挂载节点
  container,
  // 原生的事件对象
  nativeEvent,
) {
  // 是否替换 React 内部的 runWithPriority。 当前配置为false
  // 是否修改优先级的方式执行，以一个固定的优先级执行
  if (decoupleUpdatePriorityFromScheduler) {
    // 获取当前更新车道优先级
    const previousPriority = getCurrentUpdateLanePriority();
    try {
      // TODO: Double wrapping is necessary while we decouple Scheduler priority.
      // 翻译： 当我们解耦调度器优先级时，双重包装是必要的。

      // 设置当前更新车道的优先级
      // InputContinuousLanePriority的值是10, 默认是0
      setCurrentUpdateLanePriority(InputContinuousLanePriority);
      // 支持优先级的方式运行
      runWithPriority(
        UserBlockingPriority,
        // 触发事件
        dispatchEvent.bind(
          null,
          domEventName,
          eventSystemFlags,
          container,
          nativeEvent,
        ),
      );
    } finally {
      // 执行完成后，恢复车道的优先级
      setCurrentUpdateLanePriority(previousPriority);
    }
  } else {
    // 支持优先级的方式运行
    // 内部在执行传入进去的回掉函数过程中，维持调度的优先级为UserBlockingPriority，
    runWithPriority(
      // 2
      UserBlockingPriority,
      // 触发事件
      dispatchEvent.bind(
        null,
        domEventName,
        eventSystemFlags,
        container,
        nativeEvent,
      ),
    );
  }
}

// 触发单个事件
// 该函数中的离散事件的概念，包含了所有的事件。
export function dispatchEvent(
  // 事件名
  domEventName: DOMEventName,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags: EventSystemFlags,
  // 需要添加时间的dom节点
  // => 基本为react挂在的节点
  targetContainer: EventTarget,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
): void {
  // 开关，开启时不执行
  if (!_enabled) {
    return;
  }
  // 是否允许重复
  // TODO: 可重复的事件，个人理解为可以延后触发的事件。
  // 因为此时可能react还在初始化，等待初始化完成后，由调度器重新出发事件。
  let allowReplay = true;
  // 是否启用根侦听器
  if (enableEagerRootListeners) {
    // TODO: replaying capture phase events is currently broken
    // because we used to do it during top-level native bubble handlers
    // but now we use different bubble and capture handlers.
    // In eager mode, we attach capture listeners early, so we need
    // to filter them out until we fix the logic to handle them correctly.
    // This could've been outside the flag but I put it inside to reduce risk.

    // 翻译：重放广播阶段事件目前被破坏了，
    // 因为我们曾经在顶级原生冒泡处理程序期间执行此操作，但现在我们使用不同的冒泡和广播处理程序。
    // 在 Eager 模式下，我们会提前附加捕获侦听器，因此我们需要将它们过滤掉，直到我们修复逻辑以正确处理它们。
    // 这可能在标记之外，但我把它放在里面以降低风险。

    // 是否是广播时捕获事件
    allowReplay = (eventSystemFlags & IS_CAPTURE_PHASE) === 0;
  }
  if (
    // 允许重放
    allowReplay &&
    // 是否有离散事件队列
    // 注意这个判断(下文的源码注释说明)，如果队列中存在数据，证明上一次执行的时候，
    // 已经发现直接触发事件被阻塞然后塞入等待队列了。
    hasQueuedDiscreteEvents() &&
    // 是可重放的离散事件
    // 下面事件之一：
    // 'mousedown', 'mouseup', 'touchcancel', 'touchend', 'touchstart', 'auxclick', 'dblclick',
    // 'pointercancel', 'pointerdown', 'pointerup', 'dragend', 'dragstart', 'drop', 'compositionend',
    // 'compositionstart', 'keydown', 'keypress', 'keyup', 'input', 'textInput',
    // 'copy', 'cut', 'paste', 'click', 'change', 'contextmenu', 'reset', 'submit',
    isReplayableDiscreteEvent(/* 事件名 */domEventName)
  ) {
    // If we already have a queue of discrete events, and this is another discrete
    // event, then we can't dispatch it regardless of its target, since they
    // need to dispatch in order.

    // 翻译：
    // 如果我们已经有一个离散事件队列，并且这是另一个离散事件，那么无论它的目标如何，我们都无法调度它，因为它们需要按顺序调度。

    // 将当前的离散事件放入全局等待执行的离散事件队列中，等待后续执行
    queueDiscreteEvent(
      // Flags that we're not actually blocked on anything as far as we know.
      // 翻译：据我们所知，我们实际上并没有在任何事情上被阻止的标志。
      null,
      // 事件名
      domEventName,
      // 事件系统标记，为一些二进制值，进行多标记计算
      // => 0
      eventSystemFlags,
      // 需要添加时间的dom节点
      // => 基本为react挂在的节点
      targetContainer,
      // 原生事件对象
      nativeEvent,
    );
    // 结束执行
    return;
  }

  // 尝试触发单个事件
  // 在某些情况下，触发事件会失败，此时返回边界dom节点
  // - 在Suspense组件内的渲染
  // - ssr渲染
  // 所以blockedOn为不执行时返回的边界dom节点
  const blockedOn = attemptToDispatchEvent(
    // 事件名
    domEventName,
    // 事件系统标记，为一些二进制值，进行多标记计算
    // => 0
    eventSystemFlags,
    // 需要添加时间的dom节点
    // => 基本为react挂在的节点
    targetContainer,
    // 原生事件对象
    nativeEvent,
  );

  // 如果没有阻塞的dom节点，证明执行过事件
  // 此时就要进行一些数据清理
  if (blockedOn === null) {
    // We successfully dispatched this event.
    // 翻译：我们成功发送了这个事件。

    // 清理以前被阻塞时的一些可以重复的事件列表
    // 此次之行事件应该都已经触发，所以清空
    if (allowReplay) {
      // 可以重复触发(延缓触发)的连续事件队列中清除这个事件
      // 连续事件(Continuous)指的是会组合触发的事件，如dragenter, dragleave这种组合
      clearIfContinuousEvent(domEventName, nativeEvent);
    }
    return;
  }

  // 被阻塞，但是支持重放(延后触发)的事件，进行队列存储，等待调度器执行
  if (allowReplay) {
    // 是可重放的事件
    if (isReplayableDiscreteEvent(domEventName)) {
      // This this to be replayed later once the target is available.
      // 翻译：一旦目标可用，这将在稍后重播。

      // 将当前的离散事件放入队列中，等待后续重复执行
      queueDiscreteEvent(
        blockedOn,
        domEventName,
        eventSystemFlags,
        targetContainer,
        nativeEvent,
      );
      return;
    }
    // 压入连续可重复事件队列成功
    if (
      // 压入连续事件队列
      // 只有事件focusin，dragenter，mouseover，pointerover，gotpointercapture组合事件开始时事件可以压入成功，其他会失败
      queueIfContinuousEvent(
        blockedOn,
        domEventName,
        eventSystemFlags,
        targetContainer,
        nativeEvent,
      )
    ) {
      return;
    }
    // We need to clear only if we didn't queue because
    // queueing is accummulative.

    // 翻译：仅当我们没有排队时才需要清除，因为排队是累积的。

    // 当压入队列不成功时，在可重复的离散事件队列中清除这个事件
    // 主要是清除当一个连续事件在到结束后，需要清除这个事件的保存的开始事件
    clearIfContinuousEvent(domEventName, nativeEvent);
  }

  // This is not replayable so we'll invoke it but without a target,
  // in case the event system needs to trace it.

  // 翻译：这是不可重放的，所以我们将调用它但没有目标，以防事件系统需要跟踪它。

  // 如果是不可以重放的事件，再次强制触发事件
  dispatchEventForPluginEventSystem(
    domEventName,
    eventSystemFlags,
    nativeEvent,
    null,
    targetContainer,
  );
}

// Attempt dispatching an event. Returns a SuspenseInstance or Container if it's blocked.
// 翻译：
// 尝试调度事件。 如果被阻塞，则返回 SuspenseInstance 或 Container。

// 尝试触发事件
// 在某些情况下，不会进行执行事件，且返回边界dom节点
// - 在Suspense组件内的渲染
// - ssr渲染
export function attemptToDispatchEvent(
  // 事件名
  domEventName: DOMEventName,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags: EventSystemFlags,
  // 需要添加时间的dom节点
  // => 基本为react挂在的节点
  targetContainer: EventTarget,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
): null | Container | SuspenseInstance {
  // Warn if _enabled is false.

  // 获取原生事件中的目标元素
  const nativeEventTarget = getEventTarget(nativeEvent);
  // 获取原生事件中目标元素中最近的fiber节点对象
  let targetInst = getClosestInstanceFromNode(nativeEventTarget);

  // 如果存在实例
  if (targetInst !== null) {
    // 获取最近的被挂载的fiber对象
    const nearestMounted = getNearestMountedFiber(targetInst);
    // 最近的被挂载的fiber对象不存在
    if (nearestMounted === null) {
      // This tree has been unmounted already. Dispatch without a target.
      // 这棵fiber节点树已经被卸载了。 没有目标的去调用事件了。
      targetInst = null;
    } /* 最近的被挂载的fiber对象存在 */else {
      // 被挂载fiber对象的标签，基本相当于react元素的类型, 扩展了一些内部类型
      const tag = nearestMounted.tag;
      // 如果是内置Suspense组件
      if (tag === SuspenseComponent) {
        // 从fiber对象中获取Suspense实例(一个注释节点)
        // fiber.memoizedState.dehydrated
        const instance = getSuspenseInstanceFromFiber(nearestMounted);
        // 如果存在实例
        if (instance !== null) {
          // Queue the event to be replayed later. Abort dispatching since we
          // don't want this event dispatched twice through the event system.
          // TODO： If this is the first discrete event in the queue. Schedule an increased
          // priority for this boundary.

          // 翻译：排队等待稍后重播的事件。 中止分派，因为我们不希望通过事件系统分派此事件两次。
          // 如果这是队列中的第一个离散事件。 为此边界安排更高的优先级。

          return instance;
        }
        // This shouldn't happen, something went wrong but to avoid blocking
        // the whole system, dispatch the event without a target.
        // TODO：Warn.

        // 翻译： 这不应该发生，出了点问题，但为了避免阻塞整个系统，在没有目标的情况下分派事件。
        // 不应该出现没有实例的情况

        targetInst = null;
      } /** 如果是跟节点 */ else if (tag === HostRoot) {
        // 拿到fiber跟节点对应的组件实例，也就是FiberRoot对象
        const root: FiberRoot = nearestMounted.stateNode;
        // 如果是ssr渲染
        if (root.hydrate) {
          // If this happens during a replay something went wrong and it might block
          // the whole system.
          // 翻译：如果在回放过程中发生这种情况，就会出现问题，并且可能会阻塞整个系统。

          // 从fiber跟节点对象中获取挂载的dom节点
          return getContainerFromFiber(nearestMounted);
        }
        targetInst = null;
      } /* 如果哦最近的挂载的fiber节点不等于事件目标对应的fiber节点 */else if (nearestMounted !== targetInst) {
        // If we get an event (ex: img onload) before committing that
        // component's mount, ignore it for now (that is, treat it as if it was an
        // event on a non-React tree). We might also consider queueing events and
        // dispatching them after the mount.

        // 翻译：
        // 如果我们在提交该组件的挂载之前收到一个事件（例如：img onload），
        // 请暂时忽略它（也就是说，将其视为非 React 树上的事件）。
        // 我们还可以考虑将事件排队并在挂载后调度它们。

        targetInst = null;
      }
    }
  }
  // 在事件插件系统中调用事件
  dispatchEventForPluginEventSystem(
    // 事件名
    domEventName,
    // 事件系统标记，为一些二进制值，进行多标记计算
    // => 0
    eventSystemFlags,
    // 原生事件对象
    nativeEvent,
    // 需要操作的fiber对象
    targetInst,
    // 需要添加时间的dom节点
    // => 基本为react挂在的节点
    targetContainer,
  );
  // We're not blocked on anything.
  // 翻译 我们在任何事情上都没有被阻止。
  return null;
}
