/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';
import type {Container, SuspenseInstance} from './ReactFiberHostConfig';
import type {SuspenseState} from './ReactFiberSuspenseComponent.old';

import invariant from 'shared/invariant';

import {get as getInstance} from 'shared/ReactInstanceMap';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import getComponentName from 'shared/getComponentName';
import {
  ClassComponent,
  HostComponent,
  HostRoot,
  HostPortal,
  HostText,
  FundamentalComponent,
  SuspenseComponent,
} from './ReactWorkTags';
import {NoFlags, Placement, Hydrating} from './ReactFiberFlags';
import {enableFundamentalAPI} from 'shared/ReactFeatureFlags';

const ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;

// 获取最近的被挂载的fiber对象
export function getNearestMountedFiber(fiber: Fiber): null | Fiber {
  let node = fiber;
  let nearestMounted = fiber;

  // 拿到当前节点所在的节点树的最顶层

  // 如果没有下一个节点树
  if (!fiber.alternate) {
    // If there is no alternate, this might be a new tree that isn't inserted
    // yet. If it is, then it will have a pending insertion effect on it.

    // 翻译：如果没有替代，这可能是尚未插入的新树。 如果是，那么它将对其产生待处理的插入效果。
    let nextNode = node;
    do {
      node = nextNode;
      // 如果是ssr渲染(Hydrating)或者放置(Placement)操作
      if ((node.flags & (Placement | Hydrating)) !== NoFlags) {
        // This is an insertion or in-progress hydration. The nearest possible
        // mounted fiber is the parent but we need to continue to figure out
        // if that one is still mounted.

        // 翻译：这是插入或正在进行的hydration。 最近可能安装的fiber是父节点，但我们需要继续确定该fiber是否仍然安装。

        // 最近的被挂载的节点为当前节点的父节点，并接受下一轮的是否挂载的检测
        nearestMounted = node.return;
      }
      // 往父节点遍历
      nextNode = node.return;
    } while (nextNode);
  } /* 如果有下一个节点树 */else {
    // 拿到最外层的node节点
    while (node.return) {
      node = node.return;
    }
  }
  // 判断最顶层的节点是否是HostRoot
  if (node.tag === HostRoot) {
    // TODO: Check if this was a nested HostRoot when used with
    // renderContainerIntoSubtree.

    // 翻译：与 renderContainerIntoSubtree 一起使用时检查这是否是嵌套的 HostRoot

    return nearestMounted;
  }
  // If we didn't hit the root, that means that we're in an disconnected tree
  // that has been unmounted.

  // 如果我们没有击中根，这意味着我们处于一个已卸载的断开连接的树中
  return null;
}

// 从fiber对象中获取Suspense实例(一个注释节点)
export function getSuspenseInstanceFromFiber(
  fiber: Fiber,
): null | SuspenseInstance {
  // 需要当前fiber对应的组件是一个Suspense组件
  if (fiber.tag === SuspenseComponent) {
    // 缓存的组件的状态值
    let suspenseState: SuspenseState | null = fiber.memoizedState;
    // 如果咩有状态值
    if (suspenseState === null) {
      // 那么可能需要从下一个节点树中去拿

      // 获取当前节点下个阶段渲染的节点对象
      const current = fiber.alternate;
      if (current !== null) {
        // 获取节点中保存的组件状态
        suspenseState = current.memoizedState;
      }
    }
    // 如果状态存在，返回对应的dom节点，即为注释节点
    if (suspenseState !== null) {
      return suspenseState.dehydrated;
    }
  }
  // 需要当前fiber对应的组件不是一个Suspense组件，则直接返回null
  return null;
}

// 获取当前根fiber对象(rootFiber)对应的dom节点
// 如果传入fiber对象不是跟fiber节点对象，则返回null
export function getContainerFromFiber(fiber: Fiber): null | Container {
  // 如果是HostRoot标签的fiber节点，则获取其stateNode(FiberRoot对象)的containerInfo信息
  return fiber.tag === HostRoot
    ? (fiber.stateNode.containerInfo: Container)
    : null;
}

export function isFiberMounted(fiber: Fiber): boolean {
  return getNearestMountedFiber(fiber) === fiber;
}

export function isMounted(component: React$Component<any, any>): boolean {
  if (__DEV__) {
    const owner = (ReactCurrentOwner.current: any);
    if (owner !== null && owner.tag === ClassComponent) {
      const ownerFiber: Fiber = owner;
      const instance = ownerFiber.stateNode;
      if (!instance._warnedAboutRefsInRender) {
        console.error(
          '%s is accessing isMounted inside its render() function. ' +
            'render() should be a pure function of props and state. It should ' +
            'never access something that requires stale data from the previous ' +
            'render, such as refs. Move this logic to componentDidMount and ' +
            'componentDidUpdate instead.',
          getComponentName(ownerFiber.type) || 'A component',
        );
      }
      instance._warnedAboutRefsInRender = true;
    }
  }

  const fiber: ?Fiber = getInstance(component);
  if (!fiber) {
    return false;
  }
  return getNearestMountedFiber(fiber) === fiber;
}

function assertIsMounted(fiber) {
  invariant(
    getNearestMountedFiber(fiber) === fiber,
    'Unable to find node on an unmounted component.',
  );
}

export function findCurrentFiberUsingSlowPath(fiber: Fiber): Fiber | null {
  const alternate = fiber.alternate;
  if (!alternate) {
    // If there is no alternate, then we only need to check if it is mounted.
    const nearestMounted = getNearestMountedFiber(fiber);
    invariant(
      nearestMounted !== null,
      'Unable to find node on an unmounted component.',
    );
    if (nearestMounted !== fiber) {
      return null;
    }
    return fiber;
  }
  // If we have two possible branches, we'll walk backwards up to the root
  // to see what path the root points to. On the way we may hit one of the
  // special cases and we'll deal with them.
  let a: Fiber = fiber;
  let b: Fiber = alternate;
  while (true) {
    const parentA = a.return;
    if (parentA === null) {
      // We're at the root.
      break;
    }
    const parentB = parentA.alternate;
    if (parentB === null) {
      // There is no alternate. This is an unusual case. Currently, it only
      // happens when a Suspense component is hidden. An extra fragment fiber
      // is inserted in between the Suspense fiber and its children. Skip
      // over this extra fragment fiber and proceed to the next parent.
      const nextParent = parentA.return;
      if (nextParent !== null) {
        a = b = nextParent;
        continue;
      }
      // If there's no parent, we're at the root.
      break;
    }

    // If both copies of the parent fiber point to the same child, we can
    // assume that the child is current. This happens when we bailout on low
    // priority: the bailed out fiber's child reuses the current child.
    if (parentA.child === parentB.child) {
      let child = parentA.child;
      while (child) {
        if (child === a) {
          // We've determined that A is the current branch.
          assertIsMounted(parentA);
          return fiber;
        }
        if (child === b) {
          // We've determined that B is the current branch.
          assertIsMounted(parentA);
          return alternate;
        }
        child = child.sibling;
      }
      // We should never have an alternate for any mounting node. So the only
      // way this could possibly happen is if this was unmounted, if at all.
      invariant(false, 'Unable to find node on an unmounted component.');
    }

    if (a.return !== b.return) {
      // The return pointer of A and the return pointer of B point to different
      // fibers. We assume that return pointers never criss-cross, so A must
      // belong to the child set of A.return, and B must belong to the child
      // set of B.return.
      a = parentA;
      b = parentB;
    } else {
      // The return pointers point to the same fiber. We'll have to use the
      // default, slow path: scan the child sets of each parent alternate to see
      // which child belongs to which set.
      //
      // Search parent A's child set
      let didFindChild = false;
      let child = parentA.child;
      while (child) {
        if (child === a) {
          didFindChild = true;
          a = parentA;
          b = parentB;
          break;
        }
        if (child === b) {
          didFindChild = true;
          b = parentA;
          a = parentB;
          break;
        }
        child = child.sibling;
      }
      if (!didFindChild) {
        // Search parent B's child set
        child = parentB.child;
        while (child) {
          if (child === a) {
            didFindChild = true;
            a = parentB;
            b = parentA;
            break;
          }
          if (child === b) {
            didFindChild = true;
            b = parentB;
            a = parentA;
            break;
          }
          child = child.sibling;
        }
        invariant(
          didFindChild,
          'Child was not found in either parent set. This indicates a bug ' +
            'in React related to the return pointer. Please file an issue.',
        );
      }
    }

    invariant(
      a.alternate === b,
      "Return fibers should always be each others' alternates. " +
        'This error is likely caused by a bug in React. Please file an issue.',
    );
  }
  // If the root is not a host container, we're in a disconnected tree. I.e.
  // unmounted.
  invariant(
    a.tag === HostRoot,
    'Unable to find node on an unmounted component.',
  );
  if (a.stateNode.current === a) {
    // We've determined that A is the current branch.
    return fiber;
  }
  // Otherwise B has to be current branch.
  return alternate;
}

export function findCurrentHostFiber(parent: Fiber): Fiber | null {
  const currentParent = findCurrentFiberUsingSlowPath(parent);
  if (!currentParent) {
    return null;
  }

  // Next we'll drill down this component to find the first HostComponent/Text.
  let node: Fiber = currentParent;
  while (true) {
    // HostComponent: 原生组件
    // HostText: 原生文本
    if (node.tag === HostComponent || node.tag === HostText) {
      return node;
    } else if (node.child) {
      node.child.return = node;
      node = node.child;
      continue;
    }
    if (node === currentParent) {
      return null;
    }
    while (!node.sibling) {
      if (!node.return || node.return === currentParent) {
        return null;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
  // Flow needs the return null here, but ESLint complains about it.
  // eslint-disable-next-line no-unreachable
  return null;
}

export function findCurrentHostFiberWithNoPortals(parent: Fiber): Fiber | null {
  const currentParent = findCurrentFiberUsingSlowPath(parent);
  if (!currentParent) {
    return null;
  }

  // Next we'll drill down this component to find the first HostComponent/Text.
  let node: Fiber = currentParent;
  while (true) {
    if (
      // HostComponent: 原生组件
      node.tag === HostComponent ||
      // HostText: 原生文本
      node.tag === HostText ||
      (enableFundamentalAPI && node.tag === FundamentalComponent)
    ) {
      return node;
    } else if (node.child && node.tag !== HostPortal) {
      node.child.return = node;
      node = node.child;
      continue;
    }
    if (node === currentParent) {
      return null;
    }
    while (!node.sibling) {
      if (!node.return || node.return === currentParent) {
        return null;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
  // Flow needs the return null here, but ESLint complains about it.
  // eslint-disable-next-line no-unreachable
  return null;
}

export function isFiberSuspenseAndTimedOut(fiber: Fiber): boolean {
  const memoizedState = fiber.memoizedState;
  return (
    fiber.tag === SuspenseComponent &&
    memoizedState !== null &&
    memoizedState.dehydrated === null
  );
}

export function doesFiberContain(
  parentFiber: Fiber,
  childFiber: Fiber,
): boolean {
  let node = childFiber;
  const parentFiberAlternate = parentFiber.alternate;
  while (node !== null) {
    if (node === parentFiber || node === parentFiberAlternate) {
      return true;
    }
    node = node.return;
  }
  return false;
}
