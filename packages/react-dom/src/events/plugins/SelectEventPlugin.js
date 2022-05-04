/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {AnyNativeEvent} from '../PluginModuleType';
import type {DOMEventName} from '../DOMEventNames';
import type {DispatchQueue} from '../DOMPluginEventSystem';
import type {EventSystemFlags} from '../EventSystemFlags';

import {canUseDOM} from 'shared/ExecutionEnvironment';
import {SyntheticEvent} from '../../events/SyntheticEvent';
import isTextInputElement from '../isTextInputElement';
import shallowEqual from 'shared/shallowEqual';
import {enableEagerRootListeners} from 'shared/ReactFeatureFlags';

import {registerTwoPhaseEvent} from '../EventRegistry';
import getActiveElement from '../../client/getActiveElement';
import {
  getNodeFromInstance,
  getEventListenerSet,
} from '../../client/ReactDOMComponentTree';
import {hasSelectionCapabilities} from '../../client/ReactInputSelection';
import {DOCUMENT_NODE} from '../../shared/HTMLNodeType';
import {accumulateTwoPhaseListeners} from '../DOMPluginEventSystem';

const skipSelectionChangeEvent =
  canUseDOM && 'documentMode' in document && document.documentMode <= 11;

function registerEvents() {
  registerTwoPhaseEvent('onSelect', [
    'focusout',
    'contextmenu',
    'dragend',
    'focusin',
    'keydown',
    'keyup',
    'mousedown',
    'mouseup',
    'selectionchange',
  ]);
}

// 当前处理的相关数据
// 设置了获取焦点事件的元素
let activeElement = null;
// 设置了获取焦点事件的fiber对象
let activeElementInst = null;
let lastSelection = null;
let mouseDown = false;

/**
 * Get an object which is a unique representation of the current selection.
 *
 * The return value will not be consistent across nodes or browsers, but
 * two identical selections on the same node will return identical objects.
 */
function getSelection(node: any) {
  if ('selectionStart' in node && hasSelectionCapabilities(node)) {
    return {
      start: node.selectionStart,
      end: node.selectionEnd,
    };
  } else {
    const win =
      (node.ownerDocument && node.ownerDocument.defaultView) || window;
    const selection = win.getSelection();
    return {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    };
  }
}

/**
 * Get document associated with the event target.
 */
function getEventTargetDocument(eventTarget: any) {
  return eventTarget.window === eventTarget
    ? eventTarget.document
    : eventTarget.nodeType === DOCUMENT_NODE
    ? eventTarget
    : eventTarget.ownerDocument;
}

/**
 * Poll selection to see whether it's changed.
 *
 * @param {object} nativeEvent
 * @param {object} nativeEventTarget
 * @return {?SyntheticEvent}
 */

// 翻译：轮询选择以查看它是否已更改。

// 构造选择事件
function constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget) {
  // Ensure we have the right element, and that the user is not dragging a
  // selection (this matches native `select` event behavior). In HTML5, select
  // fires only on input and textarea thus if there's no focused element we
  // won't dispatch.
  // 确保我们有正确的元素，并且用户没有拖动选择（这与原生 `select` 事件行为相匹配）。
  // 在 HTML5 中，select 仅在 input 和 textarea 上触发，因此如果没有焦点元素，我们将不会调度。

  // 获取事件中目标dom节点对象所属的文档对象
  // TODO: ll getEventTargetDocument
  const doc = getEventTargetDocument(nativeEventTarget);

  // 当失去焦点事件，鼠标按下事件，获取焦点事件跟当前触发事件的元素不是同一个文档时，都会立即返回
  if (
    // 原生mousedown事件会设置
    mouseDown ||
    // 激活元素不存在时，当focusout事件发生时，activeElement就会为null
    activeElement == null ||
    // 激活元素（设置了获取焦点的元素）跟目标dom节点不在一个文档对象中
    activeElement !== getActiveElement(doc)
  ) {
    // 都不处理
    return;
  }

  // Only fire when selection has actually changed.
  // 翻译：仅在选择实际更改时触发。
  // TODO: ll getSelection
  // 获取Selection对象
  const currentSelection = getSelection(activeElement);
  // 当前的Selection对象跟缓存的lastSelection是否相等
  // TODO: ll shallowEqual
  if (!lastSelection || !shallowEqual(lastSelection, currentSelection)) {
    // 保存当前的Selection对象
    lastSelection = currentSelection;

    // 收集节点树上当前设置了获取焦点事件的fiber对象在两个阶段的监听器
    const listeners = accumulateTwoPhaseListeners(
      activeElementInst,
      'onSelect',
    );
    if (listeners.length > 0) {
      // 创建合成事件
      const event = new SyntheticEvent(
        'onSelect',
        'select',
        null,
        nativeEvent,
        nativeEventTarget,
      );
      // 压入队列
      dispatchQueue.push({event, listeners});
      event.target = activeElement;
    }
  }
}

/**
 * This plugin creates an `onSelect` event that normalizes select events
 * across form elements.
 *
 * Supported elements are:
 * - input (see `isTextInputElement`)
 * - textarea
 * - contentEditable
 *
 * This differs from native browser implementations in the following ways:
 * - Fires on contentEditable fields as well as inputs.
 * - Fires for collapsed selection.
 * - Fires after user input.
 */

// 翻译：
// 这个插件创建了一个 `onSelect` 事件来规范化跨表单元素的选择事件。
// 支持的元素是：
// - input(阅读`isTextInputElement`,文本输入的input元素，file之类的不包含在内)
// - textarea
// - contentEditable

// 下面这些方面再不同的浏览器上存在不同：
// - 在 contentEditable 字段和输入上触发。
// - 为折叠的选择触发。
// - 在用户输入后触发。

// 浏览器兼容的抽取onSelect相关事件的抽取
function extractEvents(
  // 事件委托队列，抽取到的事件会存放在该队列中
  dispatchQueue: DispatchQueue,
  // 事件原生名字
  domEventName: DOMEventName,
  // 设置事件的fiber实例
  targetInst: null | Fiber,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
  // 原生事件对象中的target目标dom节点
  nativeEventTarget: null | EventTarget,
  // 事件系统标记，捕获或者冒泡阶段
  eventSystemFlags: EventSystemFlags,
  // 目标容器，为当前react挂在节点容器
  targetContainer: EventTarget,
) {
  // 如果没有开启根节点的监听
  if (!enableEagerRootListeners) {
    // 从容器dom节点对象中获取事件的监听器(所有事件的监听器)集合
    const eventListenerSet = getEventListenerSet(targetContainer);
    // Track whether all listeners exists for this plugin. If none exist, we do
    // not extract events. See #3639.
    // 翻译：跟踪此插件是否存在所有侦听器。 如果不存在，我们不提取事件。

    // 如果不是selectionchange事件或者容器节点中不存在onSelect事件监听器，那么直接提取事件
    if (
      // If we are handling selectionchange, then we don't need to
      // check for the other dependencies, as selectionchange is only
      // event attached from the onChange plugin and we don't expose an
      // onSelectionChange event from React.

      // 翻译：
      // 如果我们正在处理 selectionchange，那么我们不需要检查其他依赖项，
      // 因为 selectionchange 只是从 onChange 插件附加的事件，我们不会从 React 公开 onSelectionChange 事件。
      domEventName !== 'selectionchange' &&
      !eventListenerSet.has('onSelect') &&
      !eventListenerSet.has('onSelectCapture')
    ) {
      return;
    }
  }

  // 获取设置监听器的fiber对象对应的dom节点，也就是需要监听事件的dom节点
  const targetNode = targetInst ? getNodeFromInstance(targetInst) : window;

  // 当不支持标准的onSelect事件时，会通过focusin, focusout, mousedown, contextmenu, mouseup, dragend
  // selectionchange, keydown, keyup等事件组合在一起来模拟onSelect事件。

  // 下面的处理，就是实现onSelect洛基吧

  // 原理是：
  // focusin,focusout组合提供onSelect事件的触发dom节点和fiber对象，
  //   也就是会为有onSelect监听器的元素监听它的focusin,focusout事件
  // mousedown: 在鼠标按下去，没有松开之前，都禁止触发onSelect事件
  // contextmenu，mouseup，dragend，selectionchange，keydown，keyup事件触发时，都尝试触发onSelect事件

  // 也就是在抽取focusin事件时的时候，会维护记录。
  // 抽取focusout会清空记录
  // 抽取mousedown时，会禁止onSelect事件的抽取
  // 抽取contextmenu，mouseup，dragend，selectionchange，keydown，keyup事件时，会尝试将一个onChange事件的委托事件也放入在里面
  // 抽取的含义是事件委托节点(一般时react跟节点)在触发该事件时，触发整个react节点树上fiber对象的监听器。

  switch (domEventName) {
    // Track the input node that has focus.
    // 翻译：跟踪具有焦点的输入节点。

    // 获取焦点事件
    case 'focusin':
      if (
        isTextInputElement((targetNode: any)) ||
        targetNode.contentEditable === 'true'
      ) {
        // 存储当前元素, 会在constructSelectEvent事件中使用到
        activeElement = targetNode;
        activeElementInst = targetInst;
        lastSelection = null;
      }
      break;
    // 失去焦点事件
    case 'focusout':
      // 失去焦点时，释放存储值
      activeElement = null;
      activeElementInst = null;
      lastSelection = null;
      break;
    // Don't fire the event while the user is dragging. This matches the
    // semantics of the native select event.
    // 翻译：不要在用户拖动时触发事件。 这与本机选择事件的语义相匹配。
    case 'mousedown':
      // mousedown时不处理，会在constructSelectEvent中处理
      mouseDown = true;
      break;
    case 'contextmenu':
    case 'mouseup':
    case 'dragend':
      mouseDown = false;
      // 构建select事件
      constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
      break;
    // Chrome and IE fire non-standard event when selection is changed (and
    // sometimes when it hasn't). IE's event fires out of order with respect
    // to key and input events on deletion, so we discard it.
    //
    // Firefox doesn't support selectionchange, so check selection status
    // after each key entry. The selection changes after keydown and before
    // keyup, but we check on keydown as well in the case of holding down a
    // key, when multiple keydown events are fired but only one keyup is.
    // This is also our approach for IE handling, for the reason above.

    // 翻译：Chrome 和 IE 会在选择更改时触发非标准事件（有时在未更改时）。
    // IE 的事件在删除时触发的按键和输入事件无序，因此我们将其丢弃。
    //
    // Firefox 不支持 selectionchange，因此请在每个键输入后检查选择状态。
    // 选择在 keydown 之后和 keyup 之前发生变化，但我们也会在按住一个键的情况下检查 keydown，
    // 当触发多个 keydown 事件但只有一个 keyup 时。 由于上述原因，这也是我们处理 IE 的方法。
    case 'selectionchange':
      // skipSelectionChangeEvent： ie版本是否少于11版本
      // 少于ie11则忽略selectionchange的处理
      if (skipSelectionChangeEvent) {
        break;
      }
    // falls through
    case 'keydown':
    case 'keyup':
      constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
  }
}

export {registerEvents, extractEvents};
