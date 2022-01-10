/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// 传统模式的核心内容（TODO: 区别于后续使用createRoot等新方式）

import type {Container} from './ReactDOMHostConfig';
import type {RootType} from './ReactDOMRoot';
import type {ReactNodeList} from 'shared/ReactTypes';

import {
  getInstanceFromNode,
  isContainerMarkedAsRoot,
  unmarkContainerAsRoot,
} from './ReactDOMComponentTree';
import {createLegacyRoot, isValidContainer} from './ReactDOMRoot';
import {ROOT_ATTRIBUTE_NAME} from '../shared/DOMProperty';
import {
  DOCUMENT_NODE,
  ELEMENT_NODE,
  COMMENT_NODE,
} from '../shared/HTMLNodeType';

import {
  findHostInstanceWithNoPortals,
  updateContainer,
  unbatchedUpdates,
  getPublicRootInstance,
  findHostInstance,
  findHostInstanceWithWarning,
} from 'react-reconciler/src/ReactFiberReconciler';
import getComponentName from 'shared/getComponentName';
import invariant from 'shared/invariant';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import {has as hasInstance} from 'shared/ReactInstanceMap';

const ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;

let topLevelUpdateWarnings;
let warnedAboutHydrateAPI = false;

// 只在开发模式中，创建topLevelUpdateWarnings函数
if (__DEV__) {
  // 判断容器dom元素是否合法
  topLevelUpdateWarnings = (container: Container) => {
    // 判断这个容器dom元素是不是已经被挂载过
    if (container._reactRootContainer && container.nodeType !== COMMENT_NODE) {
      // TODO: findHostInstanceWithNoPortals的含义
      const hostInstance = findHostInstanceWithNoPortals(
        // 容器上的fiber节点
        container._reactRootContainer._internalRoot.current,
      );
      if (hostInstance) {
        if (hostInstance.parentNode !== container) {
          // 提示翻译：看起来这个容器的 React 渲染内容在没有使用 React 的情况下被删除了。 这不受支持，并且会导致错误。 相反，调用 ReactDOM.unmountComponentAtNode 来清空容器
          // 意思是，该元素被加载过，需要清理才能再次挂载。
          console.error(
            'render(...): It looks like the React-rendered content of this ' +
              'container was removed without using React. This is not ' +
              'supported and will cause errors. Instead, call ' +
              'ReactDOM.unmountComponentAtNode to empty a container.',
          );
        }
      }
    }

    // 是否已经是react根节点容器
    const isRootRenderedBySomeReact = !!container._reactRootContainer;
    // 获取容器的子元素
    const rootEl = getReactRootElementInContainer(container);
    // getInstanceFromNode: 返回dom节点对应的fiber节点对象
    // 子节点是否有fiber节点对象，如果有，就证明子节点被react渲染过
    const hasNonRootReactChild = !!(rootEl && getInstanceFromNode(rootEl));

    // 如果子节点是被react处理干过的，但容器是不一个新容器， 此时会导致问题，提示下面警告
    if (hasNonRootReactChild && !isRootRenderedBySomeReact) {
      // 提示翻译：用新的根组件替换 React 渲染的子组件。 如果你打算更新这个节点的子节点，你应该让现有的子节点更新它们的状态并渲染新组件，而不是调用 ReactDOM.render。
      // 提示子节点的更新应该重新触发渲染渲染，也不是换一个容器节点
      console.error(
        'render(...): Replacing React-rendered children with a new root ' +
          'component. If you intended to update the children of this node, ' +
          'you should instead have the existing children update their state ' +
          'and render the new components instead of calling ReactDOM.render.',
      );
    }

    if (
      container.nodeType === ELEMENT_NODE &&
      ((container: any): Element).tagName &&
      ((container: any): Element).tagName.toUpperCase() === 'BODY'
    ) {
      // 提示翻译：不鼓励将组件直接渲染到 document.body 中，因为它的子组件经常被第三方脚本和浏览器扩展操作。 这可能会导致微妙的和解问题。 尝试渲染到为您的应用程序创建的容器元素中。
      // 如果直接渲染到body元素中会被警告
      console.error(
        'render(): Rendering components directly into document.body is ' +
          'discouraged, since its children are often manipulated by third-party ' +
          'scripts and browser extensions. This may lead to subtle ' +
          'reconciliation issues. Try rendering into a container element created ' +
          'for your app.',
      );
    }
  };
}

// 从容器中获取子元素
function getReactRootElementInContainer(container: any) {
  if (!container) {
    return null;
  }

  if (container.nodeType === DOCUMENT_NODE) {
    // 如何是document节点，返回document元素（也就是html元素）
    return container.documentElement;
  } else {
    // 其他返回当前节点的第一个子节点
    return container.firstChild;
  }
}

// 是否为传统启发式渲染
// container： 挂在dom节点
function shouldHydrateDueToLegacyHeuristic(container) {
  // 从挂在节点中获取所需的子元素
  const rootElement = getReactRootElementInContainer(container);
  // 是否符合标记
  // 容器元素为普通的元素节点，且有data-reactroot属性，则是传统启发式渲染
  return !!(
    rootElement &&
    rootElement.nodeType === ELEMENT_NODE &&
    rootElement.hasAttribute(ROOT_ATTRIBUTE_NAME)
  );
}

// 从一个dom节点容器创建一个root实例
function legacyCreateRootFromDOMContainer(
  // 挂在dom节点
  container: Container,
  // react.hydrate, ssr渲染
  forceHydrate: boolean,
): RootType {
  // 是否是服务器渲染
  // Heuristic 启发式
  const shouldHydrate =
    forceHydrate || shouldHydrateDueToLegacyHeuristic(container);
  // First clear any existing content.
  // 翻译: 首先清除任何现有内容
  // 如果不需要强制刷新
  if (!shouldHydrate) {
    // 是否警告，用于开发模式下只打印一次警告提示
    let warned = false;
    // 跟节点的兄弟节点
    let rootSibling;
    // 下面的循环代码逻辑为删除容器的子节点，直至没有子节点
    while ((rootSibling = container.lastChild)) {
      if (__DEV__) {
        // 如果是开发模式，则有警告提示
        if (
          !warned &&
          rootSibling.nodeType === ELEMENT_NODE &&
          (rootSibling: any).hasAttribute(ROOT_ATTRIBUTE_NAME)
        ) {
          warned = true;
          // 提示警告： 目标节点有 React 渲染的标记，但也有不相关的节点。 这通常是由在服务器渲染标记周围插入的空白引起的。
          // 容器节点有子节点，则警告
          console.error(
            'render(): Target node has markup rendered by React, but there ' +
              'are unrelated nodes as well. This is most commonly caused by ' +
              'white-space inserted around server-rendered markup.',
          );
        }
      }
      // 删除节点
      container.removeChild(rootSibling);
    }
  }
  if (__DEV__) {
    // 调用 ReactDOM.render() 来混合服务器渲染的标记将在 React v18 中停止工作。
    //  如果您希望 React 附加到服务器 HTML，请将 ReactDOM.render() 调用替换为 ReactDOM.hydrate()。
    // 如果使用render渲染ssr, 则打印警告信息
    if (shouldHydrate && !forceHydrate && !warnedAboutHydrateAPI) {
      warnedAboutHydrateAPI = true;
      console.warn(
        'render(): Calling ReactDOM.render() to hydrate server-rendered markup ' +
          'will stop working in React v18. Replace the ReactDOM.render() call ' +
          'with ReactDOM.hydrate() if you want React to attach to the server HTML.',
      );
    }
  }

  // 创建一个传统类型的root实例
  // FIXME: 下沉点
  return createLegacyRoot(
    container,
    shouldHydrate
      ? {
          hydrate: true,
        }
      : undefined,
  );
}

function warnOnInvalidCallback(callback: mixed, callerName: string): void {
  if (__DEV__) {
    if (callback !== null && typeof callback !== 'function') {
      console.error(
        '%s(...): Expected the last optional `callback` argument to be a ' +
          'function. Instead received: %s.',
        callerName,
        callback,
      );
    }
  }
}

// 挂载节点
function legacyRenderSubtreeIntoContainer(
  // 父组件, 当前web dom 下为空
  parentComponent: ?React$Component<any, any>,
  // 子节点
  children: ReactNodeList,
  // 容器dom元素
  container: Container,
  // react.hydrate, ssr渲染
  forceHydrate: boolean,
  // 回调函数
  callback: ?Function,
) {
  if (__DEV__) {
    // 警告提示容器dom元素是否合法
    topLevelUpdateWarnings(container);
    // 如果是非法的回调函数，打印警告信息
    warnOnInvalidCallback(callback === undefined ? null : callback, 'render');
  }

  // Without `any` type, Flow says "Property cannot be accessed on any
  // member of intersection type." Whyyyyyy.

  // 上面的注释一个来自react团队的抱怨，抱怨如果不给container._reactRootContainer声明any就会导致错误提示。

  let root: RootType = (container._reactRootContainer: any);
  let fiberRoot;
  // 判断dom元素是否被挂载过
  if (!root) {
    // 没被挂载过

    // Initial mount
    // 挂载节点，并且在容器dom对象上标记一个额外的属性数据对象
    root = container._reactRootContainer = legacyCreateRootFromDOMContainer(
      container,
      forceHydrate,
    );
    // fiber跟节点，由上面挂载生成
    fiberRoot = root._internalRoot;
    // 如果回调函数是一个函数类型，包裹传递进来的回调函数，让其支持this指向react根节点实例，
    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function() {
        // 获取公共根节点实例
        const instance = getPublicRootInstance(fiberRoot);
        // 绑定this执行
        originalCallback.call(instance);
      };
    }
    // Initial mount should not be batched.

    // 翻译: 不应批处理初始挂载。

    // 不批量更新， unbatchedUpdates会在执行updateContainer之前进行一些状态初始化，执行后，进行一些清理操作。
    unbatchedUpdates(() => {
      // 更新容器, TODO: updateContainer
      updateContainer(children, fiberRoot, parentComponent, callback);
    });
  } else {
    // 被挂载过

    // 跟上面一样的含义
    fiberRoot = root._internalRoot;
    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function() {
        const instance = getPublicRootInstance(fiberRoot);
        originalCallback.call(instance);
      };
    }
    // Update  更新

    // 如果被挂载过，那就不是初始化挂载，而是更新操作
    updateContainer(children, fiberRoot, parentComponent, callback);
  }

  // 返回公共根节点实例，该操作下后续迭代可能会被优化，应该使用回调函数获取该信息
  TODO: getPublicRootInstance
  return getPublicRootInstance(fiberRoot);
}

export function findDOMNode(
  componentOrElement: Element | ?React$Component<any, any>,
): null | Element | Text {
  if (__DEV__) {
    const owner = (ReactCurrentOwner.current: any);
    if (owner !== null && owner.stateNode !== null) {
      const warnedAboutRefsInRender = owner.stateNode._warnedAboutRefsInRender;
      if (!warnedAboutRefsInRender) {
        console.error(
          '%s is accessing findDOMNode inside its render(). ' +
            'render() should be a pure function of props and state. It should ' +
            'never access something that requires stale data from the previous ' +
            'render, such as refs. Move this logic to componentDidMount and ' +
            'componentDidUpdate instead.',
          getComponentName(owner.type) || 'A component',
        );
      }
      owner.stateNode._warnedAboutRefsInRender = true;
    }
  }
  if (componentOrElement == null) {
    return null;
  }
  if ((componentOrElement: any).nodeType === ELEMENT_NODE) {
    return (componentOrElement: any);
  }
  if (__DEV__) {
    return findHostInstanceWithWarning(componentOrElement, 'findDOMNode');
  }
  return findHostInstance(componentOrElement);
}

export function hydrate(
  element: React$Node,
  container: Container,
  callback: ?Function,
) {
  invariant(
    isValidContainer(container),
    'Target container is not a DOM element.',
  );
  if (__DEV__) {
    const isModernRoot =
      isContainerMarkedAsRoot(container) &&
      container._reactRootContainer === undefined;
    if (isModernRoot) {
      console.error(
        'You are calling ReactDOM.hydrate() on a container that was previously ' +
          'passed to ReactDOM.createRoot(). This is not supported. ' +
          'Did you mean to call createRoot(container, {hydrate: true}).render(element)?',
      );
    }
  }
  // TODO: throw or warn if we couldn't hydrate?
  return legacyRenderSubtreeIntoContainer(
    null,
    element,
    container,
    true,
    callback,
  );
}

// 在提供的 container 里渲染一个 React 元素，并返回对该组件的引用（或者针对无状态组件返回 null）
export function render(
  // react元素对象
  element: React$Element<any>,
  // dom元素容器
  container: Container,
  // 挂载成功后的回调函数，毁掉函数通过参数获取根组件`ReactComponent`实例的引用
  callback: ?Function,
) {
  // 验证container参数是否合法
  // invariant是一个编译锚点，利用babel参数，在开发模式下，会变成一个检验逻辑，当不通过时，会报错。
  // 生产环境会被忽略。
  // 下面代码会被编译成：
  //  if (!isValidContainer(container)) {
  //    {
  //      throw Error( "Target container is not a DOM element." );
  //    }
  //  }
  invariant(
    isValidContainer(container),
    'Target container is not a DOM element.',
  );

  // 开发模式下对container检验是否是createRoot()创建的对象
  if (__DEV__) {
    // 是否是新模式中利用createRoot()创建的根结点
    const isModernRoot =
      isContainerMarkedAsRoot(container) &&
      container._reactRootContainer === undefined;
    if (isModernRoot) {
      // 打印提示，大意是这种情况下，你不应该使用reactDom.render(root), 而是应该使用root.render
      console.error(
        'You are calling ReactDOM.render() on a container that was previously ' +
          'passed to ReactDOM.createRoot(). This is not supported. ' +
          'Did you mean to call root.render(element)?',
      );
    }
  }
  // 挂载节点
  return legacyRenderSubtreeIntoContainer(
    null,
    element,
    container,
    false,
    callback,
  );
}

export function unstable_renderSubtreeIntoContainer(
  parentComponent: React$Component<any, any>,
  element: React$Element<any>,
  containerNode: Container,
  callback: ?Function,
) {
  invariant(
    isValidContainer(containerNode),
    'Target container is not a DOM element.',
  );
  invariant(
    parentComponent != null && hasInstance(parentComponent),
    'parentComponent must be a valid React Component',
  );
  return legacyRenderSubtreeIntoContainer(
    parentComponent,
    element,
    containerNode,
    false,
    callback,
  );
}

export function unmountComponentAtNode(container: Container) {
  invariant(
    isValidContainer(container),
    'unmountComponentAtNode(...): Target container is not a DOM element.',
  );

  if (__DEV__) {
    const isModernRoot =
      isContainerMarkedAsRoot(container) &&
      container._reactRootContainer === undefined;
    if (isModernRoot) {
      console.error(
        'You are calling ReactDOM.unmountComponentAtNode() on a container that was previously ' +
          'passed to ReactDOM.createRoot(). This is not supported. Did you mean to call root.unmount()?',
      );
    }
  }

  if (container._reactRootContainer) {
    if (__DEV__) {
      const rootEl = getReactRootElementInContainer(container);
      const renderedByDifferentReact = rootEl && !getInstanceFromNode(rootEl);
      if (renderedByDifferentReact) {
        console.error(
          "unmountComponentAtNode(): The node you're attempting to unmount " +
            'was rendered by another copy of React.',
        );
      }
    }

    // Unmount should not be batched.
    unbatchedUpdates(() => {
      legacyRenderSubtreeIntoContainer(null, null, container, false, () => {
        // $FlowFixMe This should probably use `delete container._reactRootContainer`
        container._reactRootContainer = null;
        unmarkContainerAsRoot(container);
      });
    });
    // If you call unmountComponentAtNode twice in quick succession, you'll
    // get `true` twice. That's probably fine?
    return true;
  } else {
    if (__DEV__) {
      const rootEl = getReactRootElementInContainer(container);
      const hasNonRootReactChild = !!(rootEl && getInstanceFromNode(rootEl));

      // Check if the container itself is a React root node.
      const isContainerReactRoot =
        container.nodeType === ELEMENT_NODE &&
        isValidContainer(container.parentNode) &&
        !!container.parentNode._reactRootContainer;

      if (hasNonRootReactChild) {
        console.error(
          "unmountComponentAtNode(): The node you're attempting to unmount " +
            'was rendered by React and is not a top-level container. %s',
          isContainerReactRoot
            ? 'You may have accidentally passed in a React root node instead ' +
                'of its container.'
            : 'Instead, have the parent component update its state and ' +
                'rerender in order to remove this component.',
        );
      }
    }

    return false;
  }
}
