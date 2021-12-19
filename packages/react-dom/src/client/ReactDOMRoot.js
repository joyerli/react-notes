/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Container} from './ReactDOMHostConfig';
import type {RootTag} from 'react-reconciler/src/ReactRootTags';
import type {MutableSource, ReactNodeList} from 'shared/ReactTypes';
import type {FiberRoot} from 'react-reconciler/src/ReactInternalTypes';

export type RootType = {
  render(children: ReactNodeList): void,
  unmount(): void,
  _internalRoot: FiberRoot,
  ...
};

export type RootOptions = {
  hydrate?: boolean,
  hydrationOptions?: {
    onHydrated?: (suspenseNode: Comment) => void,
    onDeleted?: (suspenseNode: Comment) => void,
    mutableSources?: Array<MutableSource<any>>,
    ...
  },
  ...
};

import {
  isContainerMarkedAsRoot,
  markContainerAsRoot,
  unmarkContainerAsRoot,
} from './ReactDOMComponentTree';
import {listenToAllSupportedEvents} from '../events/DOMPluginEventSystem';
import {eagerlyTrapReplayableEvents} from '../events/ReactDOMEventReplaying';
import {
  ELEMENT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} from '../shared/HTMLNodeType';
import {ensureListeningTo} from './ReactDOMComponent';

import {
  createContainer,
  updateContainer,
  findHostInstanceWithNoPortals,
  registerMutableSourceForHydration,
} from 'react-reconciler/src/ReactFiberReconciler';
import invariant from 'shared/invariant';
// 当前为true
import {enableEagerRootListeners} from 'shared/ReactFeatureFlags';
import {
  BlockingRoot,
  ConcurrentRoot,
  LegacyRoot,
} from 'react-reconciler/src/ReactRootTags';

// 并发类型的react root实例类
function ReactDOMRoot(container: Container, options: void | RootOptions) {
  this._internalRoot = createRootImpl(container, ConcurrentRoot, options);
}

// 阻塞类型react root实例类
function ReactDOMBlockingRoot(
  container: Container,
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  tag: RootTag,
  options: void | RootOptions,
) {
  // root实例
  this._internalRoot = createRootImpl(container, tag, options);
}

ReactDOMRoot.prototype.render = ReactDOMBlockingRoot.prototype.render = function(
  children: ReactNodeList,
): void {
  const root = this._internalRoot;
  if (__DEV__) {
    if (typeof arguments[1] === 'function') {
      console.error(
        'render(...): does not support the second callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
    const container = root.containerInfo;

    if (container.nodeType !== COMMENT_NODE) {
      const hostInstance = findHostInstanceWithNoPortals(root.current);
      if (hostInstance) {
        if (hostInstance.parentNode !== container) {
          console.error(
            'render(...): It looks like the React-rendered content of the ' +
              'root container was removed without using React. This is not ' +
              'supported and will cause errors. Instead, call ' +
              "root.unmount() to empty a root's container.",
          );
        }
      }
    }
  }
  updateContainer(children, root, null, null);
};

ReactDOMRoot.prototype.unmount = ReactDOMBlockingRoot.prototype.unmount = function(): void {
  if (__DEV__) {
    if (typeof arguments[0] === 'function') {
      console.error(
        'unmount(...): does not support a callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
  }
  const root = this._internalRoot;
  const container = root.containerInfo;
  updateContainer(null, root, null, () => {
    unmarkContainerAsRoot(container);
  });
};

// 创建一个root实例
function createRootImpl(
  // 根dom节点，作为整个react的容器dom节点
  container: Container,
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  tag: RootTag,
  options: void | RootOptions,
) {
  // Tag is either LegacyRoot or Concurrent Root
  // 翻译是：Tag 是LegacyRoot(传统型root) 或者Concurrent Root（并发型root）

  // 是否是ssr渲染
  const hydrate = options != null && options.hydrate === true;
  const hydrationCallbacks =
    (options != null && options.hydrationOptions) || null;
  const mutableSources =
    (options != null &&
      options.hydrationOptions != null &&
      options.hydrationOptions.mutableSources) ||
    null;
  // 创建一个节点容器，实际为Fiber根节点
  const root = createContainer(container, tag, hydrate, hydrationCallbacks);
  // 标记容器元素为root元素：将fiber跟节点存储到当前dom根容器元素中
  markContainerAsRoot(root.current, container);
  // 容器dom元素节点类型
  const containerNodeType = container.nodeType;

  // 当前版本enableEagerRootListeners为true, 开启root监听模式，也就是不使用document的实践坚挺，react17的特性
  if (enableEagerRootListeners) {
    // 计算承载事件的容器dome元素
    const rootContainerElement =
      container.nodeType === COMMENT_NODE ? container.parentNode : container;
    // TODO: listenToAllSupportedEvents  TODO: --READ_THIS--
    listenToAllSupportedEvents(rootContainerElement);
  } else {
    if (hydrate && tag !== LegacyRoot) {
      const doc =
        containerNodeType === DOCUMENT_NODE
          ? container
          : container.ownerDocument;
      // We need to cast this because Flow doesn't work
      // with the hoisted containerNodeType. If we inline
      // it, then Flow doesn't complain. We intentionally
      // hoist it to reduce code-size.
      eagerlyTrapReplayableEvents(container, ((doc: any): Document));
    } else if (
      containerNodeType !== DOCUMENT_FRAGMENT_NODE &&
      containerNodeType !== DOCUMENT_NODE
    ) {
      ensureListeningTo(container, 'onMouseEnter', null);
    }
  }

  // TODO: 可变数据源，从上面的代码来看，只有当前版本只有ssr渲染时可能会传递
  if (mutableSources) {
    for (let i = 0; i < mutableSources.length; i++) {
      const mutableSource = mutableSources[i];
      // TODO: registerMutableSourceForHydration
      registerMutableSourceForHydration(root, mutableSource);
    }
  }

  // 返回root实例
  return root;
}

export function createRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  invariant(
    isValidContainer(container),
    'createRoot(...): Target container is not a DOM element.',
  );
  warnIfReactDOMContainerInDEV(container);
  return new ReactDOMRoot(container, options);
}

export function createBlockingRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  invariant(
    isValidContainer(container),
    'createRoot(...): Target container is not a DOM element.',
  );
  warnIfReactDOMContainerInDEV(container);
  return new ReactDOMBlockingRoot(container, BlockingRoot, options);
}

// 创建一个传统类型的root实例，
export function createLegacyRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  // 新建一个阻塞类型的root穿线
  return new ReactDOMBlockingRoot(container, LegacyRoot, options);
}

export function isValidContainer(node: mixed): boolean {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (node.nodeType === COMMENT_NODE &&
        (node: any).nodeValue === ' react-mount-point-unstable '))
  );
}

function warnIfReactDOMContainerInDEV(container) {
  if (__DEV__) {
    if (
      container.nodeType === ELEMENT_NODE &&
      ((container: any): Element).tagName &&
      ((container: any): Element).tagName.toUpperCase() === 'BODY'
    ) {
      console.error(
        'createRoot(): Creating roots directly with document.body is ' +
          'discouraged, since its children are often manipulated by third-party ' +
          'scripts and browser extensions. This may lead to subtle ' +
          'reconciliation issues. Try using a container element created ' +
          'for your app.',
      );
    }
    if (isContainerMarkedAsRoot(container)) {
      if (container._reactRootContainer) {
        console.error(
          'You are calling ReactDOM.createRoot() on a container that was previously ' +
            'passed to ReactDOM.render(). This is not supported.',
        );
      } else {
        console.error(
          'You are calling ReactDOM.createRoot() on a container that ' +
            'has already been passed to createRoot() before. Instead, call ' +
            'root.render() on the existing root instead if you want to update it.',
        );
      }
    }
  }
}
