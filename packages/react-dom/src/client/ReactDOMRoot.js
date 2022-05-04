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
  // 挂在dom节点
  container: Container,
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  // 当前阅读情况下有 LegacyRoot
  tag: RootTag,
  // 选项
  // 当前阅读过来可能值为{hydrate: true}和undefined
  options: void | RootOptions,
) {
  // root实例
  // FIXME: 下沉 3
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

// 创建一个fiber root实例
function createRootImpl(
  // 挂在dom节点
  container: Container,
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)// root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  // 当前阅读情况下有 LegacyRoot
  tag: RootTag,
  // 选项
  // 当前阅读过来可能值为{hydrate: true}和undefined
  options: void | RootOptions,
) {
  // Tag is either LegacyRoot or Concurrent Root
  // 翻译是：Tag 是LegacyRoot(传统型root) 或者Concurrent Root（并发型root）

  // 是否是ssr渲染
  const hydrate = options != null && options.hydrate === true;
  // ssr渲染回调事件对象，有onHydrated, onDeleted等
  const hydrationCallbacks =
    (options != null && options.hydrationOptions) || null;
  // ssr渲染的可变数据源列表
  const mutableSources =
    (options != null &&
      options.hydrationOptions != null &&
      options.hydrationOptions.mutableSources) ||
    null;
  // 创建一个Fiber Root对象，这个对象会作为容器
  const root = createContainer(container, tag, hydrate, hydrationCallbacks);
  // 标记容器（Fiber Root对象）对应的fiber对象为root：将fiber节点对象存储到当前dom根容器元素中
  markContainerAsRoot(root.current, container);
  // 容器dom元素节点类型
  const containerNodeType = container.nodeType;

  // 下面的if else相关都是进行事件绑定处理

  // 当前版本enableEagerRootListeners为true, 开启root监听模式，也就是不使用document的对象监听，
  // root对象监听为react17的特性, 16位document的对象监听监听
  if (enableEagerRootListeners) {
    // 计算承载事件的dom元素（为注释文本节点时，用的是他的父节点）
    const rootContainerElement =
      container.nodeType === COMMENT_NODE ? container.parentNode : container;
    // 在当前容器dom节点监听所有需要支持的事件

    // 这里开始react的整个事件系统(>17), 具有一下特性
    // 1. 采用事件委托机制，整个react应用不会监听其他dom对象的事件，只会监听根节点的。
    // 2. 跟节点上会监听react中设置的所有需要监听的事件列表
    // 3. 根节点上某个事件触发后，会收集整个react的fiber树上需要处理的节点中对应事件的监听器,
    //    这些监听器时是使用者通过on{NativeEventName}设置的值，如onCLik。然后会执行这些监听器。
    // 4. 实现的具体原理是：
    //    4.1 根据事件对象中的target, 获取对应的fiber对象，然后创建一个空的事件委托队列.
    //    4.2 会将当前事件套一层代理，叫做合成对象。合同对象由于一个事件对象中需要在多个监听器中使用，
    //        所以采用套一层壳子来解决target需要不停变化，以及在不同监听器可能设置成不同的传播设置等。
    //        所以对于react事件系统中的event对象，对于事件的内部属性需要慎重修改。
    //    4.3 根据事件对象中的target， 获取对应的fiber对象，
    //        然后获取fiber对象和它的祖先节点中对应组件属性中的原生事件监听属性值（监听器），按照顺序收集成一个队列。
    //    4.4 将合同事件对象和监听器队列，fiber实例等组装成一个委托事件对象。然后放入一个委托事件队列中。
    //    4.5 一般符合html5标准的，不需要考虑浏览器兼容的事件，委托事件队列就只有一个对象。
    //        但是对于一些有浏览器兼容性问题，需要特殊处理(如change，select,input等事件)。
    //        如从其他事件模拟实现的情况，那么在模拟的事件上，就可能触发多种事件，所以需要一个队列。
    //        如委托节点触发一个mouseUp事件，除了一个mouseUp事件的委托事件对象，
    //        还可以能有一个select事件的委托对象(select事件在传统浏览器上通过监听鼠标等一系列事件模拟实现)。
    //        并且这两个委托对象的fiber实例可能都不一样。
    //    4.6 由于react可能需要兼容到ie8, 已经需要处理特别多的事件，那么需要处理浏览器的兼容性问题非常的复杂。
    //        react内部采用插件系统来架构这一块的处理逻辑。不支持外部扩展其事件插件系统。
    //    4.7 react事件委托机制中重新实现了捕获和冒泡两个事件阶段，冒泡事件从头至尾执行，捕获事件从尾至头(待确认)。
    //        事件中停止冒泡也是重新实现。
    //    4.8 组件上设置的`on*`原生事件的属性的值，默认都是冒泡事件，只在冒泡阶段执行，如果需要在捕获阶段就执行，
    //        需要家长capture后缀，如onClickCapture
    // 5. 采用事件委托机制是为了提高性能，且可以跟原来的dom节点无关，而是在react fiber树的层级关系上进行事件传播。
    //    可以让让使用者不需要关注底层dom结构，提高开发体验。

    // 在当前挂载节点上监听所有支持的事件，也就是开启事件委托机制
    listenToAllSupportedEvents(rootContainerElement);
  } else {
    // 老版本模式(<17.0.0)

    // 如果是新模式下（支持并发模式）下的ssr渲染
    if (hydrate && tag !== LegacyRoot) {
      // 获取document节点
      const doc =
        containerNodeType === DOCUMENT_NODE
          ? container
          : container.ownerDocument;
      // We need to cast this because Flow doesn't work
      // with the hoisted containerNodeType. If we inline
      // it, then Flow doesn't complain. We intentionally
      // hoist it to reduce code-size.

      // 翻译：我们需要强制转换，因为 Flow 不适用于提升的 containerNodeType。 如果我们内联它，那么 Flow 不会抱怨。 我们有意提升它以减少代码大小。

      // 对代码中doc: any的类型为any的说明

      // TODO: ll eagerlyTrapReplayableEvents 捕获事件
      // 老版本将不会深入，只会稍微看一下
      eagerlyTrapReplayableEvents(container, ((doc: any): Document));
    } else if (
      containerNodeType !== DOCUMENT_FRAGMENT_NODE &&
      containerNodeType !== DOCUMENT_NODE
    ) {
      // 确保监听onMouseEnter
      // TODO: ll ensureListeningTo
      ensureListeningTo(container, 'onMouseEnter', null);
    }
  }

  // TODO: 可变数据源，从上面的代码来看，只有当前版本只有ssr渲染时可能会传递
  if (mutableSources) {
    for (let i = 0; i < mutableSources.length; i++) {
      const mutableSource = mutableSources[i];
      // TODO: ll registerMutableSourceForHydration
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
  // 挂在dom节点
  container: Container,
  // 选项
  // 当前阅读过来可能值为{hydrate: true}和undefined
  options?: RootOptions,
): RootType {
  // 新建一个阻塞类型的root穿线
  // FIXME: 下沉 2
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
