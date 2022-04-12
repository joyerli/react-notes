/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {EventPriority} from 'shared/ReactTypes';
import type {DOMEventName} from './DOMEventNames';

import {registerTwoPhaseEvent} from './EventRegistry';
import {
  ANIMATION_END,
  ANIMATION_ITERATION,
  ANIMATION_START,
  TRANSITION_END,
} from './DOMEventNames';
import {
  DiscreteEvent,
  UserBlockingEvent,
  ContinuousEvent,
} from 'shared/ReactTypes';

import {enableCreateEventHandleAPI} from 'shared/ReactFeatureFlags';

// 顶层事件名对应的react名
export const topLevelEventsToReactNames: Map<
  DOMEventName,
  string | null,
> = new Map();

// 事件的优先级
const eventPriorities = new Map();

// We store most of the events in this module in pairs of two strings so we can re-use
// the code required to apply the same logic for event prioritization and that of the
// SimpleEventPlugin. This complicates things slightly, but the aim is to reduce code
// duplication (for which there would be quite a bit). For the events that are not needed
// for the SimpleEventPlugin (otherDiscreteEvents) we process them separately as an
// array of top level events.

// Lastly, we ignore prettier so we can keep the formatting sane.

// 我们将此模块中的大部分事件成对地存储在两个字符串中，
// 因此我们可以重用所需的代码来应用相同的事件优先级逻辑和 SimpleEventPlugin 的逻辑。
//  这会使事情稍微复杂化，但目的是减少代码重复（会有很多重复）。
// 对于 SimpleEventPlugin (otherDiscreteEvents) 不需要的事件，我们将它们作为顶级事件数组单独处理。

// 离散事件
// prettier-ignore
const discreteEventPairsForSimpleEventPlugin = [
  ('cancel': DOMEventName), 'cancel',
  ('click': DOMEventName), 'click',
  ('close': DOMEventName), 'close',
  ('contextmenu': DOMEventName), 'contextMenu',
  ('copy': DOMEventName), 'copy',
  ('cut': DOMEventName), 'cut',
  ('auxclick': DOMEventName), 'auxClick',
  ('dblclick': DOMEventName), 'doubleClick', // Careful!
  ('dragend': DOMEventName), 'dragEnd',
  ('dragstart': DOMEventName), 'dragStart',
  ('drop': DOMEventName), 'drop',
  ('focusin': DOMEventName), 'focus', // Careful!
  ('focusout': DOMEventName), 'blur', // Careful!
  ('input': DOMEventName), 'input',
  ('invalid': DOMEventName), 'invalid',
  ('keydown': DOMEventName), 'keyDown',
  ('keypress': DOMEventName), 'keyPress',
  ('keyup': DOMEventName), 'keyUp',
  ('mousedown': DOMEventName), 'mouseDown',
  ('mouseup': DOMEventName), 'mouseUp',
  ('paste': DOMEventName), 'paste',
  ('pause': DOMEventName), 'pause',
  ('play': DOMEventName), 'play',
  ('pointercancel': DOMEventName), 'pointerCancel',
  ('pointerdown': DOMEventName), 'pointerDown',
  ('pointerup': DOMEventName), 'pointerUp',
  ('ratechange': DOMEventName), 'rateChange',
  ('reset': DOMEventName), 'reset',
  ('seeked': DOMEventName), 'seeked',
  ('submit': DOMEventName), 'submit',
  ('touchcancel': DOMEventName), 'touchCancel',
  ('touchend': DOMEventName), 'touchEnd',
  ('touchstart': DOMEventName), 'touchStart',
  ('volumechange': DOMEventName), 'volumeChange',
];

// 其他离散事件
const otherDiscreteEvents: Array<DOMEventName> = [
  'change',
  'selectionchange',
  'textInput',
  'compositionstart',
  'compositionend',
  'compositionupdate',
];

// 如果开启了createEventHandle特性
if (enableCreateEventHandleAPI) {
  // Special case: these two events don't have on* React handler
  // and are only accessible via the createEventHandle API.

  // 翻译：
  // 特殊事件，这两个事件没有对应的onXXXX对应，只能通过createEventHandle API这个Api对应
  topLevelEventsToReactNames.set('beforeblur', null);
  topLevelEventsToReactNames.set('afterblur', null);
  otherDiscreteEvents.push('beforeblur', 'afterblur');
}

// 用户阻塞事件，术语UI Event
// prettier-ignore
const userBlockingPairsForSimpleEventPlugin: Array<string | DOMEventName> = [
  ('drag': DOMEventName), 'drag',
  ('dragenter': DOMEventName), 'dragEnter',
  ('dragexit': DOMEventName), 'dragExit',
  ('dragleave': DOMEventName), 'dragLeave',
  ('dragover': DOMEventName), 'dragOver',
  ('mousemove': DOMEventName), 'mouseMove',
  ('mouseout': DOMEventName), 'mouseOut',
  ('mouseover': DOMEventName), 'mouseOver',
  ('pointermove': DOMEventName), 'pointerMove',
  ('pointerout': DOMEventName), 'pointerOut',
  ('pointerover': DOMEventName), 'pointerOver',
  ('scroll': DOMEventName), 'scroll',
  ('toggle': DOMEventName), 'toggle',
  ('touchmove': DOMEventName), 'touchMove',
  ('wheel': DOMEventName), 'wheel',
];

// 连续事件
// prettier-ignore
const continuousPairsForSimpleEventPlugin: Array<string | DOMEventName> = [
  ('abort': DOMEventName), 'abort',
  (ANIMATION_END: DOMEventName), 'animationEnd',
  (ANIMATION_ITERATION: DOMEventName), 'animationIteration',
  (ANIMATION_START: DOMEventName), 'animationStart',
  ('canplay': DOMEventName), 'canPlay',
  ('canplaythrough': DOMEventName), 'canPlayThrough',
  ('durationchange': DOMEventName), 'durationChange',
  ('emptied': DOMEventName), 'emptied',
  ('encrypted': DOMEventName), 'encrypted',
  ('ended': DOMEventName), 'ended',
  ('error': DOMEventName), 'error',
  ('gotpointercapture': DOMEventName), 'gotPointerCapture',
  ('load': DOMEventName), 'load',
  ('loadeddata': DOMEventName), 'loadedData',
  ('loadedmetadata': DOMEventName), 'loadedMetadata',
  ('loadstart': DOMEventName), 'loadStart',
  ('lostpointercapture': DOMEventName), 'lostPointerCapture',
  ('playing': DOMEventName), 'playing',
  ('progress': DOMEventName), 'progress',
  ('seeking': DOMEventName), 'seeking',
  ('stalled': DOMEventName), 'stalled',
  ('suspend': DOMEventName), 'suspend',
  ('timeupdate': DOMEventName), 'timeUpdate',
  (TRANSITION_END: DOMEventName), 'transitionEnd',
  ('waiting': DOMEventName), 'waiting',
];

/**
 * Turns
 * ['abort', ...]
 *
 * into
 *
 * topLevelEventsToReactNames = new Map([
 *   ['abort', 'onAbort'],
 * ]);
 *
 * and registers them.
 */
// 将各种类型的事件生成原生事件名和对应的react的事件属性的全局映射对象中
function registerSimplePluginEventsAndSetTheirPriorities(
  // 事件类型泪飙
  eventTypes: Array<DOMEventName | string>,
  // 优先级
  priority: EventPriority,
): void {
  // As the event types are in pairs of two, we need to iterate
  // through in twos. The events are in pairs of two to save code
  // and improve init perf of processing this array, as it will
  // result in far fewer object allocations and property accesses
  // if we only use three arrays to process all the categories of
  // instead of tuples.

  // 翻译：
  // 由于事件类型是成对的，因此我们需要成对地遍历。
  // 这些事件是成对的，以节省代码并提高处理此数组的初始化性能，
  // 因为如果我们只使用三个数组来处理所有类别而不是元组，它将导致对象分配和属性访问少得多。

  // 意思是，为了提高效率，所以eventTypes都是一维数组，偶数下标是原生事件名，奇数下标是react事件名。
  // 所以下面的循环，步进为2
  for (let i = 0; i < eventTypes.length; i += 2) {
    // 原生事件名
    const topEvent = ((eventTypes[i]: any): DOMEventName);
    // react事件名
    const event = ((eventTypes[i + 1]: any): string);
    // react事件名首字母大写
    const capitalizedEvent = event[0].toUpperCase() + event.slice(1);
    // 维护成react的事件属性
    const reactName = 'on' + capitalizedEvent;
    // 设置事件的优先级
    eventPriorities.set(topEvent, priority);
    // 保存在一个原生事件跟react事件属性名映射map中
    topLevelEventsToReactNames.set(topEvent, reactName);
    // 注册事件到冒泡和捕获阶段
    registerTwoPhaseEvent(reactName, [topEvent]);
  }
}

// 注册事件的优先级
function setEventPriorities(
  eventTypes: Array<DOMEventName>,
  priority: EventPriority,
): void {
  for (let i = 0; i < eventTypes.length; i++) {
    eventPriorities.set(eventTypes[i], priority);
  }
}

export function getEventPriorityForPluginSystem(
  domEventName: DOMEventName,
): EventPriority {
  const priority = eventPriorities.get(domEventName);
  // Default to a ContinuousEvent. Note: we might
  // want to warn if we can't detect the priority
  // for the event.
  return priority === undefined ? ContinuousEvent : priority;
}

export function getEventPriorityForListenerSystem(
  type: DOMEventName,
): EventPriority {
  const priority = eventPriorities.get(type);
  if (priority !== undefined) {
    return priority;
  }
  if (__DEV__) {
    console.warn(
      'The event "%s" provided to createEventHandle() does not have a known priority type.' +
        ' This is likely a bug in React.',
      type,
    );
  }
  return ContinuousEvent;
}

// 注册到SimpleEvents
export function registerSimpleEvents() {
  registerSimplePluginEventsAndSetTheirPriorities(
    discreteEventPairsForSimpleEventPlugin,
    DiscreteEvent,
  );
  registerSimplePluginEventsAndSetTheirPriorities(
    userBlockingPairsForSimpleEventPlugin,
    UserBlockingEvent,
  );
  registerSimplePluginEventsAndSetTheirPriorities(
    continuousPairsForSimpleEventPlugin,
    ContinuousEvent,
  );
  // 设置otherDiscreteEvents事件的优先级
  setEventPriorities(otherDiscreteEvents, DiscreteEvent);
}
