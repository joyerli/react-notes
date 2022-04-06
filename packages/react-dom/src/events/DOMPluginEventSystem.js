/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {DOMEventName} from './DOMEventNames';
import {
  type EventSystemFlags,
  SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE,
  IS_LEGACY_FB_SUPPORT_MODE,
  SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS,
} from './EventSystemFlags';
import type {AnyNativeEvent} from './PluginModuleType';
import type {
  KnownReactSyntheticEvent,
  ReactSyntheticEvent,
} from './ReactSyntheticEventType';
import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';

import {registrationNameDependencies, allNativeEvents} from './EventRegistry';
import {
  IS_CAPTURE_PHASE,
  IS_EVENT_HANDLE_NON_MANAGED_NODE,
  IS_NON_DELEGATED,
} from './EventSystemFlags';

import {
  HostRoot,
  HostPortal,
  HostComponent,
  HostText,
  ScopeComponent,
} from 'react-reconciler/src/ReactWorkTags';

import getEventTarget from './getEventTarget';
import {
  getClosestInstanceFromNode,
  getEventListenerSet,
  getEventHandlerListeners,
} from '../client/ReactDOMComponentTree';
import {COMMENT_NODE} from '../shared/HTMLNodeType';
import {batchedEventUpdates} from './ReactDOMUpdateBatching';
import getListener from './getListener';
import {passiveBrowserEventsSupported} from './checkPassiveEvents';

import {
  enableLegacyFBSupport,
  enableCreateEventHandleAPI,
  enableScopeAPI,
  enableEagerRootListeners,
} from 'shared/ReactFeatureFlags';
import {
  invokeGuardedCallbackAndCatchFirstError,
  rethrowCaughtError,
} from 'shared/ReactErrorUtils';
import {DOCUMENT_NODE} from '../shared/HTMLNodeType';
import {createEventListenerWrapperWithPriority} from './ReactDOMEventListener';
import {
  removeEventListener,
  addEventCaptureListener,
  addEventBubbleListener,
  addEventBubbleListenerWithPassiveFlag,
  addEventCaptureListenerWithPassiveFlag,
} from './EventListener';
import * as BeforeInputEventPlugin from './plugins/BeforeInputEventPlugin';
import * as ChangeEventPlugin from './plugins/ChangeEventPlugin';
import * as EnterLeaveEventPlugin from './plugins/EnterLeaveEventPlugin';
import * as SelectEventPlugin from './plugins/SelectEventPlugin';
import * as SimpleEventPlugin from './plugins/SimpleEventPlugin';

type DispatchListener = {|
  instance: null | Fiber,
  listener: Function,
  currentTarget: EventTarget,
|};

type DispatchEntry = {|
  event: ReactSyntheticEvent,
  listeners: Array<DispatchListener>,
|};

export type DispatchQueue = Array<DispatchEntry>;

// TODO: remove top-level side effect.
SimpleEventPlugin.registerEvents();
EnterLeaveEventPlugin.registerEvents();
ChangeEventPlugin.registerEvents();
SelectEventPlugin.registerEvents();
BeforeInputEventPlugin.registerEvents();

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
) {
  // TODO: we should remove the concept of a "SimpleEventPlugin".
  // This is the basic functionality of the event system. All
  // the other plugins are essentially polyfills. So the plugin
  // should probably be inlined somewhere and have its logic
  // be core the to event system. This would potentially allow
  // us to ship builds of React without the polyfilled plugins below.

  // 翻译：
  // 我们应该删除“SimpleEventPlugin”的概念。这是事件系统的基本功能。
  // 所有其他插件本质上都是 polyfills。 所以插件可能应该被内联到某个地方，并且它的逻辑是事件系统的核心。
  // 这可能允许我们在没有下面的 polyfill 插件的情况下发布 React 构建。

  // TODO: ll 在SimpleEventPlugin插件系统中抽取事件
  // FIXME: 下沉 14
  // SimpleEventPlugin 可以理解为通用的处理逻辑
  SimpleEventPlugin.extractEvents(
    // 事件待触发队列
    dispatchQueue,
    // 事件名
    domEventName,
    // 需要操作的fiber对象
    targetInst,
    // 原生事件对象
    nativeEvent,
    // 得到原生的事件触发对象
    nativeEventTarget,
    // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
    eventSystemFlags,
    // 需要添加事件的dom节点  ==> 基本为react挂在的节点
    targetContainer,
  );
  // 是否是需要处理的Polyfill事件系统
  const shouldProcessPolyfillPlugins =
    (eventSystemFlags & SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS) === 0;
  // We don't process these events unless we are in the
  // event's native "bubble" phase, which means that we're
  // not in the capture phase. That's because we emulate
  // the capture phase here still. This is a trade-off,
  // because in an ideal world we would not emulate and use
  // the phases properly, like we do with the SimpleEvent
  // plugin. However, the plugins below either expect
  // emulation (EnterLeave) or use state localized to that
  // plugin (BeforeInput, Change, Select). The state in
  // these modules complicates things, as you'll essentially
  // get the case where the capture phase event might change
  // state, only for the following bubble event to come in
  // later and not trigger anything as the state now
  // invalidates the heuristics of the event plugin. We
  // could alter all these plugins to work in such ways, but
  // that might cause other unknown side-effects that we
  // can't forsee right now.

  // 翻译:
  // 除非我们处于事件的原生的“冒泡”阶段，否则我们不会处理这些事件，这意味着我们不处于捕获阶段。
  // 那是因为我们仍然在这里模拟捕获阶段。
  // 这是一个权衡，因为在理想的世界中，我们不会像使用 SimpleEvent 插件那样正确地模拟和使用阶段。
  // 但是，下面的插件要么期望仿真（EnterLeave），要么使用本地化到该插件的状态（BeforeInput、Change、Select）。
  //  这些模块中的状态使事情变得复杂，因为您基本上会遇到捕获阶段事件可能会更改状态的情况，
  // 只是为了稍后出现以下气泡事件并且不会触发任何事情，因为状态现在使事件插件的启发式无效 .
  // 我们可以改变所有这些插件以这种方式工作，但这可能会导致我们现在无法预见的其他未知副作用。

  // 处理浏览器中非标准事件
  if (shouldProcessPolyfillPlugins) {
    // TODO: ll EnterLeaveEventPlugin.extractEvents
    EnterLeaveEventPlugin.extractEvents(
      // 事件待触发队列
    dispatchQueue,
    // 事件名
    domEventName,
    // 需要操作的fiber对象
    targetInst,
    // 原生事件对象
    nativeEvent,
    // 得到原生的事件触发对象
    nativeEventTarget,
    // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
    eventSystemFlags,
    // 需要添加事件的dom节点  ==> 基本为react挂在的节点
    targetContainer,
    );
    // TODO: ll ChangeEventPlugin.extractEvents
    ChangeEventPlugin.extractEvents(
      // 事件待触发队列
      dispatchQueue,
      // 事件名
      domEventName,
      // 需要操作的fiber对象
      targetInst,
      // 原生事件对象
      nativeEvent,
      // 得到原生的事件触发对象
      nativeEventTarget,
      // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
      eventSystemFlags,
      // 需要添加事件的dom节点  ==> 基本为react挂在的节点
      targetContainer,
    );
    // TODO: ll SelectEventPlugin.extractEvents
    SelectEventPlugin.extractEvents(
      // 事件待触发队列
      dispatchQueue,
      // 事件名
      domEventName,
      // 需要操作的fiber对象
      targetInst,
      // 原生事件对象
      nativeEvent,
      // 得到原生的事件触发对象
      nativeEventTarget,
      // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
      eventSystemFlags,
      // 需要添加事件的dom节点  ==> 基本为react挂在的节点
      targetContainer,
    );
    // TODO: ll BeforeInputEventPlugin.extractEvents
    BeforeInputEventPlugin.extractEvents(
      // 事件待触发队列
      dispatchQueue,
      // 事件名
      domEventName,
      // 需要操作的fiber对象
      targetInst,
      // 原生事件对象
      nativeEvent,
      // 得到原生的事件触发对象
      nativeEventTarget,
      // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
      eventSystemFlags,
      // 需要添加事件的dom节点  ==> 基本为react挂在的节点
      targetContainer,
    );
  }
}

// List of events that need to be individually attached to media elements.
export const mediaEventTypes: Array<DOMEventName> = [
  'abort',
  'canplay',
  'canplaythrough',
  'durationchange',
  'emptied',
  'encrypted',
  'ended',
  'error',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'pause',
  'play',
  'playing',
  'progress',
  'ratechange',
  'seeked',
  'seeking',
  'stalled',
  'suspend',
  'timeupdate',
  'volumechange',
  'waiting',
];

// We should not delegate these events to the container, but rather
// set them on the actual target element itself. This is primarily
// because these events do not consistently bubble in the DOM.
export const nonDelegatedEvents: Set<DOMEventName> = new Set([
  'cancel',
  'close',
  'invalid',
  'load',
  'scroll',
  'toggle',
  // In order to reduce bytes, we insert the above array of media events
  // into this Set. Note: the "error" event isn't an exclusive media event,
  // and can occur on other elements too. Rather than duplicate that event,
  // we just take it from the media events array.
  ...mediaEventTypes,
]);

function executeDispatch(
  event: ReactSyntheticEvent,
  listener: Function,
  currentTarget: EventTarget,
): void {
  const type = event.type || 'unknown-event';
  event.currentTarget = currentTarget;
  invokeGuardedCallbackAndCatchFirstError(type, listener, undefined, event);
  event.currentTarget = null;
}

function processDispatchQueueItemsInOrder(
  event: ReactSyntheticEvent,
  dispatchListeners: Array<DispatchListener>,
  inCapturePhase: boolean,
): void {
  let previousInstance;
  if (inCapturePhase) {
    for (let i = dispatchListeners.length - 1; i >= 0; i--) {
      const {instance, currentTarget, listener} = dispatchListeners[i];
      if (instance !== previousInstance && event.isPropagationStopped()) {
        return;
      }
      executeDispatch(event, listener, currentTarget);
      previousInstance = instance;
    }
  } else {
    for (let i = 0; i < dispatchListeners.length; i++) {
      const {instance, currentTarget, listener} = dispatchListeners[i];
      if (instance !== previousInstance && event.isPropagationStopped()) {
        return;
      }
      executeDispatch(event, listener, currentTarget);
      previousInstance = instance;
    }
  }
}

export function processDispatchQueue(
  dispatchQueue: DispatchQueue,
  eventSystemFlags: EventSystemFlags,
): void {
  const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0;
  for (let i = 0; i < dispatchQueue.length; i++) {
    const {event, listeners} = dispatchQueue[i];
    processDispatchQueueItemsInOrder(event, listeners, inCapturePhase);
    //  event system doesn't use pooling.
  }
  // This would be a good time to rethrow if any of the event handlers threw.
  rethrowCaughtError();
}

// 在插件系统中触发事件
function dispatchEventsForPlugins(
  // 事件名
  domEventName: DOMEventName,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags: EventSystemFlags,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
  // 需要操作的fiber对象
  targetInst: null | Fiber,
  // 需要添加事件的dom节点
  // => 基本为react挂在的节点
  targetContainer: EventTarget,
): void {
  // 得到原生的事件触发对象，该方法浏览器兼容
  const nativeEventTarget = getEventTarget(nativeEvent);
  // 事件待触发队列
  const dispatchQueue: DispatchQueue = [];
  // 抽取事件
  // TODO: extractEvents
  // FIXME: 下沉 13
  extractEvents(
    // 事件待触发队列
    dispatchQueue,
    // 事件名
    domEventName,
    // 需要操作的fiber对象
    targetInst,
    // 原生事件对象
    nativeEvent,
    // 得到原生的事件触发对象
    nativeEventTarget,
    // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
    eventSystemFlags,
    // 需要添加事件的dom节点  ==> 基本为react挂在的节点
    targetContainer,
  );
  // 处理事件队列
  // TODO: processDispatchQueue
  processDispatchQueue(dispatchQueue, eventSystemFlags);
}

export function listenToNonDelegatedEvent(
  domEventName: DOMEventName,
  targetElement: Element,
): void {
  // 冒泡阶段捕获事件
  const isCapturePhaseListener = false;
  const listenerSet = getEventListenerSet(targetElement);
  const listenerSetKey = getListenerSetKey(
    domEventName,
    // 是否广播还是冒泡阶段捕获事件
    isCapturePhaseListener,
  );
  if (!listenerSet.has(listenerSetKey)) {
    addTrappedEventListener(
      targetElement,
      domEventName,
      IS_NON_DELEGATED,
      // 是否广播还是冒泡阶段捕获事件
      isCapturePhaseListener,
    );
    listenerSet.add(listenerSetKey);
  }
}

const listeningMarker =
  '_reactListening' +
  Math.random()
    .toString(36)
    .slice(2);

// 监听所有支持的事件
export function listenToAllSupportedEvents(
  // 监听所有事件的容器dom节点
  // => 挂在节点
  rootContainerElement: EventTarget) {
  // 是否启用容器上监听事件，当前固定为true
  if (enableEagerRootListeners) {
    // 如果已经添加了监听了，直接结束流程
    if ((rootContainerElement: any)[listeningMarker]) {
      // Performance optimization: don't iterate through events
      // for the same portal container or root node more than once.
      // TODO: once we remove the flag, we may be able to also
      // remove some of the bookkeeping maps used for laziness.

      // 翻译：
      // 性能优化：不要多次遍历同一个门户容器或根节点的事件。
      // TODO: 一旦我们删除了标志，我们也许还可以删除一些用于懒惰的簿记地图。

      return;
    }
    // 进行已经处理后的标记，避免重复处理
    (rootContainerElement: any)[listeningMarker] = true;
    // 对所有当前支持的原生事件进行处理
    allNativeEvents.forEach(domEventName => {
      // 根据在冒泡还是广播阶段出发事件，分别执行不同的调用。但其实下面的代码这样写更好
      // listenToNativeEvent(
      //   domEventName,
      //   nonDelegatedEvents.has(domEventName),
      //   ((rootContainerElement: any): Element),
      //   null,
      // );


      if (!nonDelegatedEvents.has(domEventName)) {
        listenToNativeEvent(
          domEventName,
          false,
          ((rootContainerElement: any): Element),
          null,
        );
      }
      // FIXME: 下沉 5
      listenToNativeEvent(
        domEventName,
        true,
        ((rootContainerElement: any): Element),
        null,
      );
    });
  }
}

// 监听一个原生事件
export function listenToNativeEvent(
  // 事件名字
  domEventName: DOMEventName,
  // 是否广播还是冒泡阶段捕获事件
  isCapturePhaseListener: boolean,
  // react挂在的容器dom节点
  rootContainerElement: EventTarget,
  // 目标元素
  // => null
  targetElement: Element | null,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags?: EventSystemFlags = 0,
): void {
  // 目标dom节点，因为rootContainerElement不一定是事件初恋的节点
  let target = rootContainerElement;

  // selectionchange needs to be attached to the document
  // otherwise it won't capture incoming events that are only
  // triggered on the document directly.

  // 翻译
  // selectionchange需要附加到文档，否则它不会捕获仅在文档上直接触发的传入事件。

  // selectionchange 只能在document节点上监听，所以需要特殊处理
  if (
    domEventName === 'selectionchange' &&
    (rootContainerElement: any).nodeType !== DOCUMENT_NODE
  ) {
    // 定位到document节点上去
    target = (rootContainerElement: any).ownerDocument;
  }
  // If the event can be delegated (or is capture phase), we can
  // register it to the root container. Otherwise, we should
  // register the event to the target element and mark it as
  // a non-delegated event.
  if (
    // 如果传入了targetElement参数
    targetElement !== null &&
    // 冒泡阶段监听
    !isCapturePhaseListener &&
    // 不需要委托
    // 当前阅读下来， nonDelegatedEvents.has(domEventName) === isCapturePhaseListener, 所以不会进入这个分支
    nonDelegatedEvents.has(domEventName)
  ) {
    // For all non-delegated events, apart from scroll, we attach
    // their event listeners to the respective elements that their
    // events fire on. That means we can skip this step, as event
    // listener has already been added previously. However, we
    // special case the scroll event because the reality is that any
    // element can scroll.
    // TODO: ideally, we'd eventually apply the same logic to all
    // events from the nonDelegatedEvents list. Then we can remove
    // this special case and use the same logic for all events.

    // 翻译：
    // 对于所有非委托事件，除了滚动之外，我们将它们的事件侦听器附加到它们的事件触发的相应元素上。
    // 这意味着我们可以跳过这一步，因为之前已经添加了事件监听器。
    // 但是，我们对滚动事件进行特殊处理，因为实际情况是任何元素都可以滚动。
    // TODO:
    // 理想情况下，我们最终会对 nonDelegatedEvents 列表中的所有事件应用相同的逻辑。
    // 然后我们可以删除这种特殊情况并对所有事件使用相同的逻辑。

    // 只处理滚动事件
    if (domEventName !== 'scroll') {
      return;
    }
    // eventSystemFlags 中添加 不需要委托的标记
    eventSystemFlags |= IS_NON_DELEGATED;
    // 重置target
    target = targetElement;
  }
  // 得到目标dom节点上已有的监听器集的缓存对象
  // 会根据其他计算然后存储在dom节点上，避免多次重复计算
  const listenerSet = getEventListenerSet(target);
  // 根据特定的规则生成当前事件对应监听器的命名
  const listenerSetKey = getListenerSetKey(
    domEventName,
    // 是否广播还是冒泡阶段捕获事件
    isCapturePhaseListener,
  );
  // If the listener entry is empty or we should upgrade, then
  // we need to trap an event listener onto the target.

  // 翻译：
  // 如果侦听器条目为空或者我们应该升级，那么我们需要将事件侦听器捕获到目标上。

  // 如果元素上的监听器中不包含当前的事件对应需要的key，则监听
  // 防止重复添加
  if (!listenerSet.has(listenerSetKey)) {
    // 添加标记
    if (isCapturePhaseListener) {
      eventSystemFlags |= IS_CAPTURE_PHASE;
    }
    // 添加事件监听器
    // TODO: addTrappedEventListener
    // FIXME: 下沉 6
    addTrappedEventListener(
      target,
      domEventName,
      eventSystemFlags,
      // 是否广播还是冒泡阶段捕获事件
      isCapturePhaseListener,
    );
    // 混存住这个添加的监听器，防止重复添加
    listenerSet.add(listenerSetKey);
  }
}

export function listenToReactEvent(
  reactEvent: string,
  rootContainerElement: Element,
  targetElement: Element | null,
): void {
  if (!enableEagerRootListeners) {
    const dependencies = registrationNameDependencies[reactEvent];
    const dependenciesLength = dependencies.length;
    // If the dependencies length is 1, that means we're not using a polyfill
    // plugin like ChangeEventPlugin, BeforeInputPlugin, EnterLeavePlugin
    // and SelectEventPlugin. We always use the native bubble event phase for
    // these plugins and emulate two phase event dispatching. SimpleEventPlugin
    // always only has a single dependency and SimpleEventPlugin events also
    // use either the native capture event phase or bubble event phase, there
    // is no emulation (except for focus/blur, but that will be removed soon).
    const isPolyfillEventPlugin = dependenciesLength !== 1;

    if (isPolyfillEventPlugin) {
      const listenerSet = getEventListenerSet(rootContainerElement);
      // When eager listeners are off, this Set has a dual purpose: it both
      // captures which native listeners we registered (e.g. "click__bubble")
      // and *React* lazy listeners (e.g. "onClick") so we don't do extra checks.
      // This second usage does not exist in the eager mode.
      if (!listenerSet.has(reactEvent)) {
        listenerSet.add(reactEvent);
        for (let i = 0; i < dependenciesLength; i++) {
          listenToNativeEvent(
            dependencies[i],
            false,
            rootContainerElement,
            targetElement,
          );
        }
      }
    } else {
      const isCapturePhaseListener =
        reactEvent.substr(-7) === 'Capture' &&
        // Edge case: onGotPointerCapture and onLostPointerCapture
        // end with "Capture" but that's part of their event names.
        // The Capture versions would end with CaptureCapture.
        // So we have to check against that.
        // This check works because none of the events we support
        // end with "Pointer".
        reactEvent.substr(-14, 7) !== 'Pointer';
      listenToNativeEvent(
        dependencies[0],
        // 是否广播还是冒泡阶段捕获事件
        isCapturePhaseListener,
        rootContainerElement,
        targetElement,
      );
    }
  }
}

// 添加事件
function addTrappedEventListener(
  // 需要添加时间的dom节点
  // => 基本为react挂在的节点
  targetContainer: EventTarget,
  // 事件名
  domEventName: DOMEventName,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags: EventSystemFlags,
  // 是否广播还是冒泡阶段捕获事件
  isCapturePhaseListener: boolean,
  // 支持旧版脸书使用的延迟侦听器
  // => true
  isDeferredListenerForLegacyFBSupport?: boolean,
) {
  // 创建具有优先级的事件侦听器
  // TODO: => createEventListenerWrapperWithPriority
  // FIXME: 下沉 7
  let listener = createEventListenerWrapperWithPriority(
    // 需要添加时间的dom节点
    // => 基本为react挂在的节点
    targetContainer,
    // 事件名
    domEventName,
    // 事件系统标记，为一些二进制值，进行多标记计算
    // => 0
    eventSystemFlags,
  );
  // If passive option is not supported, then the event will be
  // active and not passive.
  // 翻译: 如果不支持 passive 选项，则事件将为 active 而不是 passive.

  // addEventListener 支持 passive 选项的浏览器有：
  // Not IE; edge >- 16; firefox >= 49; chrome >= 51; safari >= 10; opera >= 38;
  // mdn 关于passive 选项说明(https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget/addEventListener#options)：
  // passive: Boolean，设置为true时，表示 listener 永远不会调用 preventDefault()。
  // 如果 listener 仍然调用了这个函数，客户端将会忽略它并抛出一个控制台警告。查看 使用 passive 改善的滚屏性能 了解更多.

  let isPassiveListener = undefined;
  // 如果当前环境支持使用addEventListener的passive选项
  if (passiveBrowserEventsSupported) {
    // Browsers introduced an intervention, making these events
    // passive by default on document. React doesn't bind them
    // to document anymore, but changing this now would undo
    // the performance wins from the change. So we emulate
    // the existing behavior manually on the roots now.
    // https://github.com/facebook/react/issues/19651

    // 翻译: 浏览器引入了干预，默认情况下这些事件 passive 在文档中。
    // React 不再将它们绑定到文档，
    // 但是现在更改它会取消更改带来的性能优势。 所以我们现在在根上手动模拟现有行为。

    // 意思是，下面这些事件，浏览器默认会开启passive选项来提高性能，所以react模拟实现这个逻辑。
    if (
      domEventName === 'touchstart' ||
      domEventName === 'touchmove' ||
      domEventName === 'wheel'
    ) {
      // 当touchstart，touchmove，wheel事件时，开启passive
      isPassiveListener = true;
    }
  }

  // 做一下脸书内部操作
  targetContainer =
    // enableLegacyFBSupport：在脸书内部网站上支持旧版 Primer
    // isDeferredListenerForLegacyFBSupport(=> undefined) 支持旧版脸书使用的延迟侦听器
    // 如果需要支持脸书的一些旧版本东西
    enableLegacyFBSupport && isDeferredListenerForLegacyFBSupport
      // 则目标节点为html节点
      ? (targetContainer: any).ownerDocument
      // 否则为当前操作的节点
      : targetContainer;

  // 事件监听的取消函数
  let unsubscribeListener;
  // When legacyFBSupport is enabled, it's for when we
  // want to add a one time event listener to a container.
  // This should only be used with enableLegacyFBSupport
  // due to requirement to provide compatibility with
  // internal FB www event tooling. This works by removing
  // the event listener as soon as it is invoked. We could
  // also attempt to use the {once: true} param on
  // addEventListener, but that requires support and some
  // browsers do not support this today, and given this is
  // to support legacy code patterns, it's likely they'll
  // need support for such browsers.

  // 翻译：
  // 当 legacyFBSupport 启用时，它用于我们想要向容器添加一次性事件侦听器。这应该只与 enableLegacyFBSupport 一起使用，
  // 因为需要提供与内部 FB www 事件工具的兼容性。 这通过在调用事件侦听器时立即删除它来工作。
  // 我们也可以尝试在 addEventListener 上使用 {once: true} 参数，但这需要支持，而现在有些浏览器不支持，
  // 鉴于这是为了支持遗留代码模式，他们很可能需要对此类浏览器的支持。

  // 做一下脸书内部操作
  // 不细看
  if (enableLegacyFBSupport && isDeferredListenerForLegacyFBSupport) {
    // 做一下包裹代理
    const originalListener = listener;
    listener = function(...p) {
      removeEventListener(
        targetContainer,
        domEventName,
        unsubscribeListener,
        // 是否广播还是冒泡阶段捕获事件
        isCapturePhaseListener,
      );
      return originalListener.apply(this, p);
    };
  }
  // TODO: There are too many combinations here. Consolidate them.
  // 翻译： 这里的组合太多了。 巩固他们。
  // 意思是，这里需要考虑的情况太多了，后续需要优化代码（确实代码写的很冗余）

  if (
    // 如果需要广播阶段就捕获事件
    isCapturePhaseListener) {
    if (
      // 如果没有设置Passive选项
      isPassiveListener !== undefined) {

      // 添加广播阶段就生效的监听器(Capture选项默认为true)，并设置 Passive 选项
      // TODO: addEventCaptureListenerWithPassiveFlag
      unsubscribeListener = addEventCaptureListenerWithPassiveFlag(
        // 目标节点
        // => 基本为react挂在节点
        targetContainer,
        // 时间名
        domEventName,
        // 监听器
        listener,
        // Passive选项
        isPassiveListener,
      );
    } else {
      // 添加广播阶段就生效的监听器(Capture选项默认为true)
      // TODO: addEventCaptureListener
      unsubscribeListener = addEventCaptureListener(
        targetContainer,
        domEventName,
        listener,
      );
    }
  } else {
    if (
      // 如果需要广播阶段就捕获事件
      isPassiveListener !== undefined) {
      // 添加冒泡阶段就生效的监听器(Capture选项默认为true)，并设置 Passive 选项
      // TODO: addEventBubbleListenerWithPassiveFlag
      unsubscribeListener = addEventBubbleListenerWithPassiveFlag(
        targetContainer,
        domEventName,
        listener,
        isPassiveListener,
      );
    } else {
      // 添加广播阶段就生效的监听器(Capture选项默认为true)
      // TODO: addEventBubbleListener
      unsubscribeListener = addEventBubbleListener(
        targetContainer,
        domEventName,
        listener,
      );
    }
  }
}

// 为了支持老版本FB，延迟在Document对象处理点击事件
function deferClickToDocumentForLegacyFBSupport(
  // 事件名
  domEventName: DOMEventName,
  // 需要添加事件的dom节点
  // => 基本为react挂在的节点
  targetContainer: EventTarget,
): void {
  // We defer all click events with legacy FB support mode on.
  // This means we add a one time event listener to trigger
  // after the FB delegated listeners fire.

  // 谷歌翻译：
  // 我们会延迟所有启用旧版 FB 支持模式的点击事件。 这意味着我们添加了一个一次性事件侦听器以在 FB 委托侦听器触发后触发。

  const isDeferredListenerForLegacyFBSupport = true;

  // 添加事件
  addTrappedEventListener(
    // 需要添加事件的dom节点
    // => 基本为react挂在的节点
    targetContainer,
    // 事件名
    domEventName,
    // 支持传统的fb模式
    IS_LEGACY_FB_SUPPORT_MODE,
    false,
    isDeferredListenerForLegacyFBSupport,
  );
}

// 判断两个dom节点是否为同个
function isMatchingRootContainer(
  // 跟fiber节点对应的dom元素
  grandContainer: Element,
  // 事件目标的dom元素
  targetContainer: EventTarget,
): boolean {
  return (
    // 直接判断它们是否相等
    grandContainer === targetContainer ||
    // 如果grandContainer是注释节点，则判断grandContainer的父节点是否跟targetContainer相等
    (grandContainer.nodeType === COMMENT_NODE &&
      grandContainer.parentNode === targetContainer)
  );
}

// 在事件插件系统中调用事件
export function dispatchEventForPluginEventSystem(
  // 事件名
  domEventName: DOMEventName,
  // 事件系统标记，为一些二进制值，进行多标记计算
  // => 0
  eventSystemFlags: EventSystemFlags,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
  // 需要操作的fiber对象
  targetInst: null | Fiber,
  // 需要添加事件的dom节点
  // => 基本为react挂在的节点
  targetContainer: EventTarget,
): void {
  // 保存一开始的fiber对象
  let ancestorInst = targetInst;
  if (
    // 如果是非托管节点的事件或者非托管的节点
    (eventSystemFlags & IS_EVENT_HANDLE_NON_MANAGED_NODE) === 0 &&
    (eventSystemFlags & IS_NON_DELEGATED) === 0
  ) {
    // 保存容器节点，为dom节点
    const targetContainerNode = ((targetContainer: any): Node);

    // If we are using the legacy FB support flag, we
    // defer the event to the null with a one
    // time event listener so we can defer the event.

    // 翻译
    // 如果我们使用传统的 FB 支持标志，我们使用一次性事件侦听器将事件推迟到 null，以便我们可以推迟事件。

    if (
      // 如果开启传统的fb支持
      enableLegacyFBSupport &&
      // If our event flags match the required flags for entering
      // FB legacy mode and we are prcocessing the "click" event,
      // then we can defer the event to the "document", to allow
      // for legacy FB support, where the expected behavior was to
      // match React < 16 behavior of delegated clicks to the doc.
      // 翻译：
      // 如果当前的标记包含fb的遗留模式，并且实在处理点击事件，
      // 那么采用将事件推迟到document节点上支持来支持fb遗留下来的特性支持，
      // 主要是react少于16的一些期望行为。
      //
      domEventName === 'click' &&
      (eventSystemFlags & SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE) === 0
    ) {
      // 为了支持老版本FB，延迟在Document对象处理点击事件
      deferClickToDocumentForLegacyFBSupport(domEventName, targetContainer);
      return;
    }
    // 如果目标节点不为空
    if (targetInst !== null) {
      // The below logic attempts to work out if we need to change
      // the target fiber to a different ancestor. We had similar logic
      // in the legacy event system, except the big difference between
      // systems is that the modern event system now has an event listener
      // attached to each React Root and React Portal Root. Together,
      // the DOM nodes representing these roots are the "rootContainer".
      // To figure out which ancestor instance we should use, we traverse
      // up the fiber tree from the target instance and attempt to find
      // root boundaries that match that of our current "rootContainer".
      // If we find that "rootContainer", we find the parent fiber
      // sub-tree for that root and make that our ancestor instance.

      // 翻译：
      // 下面的逻辑试图解决我们是否需要将目标Fiber更改为不同的祖先。
      // 主要处理在遗留事件系统中的类似逻辑，
      // 除此之外，新老系统之间的最大区别是现代事件系统现在有一个事件侦听器附加到每个 React Root 和 React Portal Root。
      // 并且这些代表根的dom节点都是“rootContainer”。为了确定应该使用哪个祖先实例，会从目标实例向上遍历fiber树，
      // 并尝试找到与我们当前的“rootContainer”匹配的根边界。
      // 如果我们找到“rootContainer”，我们会找到该根的父 Fiber 子树并将其作为我们的祖先实例。

      // 初始处理fiber节点
      let node = targetInst;

      // 循环处理
      mainLoop: while (true) {
        // 如果节点为空，结束整个函数
        if (node === null) {
          return;
        }

        // fiber节点标签
        const nodeTag = node.tag;
        // 如果是跟节点或者Portal跟节点
        if (nodeTag === HostRoot || nodeTag === HostPortal) {
          // fiber节点对应的状态节点的容器信息
          // 如如果node是HostRoot节点，那么stateNode对应的就是FiberRoot对象， 那么containerInfo代表是挂载的dom节点
          // TODO: 阅读HostPortal节点对应的stateNode.containerInfo含义
          let container = node.stateNode.containerInfo;
          // 容器对象是否是当前的react挂载节点，如果是的话，退出循环
          // isMatchingRootContainer可以理解为直接严格相等判断
          if (isMatchingRootContainer(container, targetContainerNode)) {
            break;
          }
          // 如果节点是HostPortal
          // 下面的逻辑主要是特许处理HostPortal节点向上查找最底层的根节点进行处理
          if (nodeTag === HostPortal) {
            // The target is a portal, but it's not the rootContainer we're looking for.
            // Normally portals handle their own events all the way down to the root.
            // So we should be able to stop now. However, we don't know if this portal
            // was part of *our* root.
            // 谷歌翻译：
            // 目标是 A，但它不是我们要查找的 rootContainer。
            // 通常 A 处理自己的事件一直到根。 所以我们现在应该可以停下来了。
            // 但是，我们不知道这个 A 是否是我们根的一部分。

            // 初始化祖宗节点，初始为节点的父节点
            let grandNode = node.return;
            // 循环获取更高级别的父节点
            while (grandNode !== null) {
              // 祖宗节点的类型
              const grandTag = grandNode.tag;
              // 如果是HostRoot或者HostPortal时
              if (grandTag === HostRoot || grandTag === HostPortal) {
                // 获取对应的dom节点
                const grandContainer = grandNode.stateNode.containerInfo;
                // 如果计算出来的容器dom节点是传入进来dom节点
                // TODO: => isMatchingRootContainer
                if (
                  isMatchingRootContainer(grandContainer, targetContainerNode)
                ) {
                  // This is the rootContainer we're looking for and we found it as
                  // a parent of the Portal. That means we can ignore it because the
                  // Portal will bubble through to us.

                  // 谷歌翻译：
                  // 这是我们正在寻找的 rootContainer，我们发现它是 Portal 的父级。 这意味着我们可以忽略它，因为Portal会冒泡给我们。

                  // 则直接退出函数
                  return;
                }
              }
              // 继续往上查找更高的父节点作为祖宗节点
              grandNode = grandNode.return;
            }
          }
          // Now we need to find it's corresponding host fiber in the other
          // tree. To do this we can use getClosestInstanceFromNode, but we
          // need to validate that the fiber is a host instance, otherwise
          // we need to traverse up through the DOM till we find the correct
          // node that is from the other tree.

          // 谷歌翻译：
          // 现在我们需要在另一棵树中找到它对应的跟Fiber节点。
          //  为此，我们可以使用 getClosestInstanceFromNode，
          // 但我们需要验证Fiber节点是否是跟实例，否则我们需要向上遍历 DOM，直到找到来自另一棵树的正确节点。

          // 下面的逻辑是，如果上面的两种方式还没有找到确认找到的跟容器是传入进来的挂在的dom节点
          // 则进行下面的向上查找方式处理下
          while (container !== null) {
            // 获取dom节点中最近的fiber节点作为父节点
            const parentNode = getClosestInstanceFromNode(container);
            // 如果根节点是空
            if (parentNode === null) {
              // 退出函数
              return;
            }
            // 父节点标签
            const parentTag = parentNode.tag;
            // 如果是HostComponent 或者是HostText 时
            if (parentTag === HostComponent || parentTag === HostText) {
              // 将 node 和 ancestorInst都设置为父节点
              node = ancestorInst = parentNode;
              // 强制跳出内部循环，执行外部循环(那个死循环)其实这里跟直接break效果一致
              continue mainLoop;
            }
            // 将容器(dom节点)设置为当前容器的父节点，从新本渲染
            container = container.parentNode;
          }
        }
        // 设置节点为当前的父节点，重新这个操作
        node = node.return;
      }
    }
  }

  // 批量处理事件更新
  batchedEventUpdates(() =>
    // 在插件事件系统中调度所有事件
    // TODO: => dispatchEventsForPlugins
    // FIXME: 下沉 12
    dispatchEventsForPlugins(
      // 事件名
      domEventName,
      // 事件系统标记，为一些二进制值，进行多标记计算
      // => 0
      eventSystemFlags,
      // 原生事件对象
      nativeEvent,
      // 需要操作的fiber对象
      ancestorInst,
      // 需要添加事件的dom节点
      // => 基本为react挂在的节点
      targetContainer,
    ),
  );
}

function createDispatchListener(
  instance: null | Fiber,
  listener: Function,
  currentTarget: EventTarget,
): DispatchListener {
  return {
    instance,
    listener,
    currentTarget,
  };
}

export function accumulateSinglePhaseListeners(
  targetFiber: Fiber | null,
  reactName: string | null,
  nativeEventType: string,
  inCapturePhase: boolean,
  accumulateTargetOnly: boolean,
): Array<DispatchListener> {
  const captureName = reactName !== null ? reactName + 'Capture' : null;
  const reactEventName = inCapturePhase ? captureName : reactName;
  const listeners: Array<DispatchListener> = [];

  let instance = targetFiber;
  let lastHostComponent = null;

  // Accumulate all instances and listeners via the target -> root path.
  while (instance !== null) {
    const {stateNode, tag} = instance;
    // Handle listeners that are on HostComponents (i.e. <div>)
    if (tag === HostComponent && stateNode !== null) {
      lastHostComponent = stateNode;

      // createEventHandle listeners
      if (enableCreateEventHandleAPI) {
        const eventHandlerListeners = getEventHandlerListeners(
          lastHostComponent,
        );
        if (eventHandlerListeners !== null) {
          eventHandlerListeners.forEach(entry => {
            if (
              entry.type === nativeEventType &&
              entry.capture === inCapturePhase
            ) {
              listeners.push(
                createDispatchListener(
                  instance,
                  entry.callback,
                  (lastHostComponent: any),
                ),
              );
            }
          });
        }
      }

      // Standard React on* listeners, i.e. onClick or onClickCapture
      if (reactEventName !== null) {
        const listener = getListener(instance, reactEventName);
        if (listener != null) {
          listeners.push(
            createDispatchListener(instance, listener, lastHostComponent),
          );
        }
      }
    } else if (
      enableCreateEventHandleAPI &&
      enableScopeAPI &&
      tag === ScopeComponent &&
      lastHostComponent !== null &&
      stateNode !== null
    ) {
      // Scopes
      const reactScopeInstance = stateNode;
      const eventHandlerListeners = getEventHandlerListeners(
        reactScopeInstance,
      );
      if (eventHandlerListeners !== null) {
        eventHandlerListeners.forEach(entry => {
          if (
            entry.type === nativeEventType &&
            entry.capture === inCapturePhase
          ) {
            listeners.push(
              createDispatchListener(
                instance,
                entry.callback,
                (lastHostComponent: any),
              ),
            );
          }
        });
      }
    }
    // If we are only accumulating events for the target, then we don't
    // continue to propagate through the React fiber tree to find other
    // listeners.
    if (accumulateTargetOnly) {
      break;
    }
    instance = instance.return;
  }
  return listeners;
}

// We should only use this function for:
// - BeforeInputEventPlugin
// - ChangeEventPlugin
// - SelectEventPlugin
// This is because we only process these plugins
// in the bubble phase, so we need to accumulate two
// phase event listeners (via emulation).
export function accumulateTwoPhaseListeners(
  targetFiber: Fiber | null,
  reactName: string,
): Array<DispatchListener> {
  const captureName = reactName + 'Capture';
  const listeners: Array<DispatchListener> = [];
  let instance = targetFiber;

  // Accumulate all instances and listeners via the target -> root path.
  while (instance !== null) {
    const {stateNode, tag} = instance;
    // Handle listeners that are on HostComponents (i.e. <div>)
    if (tag === HostComponent && stateNode !== null) {
      const currentTarget = stateNode;
      const captureListener = getListener(instance, captureName);
      if (captureListener != null) {
        listeners.unshift(
          createDispatchListener(instance, captureListener, currentTarget),
        );
      }
      const bubbleListener = getListener(instance, reactName);
      if (bubbleListener != null) {
        listeners.push(
          createDispatchListener(instance, bubbleListener, currentTarget),
        );
      }
    }
    instance = instance.return;
  }
  return listeners;
}

function getParent(inst: Fiber | null): Fiber | null {
  if (inst === null) {
    return null;
  }
  do {
    inst = inst.return;
    // TODO: If this is a HostRoot we might want to bail out.
    // That is depending on if we want nested subtrees (layers) to bubble
    // events to their parent. We could also go through parentNode on the
    // host node but that wouldn't work for React Native and doesn't let us
    // do the portal feature.
  } while (inst && inst.tag !== HostComponent);
  if (inst) {
    return inst;
  }
  return null;
}

/**
 * Return the lowest common ancestor of A and B, or null if they are in
 * different trees.
 */
function getLowestCommonAncestor(instA: Fiber, instB: Fiber): Fiber | null {
  let nodeA = instA;
  let nodeB = instB;
  let depthA = 0;
  for (let tempA = nodeA; tempA; tempA = getParent(tempA)) {
    depthA++;
  }
  let depthB = 0;
  for (let tempB = nodeB; tempB; tempB = getParent(tempB)) {
    depthB++;
  }

  // If A is deeper, crawl up.
  while (depthA - depthB > 0) {
    nodeA = getParent(nodeA);
    depthA--;
  }

  // If B is deeper, crawl up.
  while (depthB - depthA > 0) {
    nodeB = getParent(nodeB);
    depthB--;
  }

  // Walk in lockstep until we find a match.
  let depth = depthA;
  while (depth--) {
    if (nodeA === nodeB || (nodeB !== null && nodeA === nodeB.alternate)) {
      return nodeA;
    }
    nodeA = getParent(nodeA);
    nodeB = getParent(nodeB);
  }
  return null;
}

function accumulateEnterLeaveListenersForEvent(
  dispatchQueue: DispatchQueue,
  event: KnownReactSyntheticEvent,
  target: Fiber,
  common: Fiber | null,
  inCapturePhase: boolean,
): void {
  const registrationName = event._reactName;
  const listeners: Array<DispatchListener> = [];

  let instance = target;
  while (instance !== null) {
    if (instance === common) {
      break;
    }
    const {alternate, stateNode, tag} = instance;
    if (alternate !== null && alternate === common) {
      break;
    }
    if (tag === HostComponent && stateNode !== null) {
      const currentTarget = stateNode;
      if (inCapturePhase) {
        const captureListener = getListener(instance, registrationName);
        if (captureListener != null) {
          listeners.unshift(
            createDispatchListener(instance, captureListener, currentTarget),
          );
        }
      } else if (!inCapturePhase) {
        const bubbleListener = getListener(instance, registrationName);
        if (bubbleListener != null) {
          listeners.push(
            createDispatchListener(instance, bubbleListener, currentTarget),
          );
        }
      }
    }
    instance = instance.return;
  }
  if (listeners.length !== 0) {
    dispatchQueue.push({event, listeners});
  }
}

// We should only use this function for:
// - EnterLeaveEventPlugin
// This is because we only process this plugin
// in the bubble phase, so we need to accumulate two
// phase event listeners.
export function accumulateEnterLeaveTwoPhaseListeners(
  dispatchQueue: DispatchQueue,
  leaveEvent: KnownReactSyntheticEvent,
  enterEvent: null | KnownReactSyntheticEvent,
  from: Fiber | null,
  to: Fiber | null,
): void {
  const common = from && to ? getLowestCommonAncestor(from, to) : null;

  if (from !== null) {
    accumulateEnterLeaveListenersForEvent(
      dispatchQueue,
      leaveEvent,
      from,
      common,
      false,
    );
  }
  if (to !== null && enterEvent !== null) {
    accumulateEnterLeaveListenersForEvent(
      dispatchQueue,
      enterEvent,
      to,
      common,
      true,
    );
  }
}

export function accumulateEventHandleNonManagedNodeListeners(
  reactEventType: DOMEventName,
  currentTarget: EventTarget,
  inCapturePhase: boolean,
): Array<DispatchListener> {
  const listeners: Array<DispatchListener> = [];

  const eventListeners = getEventHandlerListeners(currentTarget);
  if (eventListeners !== null) {
    eventListeners.forEach(entry => {
      if (entry.type === reactEventType && entry.capture === inCapturePhase) {
        listeners.push(
          createDispatchListener(null, entry.callback, currentTarget),
        );
      }
    });
  }
  return listeners;
}

// 根据特定的规则生成监听器命名
export function getListenerSetKey(
  domEventName: DOMEventName,
  capture: boolean,
): string {
  return `${domEventName}__${capture ? 'capture' : 'bubble'}`;
}
