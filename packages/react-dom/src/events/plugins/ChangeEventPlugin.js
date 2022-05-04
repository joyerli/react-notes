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

import {registerTwoPhaseEvent} from '../EventRegistry';
import {SyntheticEvent} from '../SyntheticEvent';
import isTextInputElement from '../isTextInputElement';
import {canUseDOM} from 'shared/ExecutionEnvironment';

import getEventTarget from '../getEventTarget';
import isEventSupported from '../isEventSupported';
import {getNodeFromInstance} from '../../client/ReactDOMComponentTree';
import {updateValueIfChanged} from '../../client/inputValueTracking';
import {setDefaultValue} from '../../client/ReactDOMInput';
import {enqueueStateRestore} from '../ReactDOMControlledComponent';

import {disableInputAttributeSyncing} from 'shared/ReactFeatureFlags';
import {batchedUpdates} from '../ReactDOMUpdateBatching';
import {
  processDispatchQueue,
  accumulateTwoPhaseListeners,
} from '../DOMPluginEventSystem';

function registerEvents() {
  registerTwoPhaseEvent('onChange', [
    'change',
    'click',
    'focusin',
    'focusout',
    'input',
    'keydown',
    'keyup',
    'selectionchange',
  ]);
}

// 收集(累积)change事件监听器，并且创建复合事件对象，压入事件委托队列中
function createAndAccumulateChangeEvent(
  // 事件委托队列
  dispatchQueue,
  // 设置事件的fiber实例
  inst,
  // 原生事件
  nativeEvent,
  // 事件的目标dom节点
  target,
) {
  // Flag this event loop as needing state restore.
  // 翻译：将此事件循环标记为需要状态恢复。

  // 压入需要恢复状态的事件队列
  enqueueStateRestore(((target: any): Node));
  // 收集onChange事件的两个阶段（捕获和冒泡）的在节点树上当前节点所有祖先节点对象上所有事件监听器集合
  // 收集成两个角度：
  // 1. 或者每个fiber节点存储的组件属性中事件属性的值为一个监听器
  // 1. fiber节点往父节点遍历获取所有祖先链路上的所有监听器
  const listeners = accumulateTwoPhaseListeners(inst, 'onChange');
  // 如果监听器集合存在
  if (listeners.length > 0) {
    // 创建合成事件对象
    const event = new SyntheticEvent(
      'onChange',
      'change',
      null,
      nativeEvent,
      target,
    );
    // 将监听器集合和事件对象压入委托事件中
    dispatchQueue.push({event, listeners});
  }
}
/**
 * For IE shims
 */
// ie实现input事件的垫片所用
let activeElement = null;
let activeElementInst = null;

/**
 * SECTION: handle `change` event
 */
// 处理change事件
function shouldUseChangeEvent(elem) {
  // 获取当前设置事件的元素的节点名字
  const nodeName = elem.nodeName && elem.nodeName.toLowerCase();
  // 判断是否是select，input[type=file]元素
  return (
    nodeName === 'select' ||
    (nodeName === 'input' && (elem: any).type === 'file')
  );
}

// 手动触发change事件
function manualDispatchChangeEvent(nativeEvent) {
  // 事件委托队列
  const dispatchQueue = [];
  // 收集(累积)change事件监听器，并且创建复合事件对象，压入事件委托队列中
  createAndAccumulateChangeEvent(
    // 事件委托队列
    dispatchQueue,
    // 当前激活元素的实例
    activeElementInst,
    // 原生事件
    nativeEvent,
    // 获取事件中的event target, 事件目标元素
    getEventTarget(nativeEvent),
  );

  // If change and propertychange bubbled, we'd just bind to it like all the
  // other events and have it go through ReactBrowserEventEmitter. Since it
  // doesn't, we manually listen for the events and so we have to enqueue and
  // process the abstract event manually.
  //
  // Batching is necessary here in order to ensure that all event handlers run
  // before the next rerender (including event handlers attached to ancestor
  // elements instead of directly on the input). Without this, controlled
  // components don't work properly in conjunction with event bubbling because
  // the component is rerendered and the value reverted before all the event
  // handlers can run. See https://github.com/facebook/react/issues/708.

  // 翻译：
  // 如果 change 和 propertychange 冒泡，我们只需像所有其他事件一样绑定到它并让它通过 ReactBrowserEventEmitter。
  // 因为它没有，我们手动监听事件，所以我们必须手动排队和处理抽象事件。

  // 批处理是必要的，以确保所有事件处理程序在下一次重新渲染之前运行（包括附加到祖先元素而不是直接在输入上的事件处理程序）。
  // 没有这个，受控组件无法与事件冒泡一起正常工作，因为在所有事件处理程序可以运行之前重新呈现组件并恢复值。
  // 请参阅 https://github.com/facebook/react/issues/708。

  // 批量更新
  batchedUpdates(runEventInBatch, dispatchQueue);
}

// 批量执行事件
function runEventInBatch(dispatchQueue) {
  // 处理事件委托队列
  processDispatchQueue(dispatchQueue, 0);
}

// 获取fiber实例当值发生变化时。
// 当值发生变化，返回传入的targetInst，当没有变化，返回undefined
function getInstIfValueChanged(targetInst: Object) {
  // 获取设置事件的dom节点
  const targetNode = getNodeFromInstance(targetInst);
  // 如果值发生了改变
  if (updateValueIfChanged(((targetNode: any): HTMLInputElement))) {
    return targetInst;
  }
}

// 从change事件中获取目标实例
function getTargetInstForChangeEvent(domEventName: DOMEventName, targetInst) {
  if (domEventName === 'change') {
    return targetInst;
  }
}

/**
 * SECTION: handle `input` event
 */
// 是否支持input事件
let isInputEventSupported = false;
// 如果可以使用dom api
if (canUseDOM) {
  // IE9 claims to support the input event but fails to trigger it when
  // deleting text, so we ignore its input events.
  // 翻译：IE9声称支持输入事件，但在删除文本时无法触发，所以我们忽略了它的输入事件。
  isInputEventSupported =
    isEventSupported('input') &&
    (!document.documentMode || document.documentMode > 9);
}

/**
 * (For IE <=9) Starts tracking propertychange events on the passed-in element
 * and override the value property so that we can distinguish user events from
 * value changes in JS.
 */
// 翻译:
// （对于 IE <=9）开始跟踪传入元素的 propertychange 事件并覆盖 value 属性，以便我们可以区分用户事件和 JS 中的值更改。

// 在ie<=9时，开启onpropertychange的监听来模拟change事件
function startWatchingForValueChange(target, targetInst) {
  // 记录当前激活的元素和实例
  activeElement = target;
  activeElementInst = targetInst;
  (activeElement: any).attachEvent('onpropertychange', handlePropertyChange);
}

/**
 * (For IE <=9) Removes the event listeners from the currently-tracked element,
 * if any exists.
 */
// 翻译：
// （对于 IE <=9）从当前跟踪的元素中删除事件侦听器（如果存在）。

// 停止观察值的变化
function stopWatchingForValueChange() {
  // 如果没有当前激活的元素
  if (!activeElement) {
    return;
  }
  // 触发onpropertychange事件
  (activeElement: any).detachEvent('onpropertychange', handlePropertyChange);
  // 清空激活的元素和fiber实例
  activeElement = null;
  activeElementInst = null;
}

/**
 * (For IE <=9) Handles a propertychange event, sending a `change` event if
 * the value of the active element has changed.
 */
// 翻译：
// （对于 IE <=9）处理 propertychange 事件，如果活动元素的值已更改，则发送一个 `change` 事件。

// 处理onpropertychange事件
function handlePropertyChange(nativeEvent) {
  // 如果不是value属性发生变化
  if (nativeEvent.propertyName !== 'value') {
    return;
  }
  // 如果值发生了变化
  if (getInstIfValueChanged(activeElementInst)) {
    // 手动触发change事件
    manualDispatchChangeEvent(nativeEvent);
  }
}

// 处理在ie8, ie9浏览器下，如何实现input事件的处理
function handleEventsForInputEventPolyfill(
  domEventName: DOMEventName,
  target,
  targetInst,
) {
  // 如果事件名是focusin
  if (domEventName === 'focusin') {
    // In IE9, propertychange fires for most input events but is buggy and
    // doesn't fire when text is deleted, but conveniently, selectionchange
    // appears to fire in all of the remaining cases so we catch those and
    // forward the event if the value has changed
    // In either case, we don't want to call the event handler if the value
    // is changed from JS so we redefine a setter for `.value` that updates
    // our activeElementValue variable, allowing us to ignore those changes
    //
    // stopWatching() should be a noop here but we call it just in case we
    // missed a blur event somehow.

    // 翻译：
    // 在 IE9 中，propertychange 会为大多数输入事件触发，但有问题并且在删除文本时不会触发，
    // 但方便的是，selectionchange 似乎在所有其余情况下都会触发，因此我们捕获这些并在值发生更改时转发事件

    // 在任何一种情况下，如果值从 JS 更改，我们不想调用事件处理程序，
    // 因此我们为 `.value` 重新定义一个 setter 来更新我们的 activeElementValue 变量，
    // 从而允许我们忽略这些更改

    // stopWatching() 在这里应该是一个 noop，但我们称之为以防万一我们以某种方式错过了模糊事件。

    // 停止观察值的变化
    // 注销原生 onpropertychange 事件监听器
    stopWatchingForValueChange();
    // 开始onpropertychange事件监听，用于出发change
    startWatchingForValueChange(target, targetInst);
  } else if (domEventName === 'focusout') {
    // 同上
    stopWatchingForValueChange();
  }
}

// For IE8 and IE9.
// 兼容ie8或者ie9, 事件为selectionchange, keyup, keydown符合目标
function getTargetInstForInputEventPolyfill(
  domEventName: DOMEventName,
  targetInst,
) {
  if (
    domEventName === 'selectionchange' ||
    domEventName === 'keyup' ||
    domEventName === 'keydown'
  ) {
    // On the selectionchange event, the target is just document which isn't
    // helpful for us so just check activeElement instead.
    //
    // 99% of the time, keydown and keyup aren't necessary. IE8 fails to fire
    // propertychange on the first input event after setting `value` from a
    // script and fires only keydown, keypress, keyup. Catching keyup usually
    // gets it and catching keydown lets us fire an event for the first
    // keystroke if user does a key repeat (it'll be a little delayed: right
    // before the second keystroke). Other input methods (e.g., paste) seem to
    // fire selectionchange normally.

    // 翻译:
    // 在 selectionchange 事件中，目标只是对我们没有帮助的document，因此只需检查 activeElement。
    // 99% 的情况下，keydown 和 keyup 是不必要的。
    // 在从脚本设置“值”后，IE8 无法在第一个输入事件上触发 propertychange，并且仅触发 keydown、keypress、keyup。
    // 捕捉 keyup 通常会得到它，如果用户重复按键，捕捉 keydown 可以让我们在第一次击键时触发一个事件（它会有点延迟：就在第二次击键之前）。
    // 其他输入方法（例如粘贴）似乎可以正常触发 selectionchange。

    // 当值发生变化后，返回事件实例，如果没有，返回null
    return getInstIfValueChanged(activeElementInst);
  }
}

/**
 * SECTION: handle `click` event
 */
// 是否可以通过click事件来实现change事件
function shouldUseClickEvent(elem) {
  // Use the `click` event to detect changes to checkbox and radio inputs.
  // This approach works across all browsers, whereas `change` does not fire
  // until `blur` in IE8.

  // 翻译：
  // 使用 `click` 事件来检测复选框和单选输入的更改。
  // 这种方法适用于所有浏览器，而 `change` 直到 IE8 中的 `blur` 才会触发。

  const nodeName = elem.nodeName;
  return (
    nodeName &&
    nodeName.toLowerCase() === 'input' &&
    (elem.type === 'checkbox' || elem.type === 'radio')
  );
}

// 符合click事件时才返回fiber实例
function getTargetInstForClickEvent(domEventName: DOMEventName, targetInst) {
  if (domEventName === 'click') {
    return getInstIfValueChanged(targetInst);
  }
}

// 获取设置事件的fiber实例
// 只有当事件是input或者change事件时，才会返回传入的实例
function getTargetInstForInputOrChangeEvent(
  domEventName: DOMEventName,
  targetInst,
) {
  if (domEventName === 'input' || domEventName === 'change') {
    // 并且需要值发生了改变
    return getInstIfValueChanged(targetInst);
  }
}

// 受控的input[type=number]组件的blur事件后的处理
function handleControlledInputBlur(node: HTMLInputElement) {
  // 存储在dom对象中的状态
  const state = (node: any)._wrapperState;

  // 如果不符合处理条件
  if (!state || !state.controlled || node.type !== 'number') {
    return;
  }

  // 如果开启禁用输入属性同步
  if (!disableInputAttributeSyncing) {
    // If controlled, assign the value attribute to the current value on blur
    // 翻译：如果受控，则将 value 属性分配给 blur 上的当前值

    // 设置默认值
    setDefaultValue((node: any), 'number', (node: any).value);
  }
}

/**
 * This plugin creates an `onChange` event that normalizes change events
 * across form elements. This event fires at a time when it's possible to
 * change the element's value without seeing a flicker.
 *
 * Supported elements are:
 * - input (see `isTextInputElement`)
 * - textarea
 * - select
 */
/**
 * 翻译：这个插件创建了一个“onChange”事件来规范化表单元素的变化事件。
 * 此事件在可以更改元素的值而不会看到闪烁的时候触发。
 *
 * 支持的元素
 * - input
 * - textarea
 * - select
 */

// 抽取时间
function extractEvents(
  // 事件委托触发队列
  dispatchQueue: DispatchQueue,
  // 事件名
  domEventName: DOMEventName,
  // 需要操作的fiber对象, 设置属性所在的fiber对象
  targetInst: null | Fiber,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
  // 得到原生的事件触发对象
  nativeEventTarget: null | EventTarget,
  // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
  eventSystemFlags: EventSystemFlags,
  // 需要添加事件的dom节点  ==> 基本为react挂在的节点
  targetContainer: null | EventTarget,
) {
  // 目标节点，从挂载属性的实例中获取对应的dom，可以理解为设置事件的dom对象，获取不到时为window对象
  const targetNode = targetInst ? getNodeFromInstance(targetInst) : window;

  // 获取目标实例和处理事件的函数
  // getTargetInstFunc可以理解为过滤设置事件的fiber实例函数
  // 如果当前需要处理的事件场景，不符合符合当前插件，getTargetInstFunc函数会返回空，也就是没有目标处理的fiber实例
  let getTargetInstFunc, handleEventFunc;
  // 如果可以使用原生change事件来实现
  // 主要是判断设置事件的dom是否是select，input[type=file]
  if (shouldUseChangeEvent(targetNode)) {
    // 是否是change事件的fiber实例
    // 当事件不是change时，返回null，返回传入实例
    getTargetInstFunc = getTargetInstForChangeEvent;
  }
  // 如果是文本输入元素，利用原生input或者change事件实现
  // 也就是支持change事件的input和textarea元素，
  else if (isTextInputElement(((targetNode: any): HTMLElement))) {
    // 是否支持input事件，浏览器环境判断
    if (isInputEventSupported) {
      // 是否是input或者change事件的fiber实例
      getTargetInstFunc = getTargetInstForInputOrChangeEvent;
    } else {
      // 如果不支持input事件，也就是ie8, ie9浏览器中，当事件符合selectionchange，keyup，keydown会获取实例。
      getTargetInstFunc = getTargetInstForInputEventPolyfill;
      // 特殊的处理change处理函数(通过其他事件模拟的change事件)
      // 通过onpropertychange实现
      handleEventFunc = handleEventsForInputEventPolyfill;
    }
  }
  // 可以使用click事件来实现change事件的情况
  // 当元素是input[type=radio], input[type=checkbox]时，需要click来实现change事件
  else if (shouldUseClickEvent(targetNode)) {
    // 获取符合click场景下的fiber实例
    getTargetInstFunc = getTargetInstForClickEvent;
  }

  // 如果有获取fiber实例的函数
  if (getTargetInstFunc) {
    // 获取到目标实例
    // 获取的逻辑为，当domEventName符合当前插件的处理场景(change事件委托的实现),就返回传入的targetInst示例
    // 也就是可以理解，getTargetInstFunc是一个过滤器，在当前抽取的事件符合change事件的委托时，才会有返回，没有就是空
    const inst = getTargetInstFunc(/* 事件名 */domEventName, /* 需要操作的fiber对象 */ targetInst);

    // 如果存在实例，也就是抽取的事件为change委托相关时
    if (inst) {
      // 创建并且收集(累积)change事件
      createAndAccumulateChangeEvent(
        // 事件委托队列
        dispatchQueue,
        // 目标实例
        inst,
        // 原生事件对象
        nativeEvent,
        // 原生事件目标dom节点
        nativeEventTarget,
      );
      return;
    }
  }

  if (handleEventFunc) {
    // 处理事件函数
    // 该时间只有在兼容ie8, ie9浏览器下input元素不支持change时，调用函数开启onpropertychange事件监听
    handleEventFunc(/* 事件名 */domEventName, /* 目标节点(触发事件的节点) */targetNode, /* 需要操作的fiber对象 */targetInst);
  }

  // When blurring, set the value attribute for number inputs
  // 当失去焦点时，为number输入框设置value属性值

  // https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement
  // Input元素对象中，可以通过js指定默认值，下面的代码就是处理input[type=number]时的特殊情况

  if (domEventName === 'focusout') {
    // 受控的input[type=number]组件的blur事件后的处理
    handleControlledInputBlur(((targetNode: any): HTMLInputElement));
  }
}

export {registerEvents, extractEvents};
