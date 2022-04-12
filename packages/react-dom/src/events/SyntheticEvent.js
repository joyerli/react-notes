/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

/* eslint valid-typeof: 0 */

import getEventCharCode from './getEventCharCode';

type EventInterfaceType = {
  [propName: string]: 0 | ((event: {[propName: string]: mixed}) => mixed),
};

function functionThatReturnsTrue() {
  return true;
}

function functionThatReturnsFalse() {
  return false;
}

// This is intentionally a factory so that we have different returned constructors.
// If we had a single constructor, it would be megamorphic and engines would deopt.

// 翻译：
// 这是一个工厂，所以我们有不同的返回构造函数。 如果我们只有一个构造函数，它将是超多态的，并且引擎将停止使用。

// 这是一个创造合成事件对象构造函数的工厂函数
function createSyntheticEvent(Interface: EventInterfaceType) {
  /**
   * Synthetic events are dispatched by event plugins, typically in response to a
   * top-level event delegation handler.
   *
   * These systems should generally use pooling to reduce the frequency of garbage
   * collection. The system should check `isPersistent` to determine whether the
   * event should be released into the pool after being dispatched. Users that
   * need a persisted event should invoke `persist`.
   *
   * Synthetic events (and subclasses) implement the DOM Level 3 Events API by
   * normalizing browser quirks. Subclasses do not necessarily have to implement a
   * DOM interface; custom application-specific events can also subclass this.
   */

  // 翻译：
  // 合成事件由事件插件调度，通常是为了响应顶级事件委托处理程序。
  //
  // 这些系统通常应该使用池来减少垃圾收集的频率。
  // 系统应该检查 `isPersistent` 以确定事件在被调度后是否应该释放到池中。 需要持久事件的用户应该调用 `persist`。
  //
  // 合成事件（和子类）通过规范化浏览器怪癖来实现 DOM 3 级事件 API。
  // 子类不一定要实现 DOM 接口； 自定义应用程序特定的事件也可以继承它。

  // 合成事件百度结果：
  // 我们在react中操作的DOM事件，获取到的事件对象，其实是react内部帮我们合成的。
  // 为了节约性能，会使用对象池，当一个合成事件对象被使用完毕，即同步代码实现完毕后，会再次调用并且将其属性全部设为Null，
  // 所以当我们异步访问或者打印时，显示的属性值已经是null值。

  // 合成事件的基础构造函数
  function SyntheticBaseEvent(
    // react事件名，为onXXX
    reactName: string | null,
    // react的事件类型，原生事件名
    reactEventType: string,
    // 对应的fiber对象
    targetInst: Fiber,
    // 原生事件对象
    nativeEvent: {[propName: string]: mixed},
    // 原生事件的目标dom节点
    nativeEventTarget: null | EventTarget,
  ) {
    this._reactName = reactName;
    this._targetInst = targetInst;
    this.type = reactEventType;
    this.nativeEvent = nativeEvent;
    this.target = nativeEventTarget;
    this.currentTarget = null;

    // 变量接口自带属性
    for (const propName in Interface) {
      if (!Interface.hasOwnProperty(propName)) {
        continue;
      }
      // 获取属性定制函数
      const normalize = Interface[propName];
      // 如果有，定制
      if (normalize) {
        this[propName] = normalize(nativeEvent);
      } else {
        // 没有，使用时间对象原有值
        this[propName] = nativeEvent[propName];
      }
    }

    // 设置isDefaultPrevented
    // defaultPrevented代表当前事件是否调用了 event.preventDefault()的方法
    const defaultPrevented =
      nativeEvent.defaultPrevented != null
        ? nativeEvent.defaultPrevented
        : nativeEvent.returnValue === false;
    // 设置isDefaultPrevented的默认值
    if (defaultPrevented) {
      // 永远返回true的函数
      this.isDefaultPrevented = functionThatReturnsTrue;
    } else {
      // 永远返回false的函数
      this.isDefaultPrevented = functionThatReturnsFalse;
    }
    // 将事件是否执行停止冒泡(stopPropagation)设置为默认永远返回false
    // TODO: ll 这里为什么不考虑原生的事件已经被停止冒泡过了呢，为什么defaultPrevented要判断
    this.isPropagationStopped = functionThatReturnsFalse;
    return this;
  }

  // 是这对象的属性
  Object.assign(SyntheticBaseEvent.prototype, {
    // 事件的preventDefault属性，代理原生事件的改函数，浏览器兼容
    // 原生preventDefault的含义为：告诉用户代理不要处理事件的默认浏览器行为（如链接点击跳转）
    preventDefault: function() {
      // 设置defaultPrevented的值
      this.defaultPrevented = true;
      // 获取原生事件事件
      const event = this.nativeEvent;
      // 没有对应原生事件，结束
      if (!event) {
        return;
      }

      // 如果事件支持preventDefault函数
      if (event.preventDefault) {
        // 调用
        event.preventDefault();
        // $FlowFixMe - flow is not aware of `unknown` in IE
        // 处理ie等页数浏览器中使用returnValue的情况
      } else if (typeof event.returnValue !== 'unknown') {
        event.returnValue = false;
      }
      // 设置对应的isDefaultPrevented
      this.isDefaultPrevented = functionThatReturnsTrue;
    },

    // 设置停止冒泡逻辑，代理原生的停止冒泡，浏览器兼容
    //
    stopPropagation: function() {
      // 没有对应的原生事件对象，直接结束
      const event = this.nativeEvent;
      if (!event) {
        return;
      }

      if (event.stopPropagation) {
        // 调用事件的原有
        event.stopPropagation();
        // $FlowFixMe - flow is not aware of `unknown` in IE
        // ie等古老浏览器的非标准停止冒泡方式
      } else if (typeof event.cancelBubble !== 'unknown') {
        // The ChangeEventPlugin registers a "propertychange" event for
        // IE. This event does not support bubbling or cancelling, and
        // any references to cancelBubble throw "Member not found".  A
        // typeof check of "unknown" circumvents this issue (and is also
        // IE specific).
        // 翻译：
        // ChangeEventPlugin 为 IE 注册一个“propertychange”事件。
        // 此事件不支持冒泡或取消，任何对 cancelBubble 的引用都会抛出“未找到成员”。
        // “未知”的 typeof 检查绕过了这个问题（并且也是 IE 特定的）。
        event.cancelBubble = true;
      }

      // 设置isPropagationStopped属性
      this.isPropagationStopped = functionThatReturnsTrue;
    },

    /**
     * We release all dispatched `SyntheticEvent`s after each event loop, adding
     * them back into the pool. This allows a way to hold onto a reference that
     * won't be added back into the pool.
     */
    // 翻译：
    // 我们在每个事件循环之后释放所有已调度的 SyntheticEvent，将它们添加回池中。 这允许一种方法来保留不会添加回池中的引用。

    // 意思是老api,当前版本其实没用
    persist: function() {
      // Modern event system doesn't use pooling.
      // 翻译：现代浏览器不需要
    },

    /**
     * Checks if this event should be released back into the pool.
     *
     * 检查是否应将此事件释放回池中。
     *
     * @return {boolean} True if this should not be released, false otherwise.
     *
     * 如果不应该释放，则为 true，否则为 false。
     */
    isPersistent: functionThatReturnsTrue,
  });

  return SyntheticBaseEvent;
}

/**
 * @interface Event
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
// Event事件接口
// 设置为0时，获取原生值
// 设置为函数时，进行定制
const EventInterface = {
  eventPhase: 0,
  bubbles: 0,
  cancelable: 0,
  timeStamp: function(event) {
    return event.timeStamp || Date.now();
  },
  defaultPrevented: 0,
  isTrusted: 0,
};

// 创造一个合成事件创造器
// TODO: createSyntheticEvent
export const SyntheticEvent = createSyntheticEvent(EventInterface);

const UIEventInterface: EventInterfaceType = {
  ...EventInterface,
  view: 0,
  detail: 0,
};
export const SyntheticUIEvent = createSyntheticEvent(UIEventInterface);

let lastMovementX;
let lastMovementY;
let lastMouseEvent;

function updateMouseMovementPolyfillState(event) {
  if (event !== lastMouseEvent) {
    if (lastMouseEvent && event.type === 'mousemove') {
      lastMovementX = event.screenX - lastMouseEvent.screenX;
      lastMovementY = event.screenY - lastMouseEvent.screenY;
    } else {
      lastMovementX = 0;
      lastMovementY = 0;
    }
    lastMouseEvent = event;
  }
}

/**
 * @interface MouseEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
const MouseEventInterface: EventInterfaceType = {
  ...UIEventInterface,
  screenX: 0,
  screenY: 0,
  clientX: 0,
  clientY: 0,
  pageX: 0,
  pageY: 0,
  ctrlKey: 0,
  shiftKey: 0,
  altKey: 0,
  metaKey: 0,
  getModifierState: getEventModifierState,
  button: 0,
  buttons: 0,
  relatedTarget: function(event) {
    if (event.relatedTarget === undefined)
      return event.fromElement === event.srcElement
        ? event.toElement
        : event.fromElement;

    return event.relatedTarget;
  },
  movementX: function(event) {
    if ('movementX' in event) {
      return event.movementX;
    }
    updateMouseMovementPolyfillState(event);
    return lastMovementX;
  },
  movementY: function(event) {
    if ('movementY' in event) {
      return event.movementY;
    }
    // Don't need to call updateMouseMovementPolyfillState() here
    // because it's guaranteed to have already run when movementX
    // was copied.
    return lastMovementY;
  },
};
export const SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface);

/**
 * @interface DragEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
const DragEventInterface: EventInterfaceType = {
  ...MouseEventInterface,
  dataTransfer: 0,
};
export const SyntheticDragEvent = createSyntheticEvent(DragEventInterface);

/**
 * @interface FocusEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
const FocusEventInterface: EventInterfaceType = {
  ...UIEventInterface,
  relatedTarget: 0,
};
export const SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface);

/**
 * @interface Event
 * @see http://www.w3.org/TR/css3-animations/#AnimationEvent-interface
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AnimationEvent
 */
const AnimationEventInterface: EventInterfaceType = {
  ...EventInterface,
  animationName: 0,
  elapsedTime: 0,
  pseudoElement: 0,
};
export const SyntheticAnimationEvent = createSyntheticEvent(
  AnimationEventInterface,
);

/**
 * @interface Event
 * @see http://www.w3.org/TR/clipboard-apis/
 */
const ClipboardEventInterface: EventInterfaceType = {
  ...EventInterface,
  clipboardData: function(event) {
    return 'clipboardData' in event
      ? event.clipboardData
      : window.clipboardData;
  },
};
export const SyntheticClipboardEvent = createSyntheticEvent(
  ClipboardEventInterface,
);

/**
 * @interface Event
 * @see http://www.w3.org/TR/DOM-Level-3-Events/#events-compositionevents
 */
const CompositionEventInterface: EventInterfaceType = {
  ...EventInterface,
  data: 0,
};
export const SyntheticCompositionEvent = createSyntheticEvent(
  CompositionEventInterface,
);

/**
 * @interface Event
 * @see http://www.w3.org/TR/2013/WD-DOM-Level-3-Events-20131105
 *      /#events-inputevents
 */
// Happens to share the same list for now.
export const SyntheticInputEvent = SyntheticCompositionEvent;

/**
 * Normalization of deprecated HTML5 `key` values
 * @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent#Key_names
 */
const normalizeKey = {
  Esc: 'Escape',
  Spacebar: ' ',
  Left: 'ArrowLeft',
  Up: 'ArrowUp',
  Right: 'ArrowRight',
  Down: 'ArrowDown',
  Del: 'Delete',
  Win: 'OS',
  Menu: 'ContextMenu',
  Apps: 'ContextMenu',
  Scroll: 'ScrollLock',
  MozPrintableKey: 'Unidentified',
};

/**
 * Translation from legacy `keyCode` to HTML5 `key`
 * Only special keys supported, all others depend on keyboard layout or browser
 * @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent#Key_names
 */
const translateToKey = {
  '8': 'Backspace',
  '9': 'Tab',
  '12': 'Clear',
  '13': 'Enter',
  '16': 'Shift',
  '17': 'Control',
  '18': 'Alt',
  '19': 'Pause',
  '20': 'CapsLock',
  '27': 'Escape',
  '32': ' ',
  '33': 'PageUp',
  '34': 'PageDown',
  '35': 'End',
  '36': 'Home',
  '37': 'ArrowLeft',
  '38': 'ArrowUp',
  '39': 'ArrowRight',
  '40': 'ArrowDown',
  '45': 'Insert',
  '46': 'Delete',
  '112': 'F1',
  '113': 'F2',
  '114': 'F3',
  '115': 'F4',
  '116': 'F5',
  '117': 'F6',
  '118': 'F7',
  '119': 'F8',
  '120': 'F9',
  '121': 'F10',
  '122': 'F11',
  '123': 'F12',
  '144': 'NumLock',
  '145': 'ScrollLock',
  '224': 'Meta',
};

/**
 * @param {object} nativeEvent Native browser event.
 * @return {string} Normalized `key` property.
 */
function getEventKey(nativeEvent) {
  if (nativeEvent.key) {
    // Normalize inconsistent values reported by browsers due to
    // implementations of a working draft specification.

    // FireFox implements `key` but returns `MozPrintableKey` for all
    // printable characters (normalized to `Unidentified`), ignore it.
    const key = normalizeKey[nativeEvent.key] || nativeEvent.key;
    if (key !== 'Unidentified') {
      return key;
    }
  }

  // Browser does not implement `key`, polyfill as much of it as we can.
  if (nativeEvent.type === 'keypress') {
    const charCode = getEventCharCode(nativeEvent);

    // The enter-key is technically both printable and non-printable and can
    // thus be captured by `keypress`, no other non-printable key should.
    return charCode === 13 ? 'Enter' : String.fromCharCode(charCode);
  }
  if (nativeEvent.type === 'keydown' || nativeEvent.type === 'keyup') {
    // While user keyboard layout determines the actual meaning of each
    // `keyCode` value, almost all function keys have a universal value.
    return translateToKey[nativeEvent.keyCode] || 'Unidentified';
  }
  return '';
}

/**
 * Translation from modifier key to the associated property in the event.
 * @see http://www.w3.org/TR/DOM-Level-3-Events/#keys-Modifiers
 */
const modifierKeyToProp = {
  Alt: 'altKey',
  Control: 'ctrlKey',
  Meta: 'metaKey',
  Shift: 'shiftKey',
};

// Older browsers (Safari <= 10, iOS Safari <= 10.2) do not support
// getModifierState. If getModifierState is not supported, we map it to a set of
// modifier keys exposed by the event. In this case, Lock-keys are not supported.
function modifierStateGetter(keyArg) {
  const syntheticEvent = this;
  const nativeEvent = syntheticEvent.nativeEvent;
  if (nativeEvent.getModifierState) {
    return nativeEvent.getModifierState(keyArg);
  }
  const keyProp = modifierKeyToProp[keyArg];
  return keyProp ? !!nativeEvent[keyProp] : false;
}

function getEventModifierState(nativeEvent) {
  return modifierStateGetter;
}

/**
 * @interface KeyboardEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
const KeyboardEventInterface = {
  ...UIEventInterface,
  key: getEventKey,
  code: 0,
  location: 0,
  ctrlKey: 0,
  shiftKey: 0,
  altKey: 0,
  metaKey: 0,
  repeat: 0,
  locale: 0,
  getModifierState: getEventModifierState,
  // Legacy Interface
  charCode: function(event) {
    // `charCode` is the result of a KeyPress event and represents the value of
    // the actual printable character.

    // KeyPress is deprecated, but its replacement is not yet final and not
    // implemented in any major browser. Only KeyPress has charCode.
    if (event.type === 'keypress') {
      return getEventCharCode(event);
    }
    return 0;
  },
  keyCode: function(event) {
    // `keyCode` is the result of a KeyDown/Up event and represents the value of
    // physical keyboard key.

    // The actual meaning of the value depends on the users' keyboard layout
    // which cannot be detected. Assuming that it is a US keyboard layout
    // provides a surprisingly accurate mapping for US and European users.
    // Due to this, it is left to the user to implement at this time.
    if (event.type === 'keydown' || event.type === 'keyup') {
      return event.keyCode;
    }
    return 0;
  },
  which: function(event) {
    // `which` is an alias for either `keyCode` or `charCode` depending on the
    // type of the event.
    if (event.type === 'keypress') {
      return getEventCharCode(event);
    }
    if (event.type === 'keydown' || event.type === 'keyup') {
      return event.keyCode;
    }
    return 0;
  },
};
export const SyntheticKeyboardEvent = createSyntheticEvent(
  KeyboardEventInterface,
);

/**
 * @interface PointerEvent
 * @see http://www.w3.org/TR/pointerevents/
 */
const PointerEventInterface = {
  ...MouseEventInterface,
  pointerId: 0,
  width: 0,
  height: 0,
  pressure: 0,
  tangentialPressure: 0,
  tiltX: 0,
  tiltY: 0,
  twist: 0,
  pointerType: 0,
  isPrimary: 0,
};
export const SyntheticPointerEvent = createSyntheticEvent(
  PointerEventInterface,
);

/**
 * @interface TouchEvent
 * @see http://www.w3.org/TR/touch-events/
 */
const TouchEventInterface = {
  ...UIEventInterface,
  touches: 0,
  targetTouches: 0,
  changedTouches: 0,
  altKey: 0,
  metaKey: 0,
  ctrlKey: 0,
  shiftKey: 0,
  getModifierState: getEventModifierState,
};
export const SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface);

/**
 * @interface Event
 * @see http://www.w3.org/TR/2009/WD-css3-transitions-20090320/#transition-events-
 * @see https://developer.mozilla.org/en-US/docs/Web/API/TransitionEvent
 */
const TransitionEventInterface = {
  ...EventInterface,
  propertyName: 0,
  elapsedTime: 0,
  pseudoElement: 0,
};
export const SyntheticTransitionEvent = createSyntheticEvent(
  TransitionEventInterface,
);

/**
 * @interface WheelEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
const WheelEventInterface = {
  ...MouseEventInterface,
  deltaX(event) {
    return 'deltaX' in event
      ? event.deltaX
      : // Fallback to `wheelDeltaX` for Webkit and normalize (right is positive).
      'wheelDeltaX' in event
      ? -event.wheelDeltaX
      : 0;
  },
  deltaY(event) {
    return 'deltaY' in event
      ? event.deltaY
      : // Fallback to `wheelDeltaY` for Webkit and normalize (down is positive).
      'wheelDeltaY' in event
      ? -event.wheelDeltaY
      : // Fallback to `wheelDelta` for IE<9 and normalize (down is positive).
      'wheelDelta' in event
      ? -event.wheelDelta
      : 0;
  },
  deltaZ: 0,

  // Browsers without "deltaMode" is reporting in raw wheel delta where one
  // notch on the scroll is always +/- 120, roughly equivalent to pixels.
  // A good approximation of DOM_DELTA_LINE (1) is 5% of viewport size or
  // ~40 pixels, for DOM_DELTA_SCREEN (2) it is 87.5% of viewport size.
  deltaMode: 0,
};
export const SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface);
