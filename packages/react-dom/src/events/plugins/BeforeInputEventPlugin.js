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

import {canUseDOM} from 'shared/ExecutionEnvironment';

import {registerTwoPhaseEvent} from '../EventRegistry';
import {
  getData as FallbackCompositionStateGetData,
  initialize as FallbackCompositionStateInitialize,
  reset as FallbackCompositionStateReset,
} from '../FallbackCompositionState';
import {
  SyntheticCompositionEvent,
  SyntheticInputEvent,
} from '../SyntheticEvent';
import {accumulateTwoPhaseListeners} from '../DOMPluginEventSystem';

const END_KEYCODES = [9, 13, 27, 32]; // Tab, Return, Esc, Space
const START_KEYCODE = 229;

const canUseCompositionEvent = canUseDOM && 'CompositionEvent' in window;

let documentMode = null;
if (canUseDOM && 'documentMode' in document) {
  documentMode = document.documentMode;
}

// Webkit offers a very useful `textInput` event that can be used to
// directly represent `beforeInput`. The IE `textinput` event is not as
// useful, so we don't use it.
const canUseTextInputEvent =
  canUseDOM && 'TextEvent' in window && !documentMode;

// In IE9+, we have access to composition events, but the data supplied
// by the native compositionend event may be incorrect. Japanese ideographic
// spaces, for instance (\u3000) are not recorded correctly.

// 在 IE9+ 中，我们可以访问合成事件，但是原生的 compositionend 事件提供的数据可能不正确。
// 日文表意空格，例如 (\u3000) 未正确记录。

// 是否支持有缺陷的Composition事件模式
const useFallbackCompositionData =
  canUseDOM &&
  (!canUseCompositionEvent ||
    (documentMode && documentMode > 8 && documentMode <= 11));

const SPACEBAR_CODE = 32;
const SPACEBAR_CHAR = String.fromCharCode(SPACEBAR_CODE);

function registerEvents() {
  registerTwoPhaseEvent('onBeforeInput', [
    'compositionend',
    'keypress',
    'textInput',
    'paste',
  ]);
  registerTwoPhaseEvent('onCompositionEnd', [
    'compositionend',
    'focusout',
    'keydown',
    'keypress',
    'keyup',
    'mousedown',
  ]);
  registerTwoPhaseEvent('onCompositionStart', [
    'compositionstart',
    'focusout',
    'keydown',
    'keypress',
    'keyup',
    'mousedown',
  ]);
  registerTwoPhaseEvent('onCompositionUpdate', [
    'compositionupdate',
    'focusout',
    'keydown',
    'keypress',
    'keyup',
    'mousedown',
  ]);
}

// Track whether we've ever handled a keypress on the space key.
let hasSpaceKeypress = false;

/**
 * Return whether a native keypress event is assumed to be a command.
 * This is required because Firefox fires `keypress` events for key commands
 * (cut, copy, select-all, etc.) even though no character is inserted.
 */

// 翻译：
// 返回是否假定本机按键事件是命令。
// 这是必需的，因为即使没有插入字符，Firefox 也会为键命令（剪切、复制、全选等）触发 `keypress` 事件。

// 是否是快捷指令
function isKeypressCommand(nativeEvent: any) {
  return (
    (nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey) &&
    // ctrlKey && altKey is equivalent to AltGr, and is not a command.
    !(nativeEvent.ctrlKey && nativeEvent.altKey)
  );
}

/**
 * Translate native top level events into event types.
 */
// 获取Composition事件类型
// 将原生的事件名映射成react中的on*事件名
function getCompositionEventType(domEventName: DOMEventName) {
  switch (domEventName) {
    case 'compositionstart':
      return 'onCompositionStart';
    case 'compositionend':
      return 'onCompositionEnd';
    case 'compositionupdate':
      return 'onCompositionUpdate';
  }
}

/**
 * Does our fallback best-guess model think this event signifies that
 * composition has begun?
 */
// 翻译：
// 我们的 低版本ie composition 最佳猜测是否认为这个事件意味着 composition 已经开始？

// 低版本ie的composition事件是否开始
// 这里有一个隐藏的知识点是，输入法输入时，原生的键盘事件会一致接受到的键盘码是229
function isFallbackCompositionStart(
  domEventName: DOMEventName,
  nativeEvent: any,
): boolean {
  // 判断指定键位编码的键盘按下事件
  return domEventName === 'keydown' && nativeEvent.keyCode === START_KEYCODE;
}

/**
 * Does our fallback mode think that this event is the end of composition?
 */
// 我们的低版本ie composition是否认为这个事件是composition的结束？

// 判断ie低版本Composition事件是否已经结束
function isFallbackCompositionEnd(
  domEventName: DOMEventName,
  nativeEvent: any,
): boolean {
  // 根据不同的事件名判断
  switch (domEventName) {
    // 监听keyup事件的键位
    case 'keyup':
      // Command keys insert or clear IME input.
      // 命令键插入或清除 IME 输入。

      // 是否是键盘的输入键位编码
      return END_KEYCODES.indexOf(nativeEvent.keyCode) !== -1;
    case 'keydown':
      // Expect IME keyCode on each keydown. If we get any other
      // code we must have exited earlier.
      // 翻译：
      // 每次按键时都需要 IME 键码。 如果我们得到任何其他代码，我们必须更早退出。

      // 当键盘输入的不是输入法输入的键位码的时候，证明已经关闭了输入法
      return nativeEvent.keyCode !== START_KEYCODE;
    case 'keypress':
    case 'mousedown':
    case 'focusout':
      // Events are not possible without cancelling IME.
      // 这些事件是不关闭输入法都无法触发的事件。所以出现这些事件的时候，都可以认为输入法已经关闭
      return true;
    // 其他情况都可以认为输入法还没有关闭
    default:
      return false;
  }
}

/**
 * Google Input Tools provides composition data via a CustomEvent,
 * with the `data` property populated in the `detail` object. If this
 * is available on the event object, use it. If not, this is a plain
 * composition event and we have nothing special to extract.
 *
 * @param {object} nativeEvent
 * @return {?string}
 */

// 翻译：
// Google Input工具通过 CustomEvent 提供合成数据，并在 `detail` 对象中填充了 `data` 属性。 如果这在事件对象上可用，请使用它。
// 如果不是，这是一个简单的组合事件，我们没有什么特别的东西可以提取。
function getDataFromCustomEvent(nativeEvent: any) {
  const detail = nativeEvent.detail;
  if (typeof detail === 'object' && 'data' in detail) {
    return detail.data;
  }
  return null;
}

/**
 * Check if a composition event was triggered by Korean IME.
 * Our fallback mode does not work well with IE's Korean IME,
 * so just use native composition events when Korean IME is used.
 * Although CompositionEvent.locale property is deprecated,
 * it is available in IE, where our fallback mode is enabled.
 *
 * @param {object} nativeEvent
 * @return {boolean}
 */
function isUsingKoreanIME(nativeEvent: any) {
  return nativeEvent.locale === 'ko';
}

// Track the current IME composition status, if any.
// 翻译：跟踪当前的输入法composition事件的状态（如果有）。
let isComposing = false;

/**
 * @return {?object} A SyntheticCompositionEvent.
 */
// 抽取Composition事件
// Composition是一个用户间接输入文本（如使用输入法）时发生的事件
function extractCompositionEvent(
  // 事件委托队列
  dispatchQueue,
  // 原生事件名
  domEventName,
  // 设置事件名的fiber实例
  targetInst,
  // 原生事件对象
  nativeEvent,
  // 原生事件对象的target节点对象
  nativeEventTarget,
) {
  // 事件类型
  let eventType;
  //
  let fallbackData;

  // 如果当前客户端环境可以使用Composition事件
  if (canUseCompositionEvent) {
    // 获取事件类型
    eventType = getCompositionEventType(domEventName);
  }
  // 当前是否不处于模拟的Composition事件过程中
  else if (!isComposing) {
    // 模拟Composition事件是否已经开始
    // 通过键盘按下事件判断
    if (isFallbackCompositionStart(domEventName, nativeEvent)) {
      eventType = 'onCompositionStart';
    }
  }
  // 模拟的Composition事件的是否已经结束
  else if (isFallbackCompositionEnd(domEventName, nativeEvent)) {
    eventType = 'onCompositionEnd';
  }

  // 当前系统不支持的情况下，直接不执行。如ie8
  if (!eventType) {
    return null;
  }

  // 如果是模拟的Composition事件并且不是在使用韩语输入法
  // 注意useFallbackCompositionData代表当前不能使用原生的composition事件.
  if (useFallbackCompositionData && !isUsingKoreanIME(nativeEvent)) {
    // The current composition is stored statically and must not be
    // overwritten while composition continues.
    // 翻译：当前的合成是静态存储的，并且在合成继续时不能被覆盖。

    // 如果当前不处于事件的过程中，且事件类型是onCompositionStart
    if (!isComposing && eventType === 'onCompositionStart') {
      // 初始化模拟的Composition事件， 并设置isComposing的值，标记开始记录Composition事件
      // FallbackCompositionStateInitialize会一致返回true
      isComposing = FallbackCompositionStateInitialize(nativeEventTarget);
    } else if (eventType === 'onCompositionEnd') {
      // 如果是Composition事件过程中，获取事件的值
      if (isComposing) {
        // 获取模拟的Composition事件的data属性，模拟Composition事件的的data属性
        fallbackData = FallbackCompositionStateGetData();
      }
    }
  }

  // 收集两个事件阶段(捕获和冒泡)的事件监听器。
  // 会收集目标fiber对象的祖先节点上所有改事件的监听器。
  // 监听器为fiber对象中存储的组件的属性中的对应事件的属性值。
  const listeners = accumulateTwoPhaseListeners(targetInst, eventType);
  if (listeners.length > 0) {
    // 创建合同事件
    const event = new SyntheticCompositionEvent(
      eventType,
      domEventName,
      null,
      nativeEvent,
      nativeEventTarget,
    );
    // 压入事件委托队列
    dispatchQueue.push({event, listeners});
    // 如果存在模拟的Composition事件的data值
    if (fallbackData) {
      // Inject data generated from fallback path into the synthetic event.
      // This matches the property of native CompositionEventInterface.
      // 翻译：
      // 将模拟的Composition事件生成的数据注入到合成事件中。 保持跟原生的 CompositionEventInterface 属性一致。
      event.data = fallbackData;
    } else {
      // 谷歌浏览器的特殊处理
      // 谷歌浏览器中input通过事件对象的detail传递数据
      const customData = getDataFromCustomEvent(nativeEvent);
      if (customData !== null) {
        event.data = customData;
      }
    }
  }
}

// 获取原生的beforeInput事件的输入值
function getNativeBeforeInputChars(
  domEventName: DOMEventName,
  nativeEvent: any,
): ?string {
  switch (domEventName) {
    // 处理谷歌浏览器中特殊的compositionend事件逻辑
    // 如果是谷歌浏览器，按照谷歌浏览器特定的传递数据方式返回compositionend事件的返回值
    // 此时也触发beforeInput
    case 'compositionend':
      return getDataFromCustomEvent(nativeEvent);
    // 处理chromium浏览器中输入空字符串的问题
    case 'keypress':
      /**
       * If native `textInput` events are available, our goal is to make
       * use of them. However, there is a special case: the spacebar key.
       * In Webkit, preventing default on a spacebar `textInput` event
       * cancels character insertion, but it *also* causes the browser
       * to fall back to its default spacebar behavior of scrolling the
       * page.
       *
       * Tracking at:
       * https://code.google.com/p/chromium/issues/detail?id=355103
       *
       * To avoid this issue, use the keypress event as if no `textInput`
       * event is available.
       */

      // 翻译：
      // 如果原生 `textInput` 事件可用，我们的目标是利用它们。 但是，有一种特殊情况：空格键。
      // 在 Webkit 中，阻止空格键 `textInput` 事件的默认值会取消字符插入，
      // 但它也会导致浏览器回退到其滚动页面的默认空格键行为。

      // 为避免此问题，请使用 keypress 事件，就像没有可用的 `textInput` 事件一样。
      const which = nativeEvent.which;
      if (which !== SPACEBAR_CODE) {
        return null;
      }

      hasSpaceKeypress = true;
      return SPACEBAR_CHAR;
    // 原生的textInput事件就是onBeforeInput事件
    // 但是需要忽略空格输入，因为在上一个keypress已经处理了
    case 'textInput':
      // Record the characters to be added to the DOM.
      // 翻译：记录要添加到 DOM 的字符。

      // 获取原生事件中的数字
      const chars = nativeEvent.data;

      // If it's a spacebar character, assume that we have already handled
      // it at the keypress level and bail immediately. Android Chrome
      // doesn't give us keycodes, so we need to ignore it.

      // 如果它是一个空格字符，假设我们已经在按键级别处理了它并立即保释。
      // Android Chrome 没有给我们键码，所以我们需要忽略它。

      if (chars === SPACEBAR_CHAR && hasSpaceKeypress) {
        return null;
      }

      return chars;

    // 其他事件不符合当前插件场景
    default:
      // For other native event types, do nothing.
      return null;
  }
}

/**
 * For browsers that do not provide the `textInput` event, extract the
 * appropriate string to use for SyntheticInputEvent.
 */

// 翻译：对于不提供 `textInput` 事件的浏览器，请提取适当的字符串以用于 SyntheticInputEvent。

// 获取模拟的beforeInput事件的输入字符
// 模拟的场景：
//   - compositionend事件(不管是不是模拟的 compositionend)，触发beforeInput，数据是compositionend的data
//   - paste 事件，禁止触发beforeInput
//   - keypress 事件，触发beforeInput，数据为按键的键位字符串，但需要过滤命令字符串和特殊处理emoj符号
function getFallbackBeforeInputChars(
  domEventName: DOMEventName,
  nativeEvent: any,
): ?string {
  // If we are currently composing (IME) and using a fallback to do so,
  // try to extract the composed characters from the fallback object.
  // If composition event is available, we extract a string only at
  // compositionevent, otherwise extract it at fallback events.

  // 翻译：
  // 如果我们当前正在输入法(IME)的composing事件来模拟beforeInput操作，请尝试从模拟数据对象中提取组合字符。
  // 如果composition事件可用，我们仅在组合事件中提取字符串，否则在模拟composition事件中提取它。

  // 如果正在使用模拟的composition事件
  if (isComposing) {
    // 模拟的输入法输入事件已经结束
    if (
      domEventName === 'compositionend' ||
      (!canUseCompositionEvent &&
        isFallbackCompositionEnd(domEventName, nativeEvent))
    ) {
      // 获取模拟输入法事件中的返回值
      const chars = FallbackCompositionStateGetData();
      // 模拟输入法事件重置状态
      FallbackCompositionStateReset();
      // 重置处于模拟输入法输入事件中的状态
      isComposing = false;
      return chars;
    }
    return null;
  }

  switch (domEventName) {

    case 'paste':
      // If a paste event occurs after a keypress, throw out the input
      // chars. Paste events should not lead to BeforeInput events.
      // 翻译：如果在按键后发生粘贴事件，则丢弃输入字符。 粘贴事件不应导致 BeforeInput 事件。
      return null;
    // 每次按键结束后
    case 'keypress':
      /**
       * As of v27, Firefox may fire keypress events even when no character
       * will be inserted. A few possibilities:
       *
       * - `which` is `0`. Arrow keys, Esc key, etc.
       *
       * - `which` is the pressed key code, but no char is available.
       *   Ex: 'AltGr + d` in Polish. There is no modified character for
       *   this key combination and no character is inserted into the
       *   document, but FF fires the keypress for char code `100` anyway.
       *   No `input` event will occur.
       *
       * - `which` is the pressed key code, but a command combination is
       *   being used. Ex: `Cmd+C`. No character is inserted, and no
       *   `input` event will occur.
       */

      // 从 v27 开始，即使没有插入字符，Firefox 也可能触发按键事件。 几种可能性：
      // - `which`是`0`。 方向键、Esc 键等
      // - `which` 是按键代码，但没有可用的字符。
      //    例如：波兰语中的“AltGr + d”。
      //    此组合键没有修改字符，也没有字符插入到文档中，但 FF 无论如何都会触发字符代码“100”的按键。
      //    不会发生 `input` 事件。
      // - `which` 是按下的键代码，但正在使用命令组合。 例如：`Cmd+C`。 没有插入字符，也不会发生 `input` 事件。

      // 如果不是命名指令
      if (!isKeypressCommand(nativeEvent)) {
        // IE fires the `keypress` event when a user types an emoji via
        // Touch keyboard of Windows.  In such a case, the `char` property
        // holds an emoji character like `\uD83D\uDE0A`.  Because its length
        // is 2, the property `which` does not represent an emoji correctly.
        // In such a case, we directly return the `char` property instead of
        // using `which`.

        // 翻译：
        // 当用户通过 Windows 的触摸键盘输入表情符号时，IE 会触发 `keypress` 事件。
        // 在这种情况下，`char` 属性包含一个 emoji 字符，例如 `\uD83D\uDE0A`。
        // 因为它的长度是 2，所以属性 `which` 不能正确表示表情符号。
        // 在这种情况下，我们直接返回 `char` 属性而不是使用 `which`。
        if (nativeEvent.char && nativeEvent.char.length > 1) {
          return nativeEvent.char;
        } else if (nativeEvent.which) {
          return String.fromCharCode(nativeEvent.which);
        }
      }
      return null;
    case 'compositionend':
      return useFallbackCompositionData && !isUsingKoreanIME(nativeEvent)
        ? null
        : nativeEvent.data;
    // 默认事件不返回
    default:
      return null;
  }
}

/**
 * Extract a SyntheticInputEvent for `beforeInput`, based on either native
 * `textInput` or fallback behavior.
 *
 * @return {?object} A SyntheticInputEvent.
 */
// 翻译：基于原生 `textInput` 或模拟事件行为，为 `beforeInput` 提取 SyntheticInputEvent。

// 抽取beforeInput事件
function extractBeforeInputEvent(
  // 委托队列
  dispatchQueue,
  // 原生事件名
  domEventName,
  // 设置事件的fiber对象
  targetInst,
  // 原生事件对象
  nativeEvent,
  // 原生事件对象的target节点
  nativeEventTarget,
) {
  let chars;

  // 当前客户端环境释放支持原生的beforeInput事件
  if (canUseTextInputEvent) {
    // 获取原生的beforeInput事件的输入字符列表
    chars = getNativeBeforeInputChars(domEventName, nativeEvent);
  } else {
    // 获取模拟的beforeInput事件的输入字符列表
    chars = getFallbackBeforeInputChars(domEventName, nativeEvent);
  }

  // If no characters are being inserted, no BeforeInput event should
  // be fired.

  // 翻译：如果没有插入字符，则不应触发 BeforeInput 事件。

  if (!chars) {
    return null;
  }

 // 收集两个事件阶段(捕获和冒泡)的事件监听器。
  // 会收集目标fiber对象的祖先节点上所有改事件的监听器。
  // 监听器为fiber对象中存储的组件的属性中的对应事件的属性值。
  const listeners = accumulateTwoPhaseListeners(targetInst, 'onBeforeInput');
  if (listeners.length > 0) {
    // 创建合成事件
    const event = new SyntheticInputEvent(
      'onBeforeInput',
      'beforeinput',
      null,
      nativeEvent,
      nativeEventTarget,
    );
    // 压入队列
    dispatchQueue.push({event, listeners});
    event.data = chars;
  }
}

/**
 * Create an `onBeforeInput` event to match
 * http://www.w3.org/TR/2013/WD-DOM-Level-3-Events-20131105/#events-inputevents.
 *
 * This event plugin is based on the native `textInput` event
 * available in Chrome, Safari, Opera, and IE. This event fires after
 * `onKeyPress` and `onCompositionEnd`, but before `onInput`.
 *
 * `beforeInput` is spec'd but not implemented in any browsers, and
 * the `input` event does not provide any useful information about what has
 * actually been added, contrary to the spec. Thus, `textInput` is the best
 * available event to identify the characters that have actually been inserted
 * into the target node.
 *
 * This plugin is also responsible for emitting `composition` events, thus
 * allowing us to share composition fallback code for both `beforeInput` and
 * `composition` event types.
 */

// 翻译：
// 创建一个 `onBeforeInput` 事件来匹配 http://www.w3.org/TR/2013/WD-DOM-Level-3-Events-20131105/#events-inputevents.
// 此事件插件基于 Chrome、Safari、Opera 和 IE 中可用的原生 `textInput` 事件。
// 此事件在 `onKeyPress` 和 `onCompositionEnd` 之后，但在 `onInput` 之前触发。
// `beforeInput` 是规范的，但没有在任何浏览器中实现，并且 `input` 事件没有提供有关实际添加的任何有用信息，
// 这与规范相反。 因此，`textInput` 是识别实际插入到目标节点中的字符的最佳可用事件。
// 这个插件还负责发出 `composition` 事件，
// 从而允许我们共享 `beforeInput` 和 `composition` 事件类型的组合后备代码。

// 抽取onBeforeInput事件
function extractEvents(
  // 事件委托队列
  dispatchQueue: DispatchQueue,
  // 原生事件名
  domEventName: DOMEventName,
  // 目标fiber对象
  targetInst: null | Fiber,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
  // 原生事件对象中的target节点
  nativeEventTarget: null | EventTarget,
  // 事件系统标记，一般用来标记是捕获还是冒泡阶段
  eventSystemFlags: EventSystemFlags,
  // 目标容器，为挂载节点
  targetContainer: EventTarget,
): void {
  // 抽取Composition事件
  extractCompositionEvent(
    dispatchQueue,
    domEventName,
    targetInst,
    nativeEvent,
    nativeEventTarget,
  );
  // 抽取beforeInput事件
  // beforeInput事件的在当前的支持浏览器中都有一个textInput事件的别名
  extractBeforeInputEvent(
    dispatchQueue,
    domEventName,
    targetInst,
    nativeEvent,
    nativeEventTarget,
  );
}

export {registerEvents, extractEvents};
