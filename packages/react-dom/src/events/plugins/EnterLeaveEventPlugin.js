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

import {registerDirectEvent} from '../EventRegistry';
import {IS_REPLAYED} from 'react-dom/src/events/EventSystemFlags';
import {SyntheticMouseEvent, SyntheticPointerEvent} from '../SyntheticEvent';
import {
  getClosestInstanceFromNode,
  getNodeFromInstance,
  isContainerMarkedAsRoot,
} from '../../client/ReactDOMComponentTree';
import {accumulateEnterLeaveTwoPhaseListeners} from '../DOMPluginEventSystem';
import type {KnownReactSyntheticEvent} from '../ReactSyntheticEventType';

import {HostComponent, HostText} from 'react-reconciler/src/ReactWorkTags';
import {getNearestMountedFiber} from 'react-reconciler/src/ReactFiberTreeReflection';

function registerEvents() {
  registerDirectEvent('onMouseEnter', ['mouseout', 'mouseover']);
  registerDirectEvent('onMouseLeave', ['mouseout', 'mouseover']);
  registerDirectEvent('onPointerEnter', ['pointerout', 'pointerover']);
  registerDirectEvent('onPointerLeave', ['pointerout', 'pointerover']);
}

/**
 * For almost every interaction we care about, there will be both a top-level
 * `mouseover` and `mouseout` event that occurs. Only use `mouseout` so that
 * we do not extract duplicate events. However, moving the mouse into the
 * browser from outside will not fire a `mouseout` event. In this case, we use
 * the `mouseover` top-level event.
 */

// 处理事件
function extractEvents(
  // 事件待触发队列
  dispatchQueue: DispatchQueue,
  // 事件名
  domEventName: DOMEventName,
  // 需要操作的fiber对象
  targetInst: null | Fiber,
  // 原生事件对象
  nativeEvent: AnyNativeEvent,
  // 原生的事件触发对象
  nativeEventTarget: null | EventTarget,
  // 事件系统标记，为一些二进制值，进行多标记计算 ==> 0
  eventSystemFlags: EventSystemFlags,
  // 委派事件的dom节点，也就是实际监听事件的节点  ==> 基本为react挂在的节点
  targetContainer: EventTarget,
) {
  // 是否鼠标进入元素事件
  const isOverEvent =
    domEventName === 'mouseover' || domEventName === 'pointerover';
  // 是否鼠标移出原属事件
  const isOutEvent =
    domEventName === 'mouseout' || domEventName === 'pointerout';

  // 如果是鼠标移入事件
  if (isOverEvent && (eventSystemFlags & IS_REPLAYED) === 0) {
    // If this is an over event with a target, we might have already dispatched
    // the event in the out event of the other target. If this is replayed,
    // then it's because we couldn't dispatch against this target previously
    // so we have to do it now instead.

    // 翻译:
    // 如果这是一个带有目标的 over 事件，
    //  我们可能已经在另一个目标的 out 事件中分派了该事件。
    // 如果这被重放，那是因为我们之前无法调度这个目标，所以我们现在必须这样做。

    // 获取相关联的dom节点,如果是从A移出进入B元素上，那么B就是此时的related，事件中的target是A
    const related =
      (nativeEvent: any).relatedTarget || (nativeEvent: any).fromElement;
    if (related) {
      // If the related node is managed by React, we can assume that we have
      // already dispatched the corresponding events during its mouseout.
      // 翻译:
      // 如果相关节点由 React 管理，我们可以假设我们已经在其 mouseout 期间调度了相应的事件。

      // 判断related节点是否已经被react处理了
      if (
        // 包裹在某个fiber节点下
        // TODO: getClosestInstanceFromNode
        getClosestInstanceFromNode(related) ||
        // 或者是一个root容器
        // TODO: isContainerMarkedAsRoot
        isContainerMarkedAsRoot(related)
      ) {
        return;
      }
    }
  }

  // 如果不是鼠标移出移入事件，直接返回
  if (!isOutEvent && !isOverEvent) {
    // Must not be a mouse or pointer in or out - ignoring.
    return;
  }

  // 获取原生事件所在的窗口对象
  let win;
  // TODO: why is this nullable in the types but we read from it?
  // 为什么这在类型中可以为空，但我们从中读取？

  // 是否nativeEventTarget就是win对象
  if ((nativeEventTarget: any).window === nativeEventTarget) {
    // `nativeEventTarget` is probably a window object.
    win = nativeEventTarget;
  } else {
    // TODO: Figure out why `ownerDocument` is sometimes undefined in IE8.
    // 翻译: 弄清楚为什么 IE8 中有时未定义 `ownerDocument`。

    // 从事件的文档对象中获取当前win对象
    const doc = (nativeEventTarget: any).ownerDocument;
    if (doc) {
      win = doc.defaultView || doc.parentWindow;
    } else {
      // 如果上面都获取不到，直接等于当前的window对象
      win = window;
    }
  }

  // 存储触发事件的节点对应的fiber节点, 鼠标移出移入是会涉及两个节点，从某个元素移入/移出到另个一个元素
  // 这里的从可以理解为鼠标事件触发时鼠标从哪个元素触发。如移入的话，关联节点就是from。移出，触发节点就是form
  let from;
  // 存储触发事件的关联节点对应的fiber节点。
  // 这里的从可以理解为鼠标事件触发时鼠标最后到哪个元素结束。如移入的话，触发节点就是to，移出，关联节点就是to
  let to;
  // 如果是移出事件
  if (isOutEvent) {
    // 获取相关联的dom节点
    const related = nativeEvent.relatedTarget || (nativeEvent: any).toElement;
    // 指定从哪点
    // 如上面所说，移出，触发节点就是form
    from = targetInst;
    // 指定至节点
    // 如上面所说，移出，关联节点就是to
    // getClosestInstanceFromNode: 获取dom节点中最近的祖先fiber节点
    to = related ? getClosestInstanceFromNode((related: any)) : null;
    // 如果关联的fiber节点村子啊
    if (to !== null) {
      // 获取最近的已经挂在后的fiber节点
      // TODO: getNearestMountedFiber
      const nearestMounted = getNearestMountedFiber(to);
      if (
        // 如果当前关联节点还没有挂在
        to !== nearestMounted ||
        // 且不是原生类型
        // HostComponent: 原生组件，如div
        // HostText: 原生文本
        (to.tag !== HostComponent && to.tag !== HostText)
      ) {
        // 置空to
        to = null;
      }
    }
  } else {
    // Moving to a node from outside the window.
    // 翻译：意味中从从窗口外移动到节点。

    // from 置空
    // 这里安上面所说，如移入的话，关联节点就是from。
    // 但这里设置为null, 应该是如果是正常的移入事件，或走最上面的if分支(if(isOverEvent...))
    from = null;
    // to重新复制为当前fiber节点
    // 如上面所说，移入， 触发节点就是to
    to = targetInst;
  }

  // 如果from 和to相等，则不需要进行特殊处理
  if (from === to) {
    // Nothing pertains to our managed components.
    // 与我们的托管组件无关。
    return;
  }

  // 使用鼠标合成事件类
  let SyntheticEventCtor = SyntheticMouseEvent;
  // 两个事件类型，react的事件处理属性名
  let leaveEventType = 'onMouseLeave';
  let enterEventType = 'onMouseEnter';
  // 事件前缀
  let eventTypePrefix = 'mouse';
  // 如果是指针事件（pointer*）
  if (domEventName === 'pointerout' || domEventName === 'pointerover') {
    // 使用指针合成事件类
    SyntheticEventCtor = SyntheticPointerEvent;
    // 两个事件类型，react的事件处理属性名
    leaveEventType = 'onPointerLeave';
    enterEventType = 'onPointerEnter';
    // 事件前缀
    eventTypePrefix = 'pointer';
  }

  // 设置默认从节点
  // getNodeFromInstance: 根据给的fiber节点获取当前的dom或者text dom节点
  const fromNode = from == null ? win : getNodeFromInstance(from);
  // 设置默认至节点
  const toNode = to == null ? win : getNodeFromInstance(to);

  // 生成一个移出事件对象
  const leave = new SyntheticEventCtor(
    leaveEventType,
    eventTypePrefix + 'leave',
    from,
    nativeEvent,
    nativeEventTarget,
  );
  // 重新设置他们的值
  leave.target = fromNode;
  leave.relatedTarget = toNode;

  // 生成一个进入事件对象
  let enter: KnownReactSyntheticEvent | null = null;

  // We should only process this nativeEvent if we are processing
  // the first ancestor. Next time, we will ignore the event.

  // 翻译:
  // 如果我们正在处理第一个祖先，我们应该只处理这个 nativeEvent。 下一次，我们将忽略该事件。

  // 获取原生事件的目标dom节点最亲近的祖先fiber节点
  const nativeTargetInst = getClosestInstanceFromNode((nativeEventTarget: any));
  // 如果最近的祖先fiber节点不是当前fiber节点
  if (nativeTargetInst === targetInst) {
    // 初始化enter事件
    const enterEvent: KnownReactSyntheticEvent = new SyntheticEventCtor(
      enterEventType,
      eventTypePrefix + 'enter',
      to,
      nativeEvent,
      nativeEventTarget,
    );
    enterEvent.target = toNode;
    enterEvent.relatedTarget = fromNode;
    enter = enterEvent;
  }

  // 收集所有的鼠标移出移入事件的监听器，跟对应的事件对象生成映射关系放入委托队列中
  accumulateEnterLeaveTwoPhaseListeners(dispatchQueue, leave, enter, from, to);
}

export {registerEvents, extractEvents};
