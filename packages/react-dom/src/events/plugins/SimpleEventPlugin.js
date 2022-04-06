/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {DOMEventName} from '../../events/DOMEventNames';
import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';
import type {AnyNativeEvent} from '../../events/PluginModuleType';
import type {DispatchQueue} from '../DOMPluginEventSystem';
import type {EventSystemFlags} from '../EventSystemFlags';

import {
  SyntheticEvent,
  SyntheticKeyboardEvent,
  SyntheticFocusEvent,
  SyntheticMouseEvent,
  SyntheticDragEvent,
  SyntheticTouchEvent,
  SyntheticAnimationEvent,
  SyntheticTransitionEvent,
  SyntheticUIEvent,
  SyntheticWheelEvent,
  SyntheticClipboardEvent,
  SyntheticPointerEvent,
} from '../../events/SyntheticEvent';

import {
  ANIMATION_END,
  ANIMATION_ITERATION,
  ANIMATION_START,
  TRANSITION_END,
} from '../DOMEventNames';
import {
  topLevelEventsToReactNames,
  registerSimpleEvents,
} from '../DOMEventProperties';
import {
  accumulateSinglePhaseListeners,
  accumulateEventHandleNonManagedNodeListeners,
} from '../DOMPluginEventSystem';
import {IS_EVENT_HANDLE_NON_MANAGED_NODE} from '../EventSystemFlags';

import getEventCharCode from '../getEventCharCode';
import {IS_CAPTURE_PHASE} from '../EventSystemFlags';

import {enableCreateEventHandleAPI} from 'shared/ReactFeatureFlags';

// 抽取事件
function extractEvents(
  // 事件待触发队列
  dispatchQueue: DispatchQueue,
  // 事件名
  domEventName: DOMEventName,
  // 需要操作的fiber对象
  targetInst: null | Fiber,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
  // 得到原生的事件触发对象
  nativeEventTarget: null | EventTarget,
  // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
  eventSystemFlags: EventSystemFlags,
  // 需要添加事件的dom节点  ==> 基本为react挂在的节点
  targetContainer: EventTarget,
): void {
  // 转成react中的事件名，各浏览器存在一些非标准的事件名和处理，这些操作将其处理为标准的
  // TODO: ll topLevelEventsToReactNames.get
  // FIXME: READ_THIS
  const reactName = topLevelEventsToReactNames.get(domEventName);
  // 如果没有对应的react事件名字，那么不需要处理
  if (reactName === undefined) {
    return;
  }
  // 事件对象创建器(类)， 默认为未知情况下，尽量模拟的事件
  // TODO: ll SyntheticEvent 下面阅读几个对应的
  let SyntheticEventCtor = SyntheticEvent;
  // 事件类型，初始值为原生的事件名
  let reactEventType: string = domEventName;
  // 根据时间名，设置不同的事件类型和合成事件处理器
  switch (domEventName) {
    case 'keypress':
      // Firefox creates a keypress event for function keys too. This removes
      // the unwanted keypress events. Enter is however both printable and
      // non-printable. One would expect Tab to be as well (but it isn't).

      // 翻译：
      // Firefox 也会为功能键创建一个按键事件。
      // 这将删除不需要的按键事件。 但是，Enter 既可打印又不可打印。 人们会期望 Tab 也是如此（但事实并非如此）。

      // 过滤Firefox中一些不受期望键盘事件
      if (getEventCharCode(((nativeEvent: any): KeyboardEvent)) === 0) {
        return;
      }
    /* falls through */
    case 'keydown':
    case 'keyup':
      // TODO: ll SyntheticKeyboardEvent
      SyntheticEventCtor = SyntheticKeyboardEvent;
      break;
    case 'focusin':
      reactEventType = 'focus';
      SyntheticEventCtor = SyntheticFocusEvent;
      break;
    case 'focusout':
      reactEventType = 'blur';
      SyntheticEventCtor = SyntheticFocusEvent;
      break;
    case 'beforeblur':
    case 'afterblur':
      SyntheticEventCtor = SyntheticFocusEvent;
      break;
    case 'click':
      // Firefox creates a click event on right mouse clicks. This removes the
      // unwanted click events.

      // 翻译：
      // Firefox 在鼠标右键单击时创建一个单击事件。 这将删除不需要的点击事件。
      if (nativeEvent.button === 2) {
        return;
      }
    /* falls through */
    case 'auxclick':
    case 'dblclick':
    case 'mousedown':
    case 'mousemove':
    case 'mouseup':
    // TODO: Disabled elements should not respond to mouse events
    // 翻译： 禁用的元素不应响应鼠标事件
    /* falls through */
    case 'mouseout':
    case 'mouseover':
    case 'contextmenu':
      SyntheticEventCtor = SyntheticMouseEvent;
      break;
    case 'drag':
    case 'dragend':
    case 'dragenter':
    case 'dragexit':
    case 'dragleave':
    case 'dragover':
    case 'dragstart':
    case 'drop':
      SyntheticEventCtor = SyntheticDragEvent;
      break;
    case 'touchcancel':
    case 'touchend':
    case 'touchmove':
    case 'touchstart':
      SyntheticEventCtor = SyntheticTouchEvent;
      break;
    case ANIMATION_END:
    case ANIMATION_ITERATION:
    case ANIMATION_START:
      SyntheticEventCtor = SyntheticAnimationEvent;
      break;
    case TRANSITION_END:
      SyntheticEventCtor = SyntheticTransitionEvent;
      break;
    case 'scroll':
      // TODO: ll SyntheticKeyboardEvent
      SyntheticEventCtor = SyntheticUIEvent;
      break;
    case 'wheel':
      SyntheticEventCtor = SyntheticWheelEvent;
      break;
    case 'copy':
    case 'cut':
    case 'paste':
      SyntheticEventCtor = SyntheticClipboardEvent;
      break;
    case 'gotpointercapture':
    case 'lostpointercapture':
    case 'pointercancel':
    case 'pointerdown':
    case 'pointermove':
    case 'pointerout':
    case 'pointerover':
    case 'pointerup':
      SyntheticEventCtor = SyntheticPointerEvent;
      break;
    default:
      // Unknown event. This is used by createEventHandle.
      break;
  }

  // 是否在捕获阶段
  const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0;
  // 是否为非托管模式
  if (
    enableCreateEventHandleAPI &&
    eventSystemFlags & IS_EVENT_HANDLE_NON_MANAGED_NODE
  ) {
    // 创建监听器列表（累积非托管模式的事件列表）
    // TODO: ll accumulateEventHandleNonManagedNodeListeners
    const listeners = accumulateEventHandleNonManagedNodeListeners(
      // TODO: this cast may not make sense for events like
      // "focus" where React listens to e.g. "focusin".
      // 翻译：
      // 当react监听`focusin`事件时，不会处罚`focus`事件监听器。

      // 标准的事件名
      ((reactEventType: any): DOMEventName),
      // 需要添加事件的dom节点  ==> 基本为react挂在的节点
      targetContainer,
      // 是否在捕获阶段
      inCapturePhase,
    );
    // 存在监听列表
    if (listeners.length > 0) {
      // Intentionally create event lazily.
      // 翻译：故意懒惰地创建事件。

      // 创建事件
      const event = new SyntheticEventCtor(
        // 事件名
        reactName,
        // 事件类型，原生的事件名
        reactEventType,
        // 需要操作的fiber对象
        null,
        // 原生事件对象
        nativeEvent,
        // 得到原生的事件触发对象
        nativeEventTarget,
      );
      // 存入队列
      dispatchQueue.push({event, listeners});
    }
  } else {
    // 托管模式

    // Some events don't bubble in the browser.
    // In the past, React has always bubbled them, but this can be surprising.
    // We're going to try aligning closer to the browser behavior by not bubbling
    // them in React either. We'll start by not bubbling onScroll, and then expand.

    // 翻译：
    // 有些事件不会在浏览器中冒泡。
    // 过去，React 总是冒泡它们，但这可能不符合期望。
    // 我们将通过不在 React 中冒泡来尝试更接近浏览器行为。
    // 我们将从不冒泡 onScroll 开始，然后展开。

    // 是否仅仅是累积目标
    const accumulateTargetOnly =
      !inCapturePhase &&
      // TODO: ideally, we'd eventually add all events from
      // nonDelegatedEvents list in DOMPluginEventSystem.
      // Then we can remove this special list.
      // This is a breaking change that can wait until React 18.

      // 翻译：
      // 理想情况下，我们最终会在 DOMPluginEventSystem 中添加 nonDelegatedEvents 列表中的所有事件。
      // 然后我们可以删除这个特殊列表。 这是一个可以等到 React 18 的重大更改。
      domEventName === 'scroll';

    // 创建监听列表（积累单阶段监听器）
    // TODO: ll accumulateSinglePhaseListeners
    const listeners = accumulateSinglePhaseListeners(
      targetInst,
      reactName,
      nativeEvent.type,
      inCapturePhase,
      accumulateTargetOnly,
    );
    if (listeners.length > 0) {
      // Intentionally create event lazily.
      // 懒加载创建事件对象
      const event = new SyntheticEventCtor(
        reactName,
        reactEventType,
        null,
        nativeEvent,
        nativeEventTarget,
      );
      dispatchQueue.push({event, listeners});
    }
  }
}

export {registerSimpleEvents as registerEvents, extractEvents};
