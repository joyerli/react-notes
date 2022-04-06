/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';
import type {ReactScopeInstance} from 'shared/ReactTypes';
import type {
  ReactDOMEventHandle,
  ReactDOMEventHandleListener,
} from '../shared/ReactDOMTypes';
import type {
  Container,
  TextInstance,
  Instance,
  SuspenseInstance,
  Props,
} from './ReactDOMHostConfig';

import {
  HostComponent,
  HostText,
  HostRoot,
  SuspenseComponent,
} from 'react-reconciler/src/ReactWorkTags';

import {getParentSuspenseInstance} from './ReactDOMHostConfig';

import invariant from 'shared/invariant';
import {enableScopeAPI} from 'shared/ReactFeatureFlags';

const randomKey = Math.random()
  .toString(36)
  .slice(2);
// 用于在dom对象中保存fiber对象的key
const internalInstanceKey = '__reactFiber$' + randomKey;
// 用于在dom对象中保存props对象的key
const internalPropsKey = '__reactProps$' + randomKey;
// 用于在dom对象中保存作为容器fiber节点（可以理解为fiber根节点）对象的key
const internalContainerInstanceKey = '__reactContainer$' + randomKey;
const internalEventHandlersKey = '__reactEvents$' + randomKey;
const internalEventHandlerListenersKey = '__reactListeners$' + randomKey;
const internalEventHandlesSetKey = '__reactHandles$' + randomKey;

export function precacheFiberNode(
  hostInst: Fiber,
  node: Instance | TextInstance | SuspenseInstance | ReactScopeInstance,
): void {
  (node: any)[internalInstanceKey] = hostInst;
}

// 标记容器元素为root元素：将fiber根节点存储到当前dom根容器元素中
export function markContainerAsRoot(
  // 一个Fiber对象，当前是一个Fiber Root对象对应的Fiber对象
  hostRoot: Fiber,
  // 挂在dom节点
  node: Container): void {
  // internalContainerInstanceKey为__reactContainer$加一个随机数
  // 将当前fiber对象存储在dom节点对象上
  node[internalContainerInstanceKey] = hostRoot;
}

export function unmarkContainerAsRoot(node: Container): void {
  node[internalContainerInstanceKey] = null;
}

// 是否是通过ReactDOM.createRoot()创建的节点
export function isContainerMarkedAsRoot(node: Container): boolean {
  return !!node[internalContainerInstanceKey];
}

// Given a DOM node, return the closest HostComponent or HostText fiber ancestor.
// If the target node is part of a hydrated or not yet rendered subtree, then
// this may also return a SuspenseComponent or HostRoot to indicate that.
// Conceptually the HostRoot fiber is a child of the Container node. So if you
// pass the Container node as the targetNode, you will not actually get the
// HostRoot back. To get to the HostRoot, you need to pass a child of it.
// The same thing applies to Suspense boundaries.

// 翻译：给定一个 DOM 节点，返回最近的 HostComponent 或 HostText Fiber祖先。 如果目标节点是hydrated子树或尚未渲染的子树的一部分，
// 那么这也可能返回一个 SuspenseComponent 或 HostRoot 来表明这一点。
//  从概念上讲，HostRoot Fiber对象是 Container 节点的子节点。
// 因此，如果您将 Container 节点作为 targetNode 传递，
// 您实际上不会得到 HostRoot。 要访问 HostRoot，您需要传递它的一个子节点。 同样的事情也适用于悬念边界。

// 获取dom节点中最近的fiber对象
export function getClosestInstanceFromNode(targetNode: Node): null | Fiber {
  // 获取节点中的fiber对象
  let targetInst = (targetNode: any)[internalInstanceKey];
  // 如果存在， 直接返回
  if (targetInst) {
    // Don't return HostRoot or SuspenseComponent here.
    // 翻译：不要在此处返回 HostRoot 或 SuspenseComponent。
    // HostRoot就是作为根节点的fiber对象，存在dom节点的internalContainerInstanceKey中，本质也是一个fiber对象
    return targetInst;
  }
  // If the direct event target isn't a React owned DOM node, we need to look
  // to see if one of its parents is a React owned DOM node.

  // 翻译：
  // 如果直接事件目标不是 React 拥有的 DOM 节点，我们需要查看其父节点之一是否是 React 拥有的 DOM 节点。

  // 循环，找到当前节点最近的是react的dom节点的祖先节点
  let parentNode = targetNode.parentNode;
  while (parentNode) {
    // We'll check if this is a container root that could include
    // React nodes in the future. We need to check this first because
    // if we're a child of a dehydrated container, we need to first
    // find that inner container before moving on to finding the parent
    // instance. Note that we don't check this field on  the targetNode
    // itself because the fibers are conceptually between the container
    // node and the first child. It isn't surrounding the container node.
    // If it's not a container, we check if it's an instance.

    // 翻译：
    // 我们将检查这是否是将来可能包含 React 节点的容器根。
    // 我们需要首先检查这一点，因为如果我们是非ssr渲染的容器的子容器，我们需要先找到内部容器，然后再继续查找父实例。
    // 请注意，我们不会在 targetNode 本身上检查此字段，因为Fiber在概念上位于容器节点和第一个子节点之间。
    // 它不在容器节点周围。 如果它不是一个容器，我们检查它是否是一个实例。

    // 意思是这里传入的targetNode只可能是react挂载的跟节点的子节点，TODO: 应该是这个函数只会在事件系统里面用到

    // 从父节点中获取fiber对象(先拿容器，在拿普通的)
    targetInst =
      (parentNode: any)[internalContainerInstanceKey] ||
      (parentNode: any)[internalInstanceKey];
    if (targetInst) {
      // Since this wasn't the direct target of the event, we might have
      // stepped past dehydrated DOM nodes to get here. However they could
      // also have been non-React nodes. We need to answer which one.

      // 翻译：
      // 由于这不是事件的直接目标，我们可能会经过 dehydrated(脱水，hydrated反过程) DOM 节点到达这里。
      // 但是它们也可能是非 React 节点。 我们需要回答是哪一个。

      // If we the instance doesn't have any children, then there can't be
      // a nested suspense boundary within it. So we can use this as a fast
      // bailout. Most of the time, when people add non-React children to
      // the tree, it is using a ref to a child-less DOM node.
      // Normally we'd only need to check one of the fibers because if it
      // has ever gone from having children to deleting them or vice versa
      // it would have deleted the dehydrated boundary nested inside already.
      // However, since the HostRoot starts out with an alternate it might
      // have one on the alternate so we need to check in case this was a
      // root.

      // 翻译：
      // 如果我们的实例没有任何子节点，那么它里面就不能有嵌套suspense的边界。
      // 因此，我们可以将其用作快速救助。 大多数时候，当人们将非 React 子节点添加到树中时，
      // 它是对无子节点的DOM节点的引用(ref)的使用。
      // 通常我们只需要检查其中一个fiber对象，因为如果它从有孩子到删除它们，或者反之亦然，
      // 它就会删除已经嵌套在里面的dehydrated边界。
      // 然而，由于 HostRoot 从一个备用开始，它可能在备用上有一个，所以我们需要检查它是否是一个根。

      // 获取正在构建的下一个fiber节点树
      // fiber对象的alternate是react采用双缓存技术，会等待下一个fiber节点树完全构建好了，才会替换当前节点树。
      // 在替换的过程中，会在当前树的根fiber节点上维护alternate指针
      const alternate = targetInst.alternate;
      if (
        // 如果存在子节点
        targetInst.child !== null ||
        // 存在下一个节点树，且节点树有子节点， 同时也意味着targetInst是一个fiber节点树的根节点
        (alternate !== null && alternate.child !== null)
      ) {
        // Next we need to figure out if the node that skipped past is
        // nested within a dehydrated boundary and if so, which one.

        // 翻译：
        // 接下来我们需要确定跳过的节点是否嵌套在dehydrated边界内，如果是，是哪一个。

        // 得到当前节点所属的Suspense实例(一个注释节点)
        let suspenseInstance = getParentSuspenseInstance(targetNode);
        // 循环不停的遍历suspense对应的注释节点，如果suspense对应的注释节点不符合要求，则寻找他的父suspense对应的注释节点
        // 直至没有父suspense对应的注释节点，才停下来。
        while (suspenseInstance !== null) {
          // We found a suspense instance. That means that we haven't
          // hydrated it yet. Even though we leave the comments in the
          // DOM after hydrating, and there are boundaries in the DOM
          // that could already be hydrated, we wouldn't have found them
          // through this pass since if the target is hydrated it would
          // have had an internalInstanceKey on it.
          // Let's get the fiber associated with the SuspenseComponent
          // as the deepest instance.

          // 翻译：
          // 我们发现了一个suspense实例。 这意味着我们还没有给它hydrated(渲染)。
          // 即使我们在hydrating后将注释留在 DOM 中，并且 DOM 中有可能已经hydrated的边界，
          // 但我们不会通过此通道找到它们，因为如果目标已hydrated，它就会有一个 internalInstanceKey 。
          // 让我们获取与 SuspenseComponent 关联的fiber作为最深实例。

          // 获取suspense实例对应的fiber对象
          const targetSuspenseInst = suspenseInstance[internalInstanceKey];
          // 如果存在fiber对象， 则返回这个对象
          if (targetSuspenseInst) {
            return targetSuspenseInst;
          }
          // If we don't find a Fiber on the comment, it might be because
          // we haven't gotten to hydrate it yet. There might still be a
          // parent boundary that hasn't above this one so we need to find
          // the outer most that is known.

          // 如果我们在注释节点中没有找到fiber对象，可能是因为我们还没有给它hydrate(渲染)。
          // 可能仍然有一个父边界没有超过这个边界，所以我们需要找到已知的最外层。

          // 替换成父suspense实例，持续循环
          suspenseInstance = getParentSuspenseInstance(suspenseInstance);
          // If we don't find one, then that should mean that the parent
          // host component also hasn't hydrated yet. We can return it
          // below since it will bail out on the isMounted check later.
        }
      }
      return targetInst;
    }
    // 替换得以持续循环
    targetNode = parentNode;
    parentNode = targetNode.parentNode;
  }
  return null;
}

/**
 * Given a DOM node, return the ReactDOMComponent or ReactDOMTextComponent
 * instance, or null if the node was not rendered by this React.
 */
// 翻译: 给定一个 DOM 节点，返回 ReactDOMComponent 或 ReactDOMTextComponent 实例，如果节点没有被这个 React 渲染，则返回 null。

// 返回dom节点对应的fiber节点对象
export function getInstanceFromNode(node: Node): Fiber | null {
  // 从子节点中获取是否是react节点
  const inst =
    (node: any)[internalInstanceKey] ||
    (node: any)[internalContainerInstanceKey];
  if (inst) {
    if (
      inst.tag === HostComponent ||
      inst.tag === HostText ||
      inst.tag === SuspenseComponent ||
      inst.tag === HostRoot
    ) {
      return inst;
    } else {
      return null;
    }
  }
  return null;
}

/**
 * Given a ReactDOMComponent or ReactDOMTextComponent, return the corresponding
 * DOM node.
 */
export function getNodeFromInstance(inst: Fiber): Instance | TextInstance {
  if (inst.tag === HostComponent || inst.tag === HostText) {
    // In Fiber this, is just the state node right now. We assume it will be
    // a host component or host text.
    return inst.stateNode;
  }

  // Without this first invariant, passing a non-DOM-component triggers the next
  // invariant for a missing parent, which is super confusing.
  invariant(false, 'getNodeFromInstance: Invalid argument.');
}

// 从dom节点中获取fiber对象的属性集
export function getFiberCurrentPropsFromNode(
  // 节点，可以是元素节点，文本节点，注释节点，基本包含了常用的dom节点
  // => fiber实例的stateNode
  node: Instance | TextInstance | SuspenseInstance,
): Props {
  // 从dom节点中拿到保存的props属性值集合
  // internalPropsKey = __reactProps$ + 随机数
  return (node: any)[internalPropsKey] || null;
}

export function updateFiberProps(
  node: Instance | TextInstance | SuspenseInstance,
  props: Props,
): void {
  (node: any)[internalPropsKey] = props;
}

// 目标元素, html元素(node节点)
// ==> 基本为react挂在的容器dom节点
export function getEventListenerSet(node: EventTarget): Set<string> {
  // internalEventHandlersKey = __reactEvents$ + 一个随机数
  let elementListenerSet = (node: any)[internalEventHandlersKey];
  // 如果没有，则初始化
  if (elementListenerSet === undefined) {
    elementListenerSet = (node: any)[internalEventHandlersKey] = new Set();
  }
  // 返回事件监听器集盒
  return elementListenerSet;
}

export function getFiberFromScopeInstance(
  scope: ReactScopeInstance,
): null | Fiber {
  if (enableScopeAPI) {
    return (scope: any)[internalInstanceKey] || null;
  }
  return null;
}

export function setEventHandlerListeners(
  scope: EventTarget | ReactScopeInstance,
  listeners: Set<ReactDOMEventHandleListener>,
): void {
  (scope: any)[internalEventHandlerListenersKey] = listeners;
}

export function getEventHandlerListeners(
  scope: EventTarget | ReactScopeInstance,
): null | Set<ReactDOMEventHandleListener> {
  return (scope: any)[internalEventHandlerListenersKey] || null;
}

export function addEventHandleToTarget(
  target: EventTarget | ReactScopeInstance,
  eventHandle: ReactDOMEventHandle,
): void {
  let eventHandles = (target: any)[internalEventHandlesSetKey];
  if (eventHandles === undefined) {
    eventHandles = (target: any)[internalEventHandlesSetKey] = new Set();
  }
  eventHandles.add(eventHandle);
}

export function doesTargetHaveEventHandle(
  target: EventTarget | ReactScopeInstance,
  eventHandle: ReactDOMEventHandle,
): boolean {
  const eventHandles = (target: any)[internalEventHandlesSetKey];
  if (eventHandles === undefined) {
    return false;
  }
  return eventHandles.has(eventHandle);
}
