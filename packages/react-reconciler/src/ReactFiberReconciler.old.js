/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber, SuspenseHydrationCallbacks} from './ReactInternalTypes';
import type {FiberRoot} from './ReactInternalTypes';
import type {RootTag} from './ReactRootTags';
import type {
  Instance,
  TextInstance,
  Container,
  PublicInstance,
} from './ReactFiberHostConfig';
import type {RendererInspectionConfig} from './ReactFiberHostConfig';
import {FundamentalComponent} from './ReactWorkTags';
import type {ReactNodeList} from 'shared/ReactTypes';
import type {Lane, LanePriority} from './ReactFiberLane';
import type {SuspenseState} from './ReactFiberSuspenseComponent.old';

import {
  findCurrentHostFiber,
  findCurrentHostFiberWithNoPortals,
} from './ReactFiberTreeReflection';
import {get as getInstance} from 'shared/ReactInstanceMap';
import {
  HostComponent,
  ClassComponent,
  HostRoot,
  SuspenseComponent,
} from './ReactWorkTags';
import getComponentName from 'shared/getComponentName';
import invariant from 'shared/invariant';
import {enableSchedulingProfiler} from 'shared/ReactFeatureFlags';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import {getPublicInstance} from './ReactFiberHostConfig';
import {
  findCurrentUnmaskedContext,
  processChildContext,
  emptyContextObject,
  isContextProvider as isLegacyContextProvider,
} from './ReactFiberContext.old';
import {createFiberRoot} from './ReactFiberRoot.old';
import {injectInternals, onScheduleRoot} from './ReactFiberDevToolsHook.old';
import {
  requestEventTime,
  requestUpdateLane,
  scheduleUpdateOnFiber,
  flushRoot,
  batchedEventUpdates,
  batchedUpdates,
  unbatchedUpdates,
  flushSync,
  flushControlled,
  deferredUpdates,
  discreteUpdates,
  flushDiscreteUpdates,
  flushPassiveEffects,
  warnIfNotScopedWithMatchingAct,
  warnIfUnmockedScheduler,
  IsThisRendererActing,
  act,
} from './ReactFiberWorkLoop.old';
import {createUpdate, enqueueUpdate} from './ReactUpdateQueue.old';
import {
  isRendering as ReactCurrentFiberIsRendering,
  current as ReactCurrentFiberCurrent,
  resetCurrentFiber as resetCurrentDebugFiberInDEV,
  setCurrentFiber as setCurrentDebugFiberInDEV,
} from './ReactCurrentFiber';
import {StrictMode} from './ReactTypeOfMode';
import {
  SyncLane,
  InputDiscreteHydrationLane,
  SelectiveHydrationLane,
  NoTimestamp,
  getHighestPriorityPendingLanes,
  higherPriorityLane,
  getCurrentUpdateLanePriority,
  setCurrentUpdateLanePriority,
} from './ReactFiberLane';
import {
  scheduleRefresh,
  scheduleRoot,
  setRefreshHandler,
  findHostInstancesForRefresh,
} from './ReactFiberHotReloading.old';
import {markRenderScheduled} from './SchedulingProfiler';

export {registerMutableSourceForHydration} from './ReactMutableSource.new';
export {createPortal} from './ReactPortal';
export {
  createComponentSelector,
  createHasPsuedoClassSelector,
  createRoleSelector,
  createTestNameSelector,
  createTextSelector,
  getFindAllNodesFailureDescription,
  findAllNodes,
  findBoundingRects,
  focusWithin,
  observeVisibleRects,
} from './ReactTestSelectors';

type OpaqueRoot = FiberRoot;

// 0 is PROD, 1 is DEV.
// Might add PROFILE later.
type BundleType = 0 | 1;

type DevToolsConfig = {|
  bundleType: BundleType,
  version: string,
  rendererPackageName: string,
  // Note: this actually *does* depend on Fiber internal fields.
  // Used by "inspect clicked DOM element" in React DevTools.
  findFiberByHostInstance?: (instance: Instance | TextInstance) => Fiber | null,
  rendererConfig?: RendererInspectionConfig,
|};

let didWarnAboutNestedUpdates;
let didWarnAboutFindNodeInStrictMode;

if (__DEV__) {
  didWarnAboutNestedUpdates = false;
  didWarnAboutFindNodeInStrictMode = {};
}

// TODO: 获取上下文
function getContextForSubtree(
  parentComponent: ?React$Component<any, any>,
): Object {
  // 如果没有父节点，则返回空上下文,
  if (!parentComponent) {
    return emptyContextObject;
  }

  // 获取当前父组件对应的fiber节点，TODO: 其实是从 parentComponent._reactInternals
  const fiber = getInstance(parentComponent);
  // TODO: 获取某个上下文
  const parentContext = findCurrentUnmaskedContext(fiber);

  // 如果是泪组件创建的
  if (fiber.tag === ClassComponent) {
    // 获取组件类型
    const Component = fiber.type;
    // TODO: 是否是传统的上下文提供
    if (isLegacyContextProvider(Component)) {
      // TODO: processChildContext
      return processChildContext(fiber, Component, parentContext);
    }
  }

  return parentContext;
}

function findHostInstance(component: Object): PublicInstance | null {
  const fiber = getInstance(component);
  if (fiber === undefined) {
    if (typeof component.render === 'function') {
      invariant(false, 'Unable to find node on an unmounted component.');
    } else {
      invariant(
        false,
        'Argument appears to not be a ReactComponent. Keys: %s',
        Object.keys(component),
      );
    }
  }
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

function findHostInstanceWithWarning(
  component: Object,
  methodName: string,
): PublicInstance | null {
  if (__DEV__) {
    const fiber = getInstance(component);
    if (fiber === undefined) {
      if (typeof component.render === 'function') {
        invariant(false, 'Unable to find node on an unmounted component.');
      } else {
        invariant(
          false,
          'Argument appears to not be a ReactComponent. Keys: %s',
          Object.keys(component),
        );
      }
    }
    const hostFiber = findCurrentHostFiber(fiber);
    if (hostFiber === null) {
      return null;
    }
    if (hostFiber.mode & StrictMode) {
      const componentName = getComponentName(fiber.type) || 'Component';
      if (!didWarnAboutFindNodeInStrictMode[componentName]) {
        didWarnAboutFindNodeInStrictMode[componentName] = true;

        const previousFiber = ReactCurrentFiberCurrent;
        try {
          setCurrentDebugFiberInDEV(hostFiber);
          if (fiber.mode & StrictMode) {
            console.error(
              '%s is deprecated in StrictMode. ' +
                '%s was passed an instance of %s which is inside StrictMode. ' +
                'Instead, add a ref directly to the element you want to reference. ' +
                'Learn more about using refs safely here: ' +
                'https://reactjs.org/link/strict-mode-find-node',
              methodName,
              methodName,
              componentName,
            );
          } else {
            console.error(
              '%s is deprecated in StrictMode. ' +
                '%s was passed an instance of %s which renders StrictMode children. ' +
                'Instead, add a ref directly to the element you want to reference. ' +
                'Learn more about using refs safely here: ' +
                'https://reactjs.org/link/strict-mode-find-node',
              methodName,
              methodName,
              componentName,
            );
          }
        } finally {
          // Ideally this should reset to previous but this shouldn't be called in
          // render and there's another warning for that anyway.
          if (previousFiber) {
            setCurrentDebugFiberInDEV(previousFiber);
          } else {
            resetCurrentDebugFiberInDEV();
          }
        }
      }
    }
    return hostFiber.stateNode;
  }
  return findHostInstance(component);
}

// 创建一个Fiber根节点(也被称作为容器)
export function createContainer(
  // 挂在dom节点
  containerInfo: Container,
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)// root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  // 当前阅读情况下有 LegacyRoot
  tag: RootTag,
  // 是否是ssr渲染
  hydrate: boolean,
  // ssr渲染回调事件对象，有onHydrated, onDeleted等
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): OpaqueRoot {
  // 创建一个Fiber根节点
  return createFiberRoot(containerInfo, tag, hydrate, hydrationCallbacks);
}

// 更新容器
export function updateContainer(
  // react元素
  element: ReactNodeList,
  // 当前fiber容器，为createContainer创建的根节点
  container: OpaqueRoot,
  // 副组件，web情况,当前版本下为null
  parentComponent: ?React$Component<any, any>,
  // 执行后的回调函数
  callback: ?Function,
): Lane {
  if (__DEV__) {
    // TODO: onScheduleRoot
    onScheduleRoot(container, element);
  }
  // TODO: 从createContainer中阅读current
  const current = container.current;
  // 获取事件时间, TODO: requestEventTime的真实意思
  const eventTime = requestEventTime();
  if (__DEV__) {
    // $FlowExpectedError - jest isn't a global, and isn't recognized outside of tests
    // 翻译：jest 不是全局的，并且在测试之外不被识别
    if ('undefined' !== typeof jest) {
      // TODO: 下面语句的含义
      warnIfUnmockedScheduler(current);
      warnIfNotScopedWithMatchingAct(current);
    }
  }
  // TODO: 理解lane含义
  // 临时可以理解为当前渲染的通道，为了支持后续的并发渲染
  const lane = requestUpdateLane(current);

  // 调试性能分析工具支持
  if (enableSchedulingProfiler) {
    markRenderScheduled(lane);
  }

  // 获取上下文，当前就是emptyContextObject，因为web dom模式下parentComponent为空
  const context = getContextForSubtree(parentComponent);
  // TODO:
  if (container.context === null) {
    container.context = context;
  } else {
    container.pendingContext = context;
  }

  if (__DEV__) {
    // 当前如果有组件在渲染，则警告提示， 一般都是死循环渲染导致的，比如render，componentDidUpdate中有改变状态陷入死循环
    if (
      // 当前是有有Fiber在渲染
      ReactCurrentFiberIsRendering &&
      // 当前渲染的Fiber的节点不为空
      ReactCurrentFiberCurrent !== null &&
      // 避免多次提示
      !didWarnAboutNestedUpdates
    ) {
      didWarnAboutNestedUpdates = true;
      console.error(
        'Render methods should be a pure function of props and state; ' +
          'triggering nested component updates from render is not allowed. ' +
          'If necessary, trigger nested updates in componentDidUpdate.\n\n' +
          'Check the render method of %s.',
        getComponentName(ReactCurrentFiberCurrent.type) || 'Unknown',
      );
      // 翻译: 渲染方法应该是 props 和 state 的纯函数； 不允许从渲染触发嵌套组件更新。
      //   如有必要，在componentDidUpdate中触发嵌套更新。检查%s的render方法
    }
  }

  // TODO: 创建更新对象，一个记录更新的数据结构
  const update = createUpdate(eventTime, lane);
  // Caution: React DevTools currently depends on this property
  // being called "element".
  // 翻译: React DevTools 目前依赖于这个被称为“element”的属性。
  // 给DevTools调试用
  update.payload = {element};

  // 设置回调函数
  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    if (__DEV__) {
      // 在开发模式下，如果callback不是函数，则发出警告
      if (typeof callback !== 'function') {
        console.error(
          'render(...): Expected the last optional `callback` argument to be a ' +
            'function. Instead received: %s.',
          callback,
        );
      }
    }
    update.callback = callback;
  }

  // 进入更新队列， TODO: 查看底层
  enqueueUpdate(current, update);
  // 使用fiber更新调度器， TODO: 查看底层
  scheduleUpdateOnFiber(current, lane, eventTime);

  return lane;
}

export {
  batchedEventUpdates,
  batchedUpdates,
  unbatchedUpdates,
  deferredUpdates,
  discreteUpdates,
  flushDiscreteUpdates,
  flushControlled,
  flushSync,
  flushPassiveEffects,
  IsThisRendererActing,
  act,
};

export function getPublicRootInstance(
  container: OpaqueRoot,
): React$Component<any, any> | PublicInstance | null {
  const containerFiber = container.current;
  if (!containerFiber.child) {
    return null;
  }
  switch (containerFiber.child.tag) {
    // HostComponent: 原生组件
    case HostComponent:
      return getPublicInstance(containerFiber.child.stateNode);
    default:
      return containerFiber.child.stateNode;
  }
}

export function attemptSynchronousHydration(fiber: Fiber): void {
  switch (fiber.tag) {
    case HostRoot:
      const root: FiberRoot = fiber.stateNode;
      if (root.hydrate) {
        // Flush the first scheduled "update".
        const lanes = getHighestPriorityPendingLanes(root);
        flushRoot(root, lanes);
      }
      break;
    case SuspenseComponent:
      const eventTime = requestEventTime();
      flushSync(() => scheduleUpdateOnFiber(fiber, SyncLane, eventTime));
      // If we're still blocked after this, we need to increase
      // the priority of any promises resolving within this
      // boundary so that they next attempt also has higher pri.
      const retryLane = InputDiscreteHydrationLane;
      markRetryLaneIfNotHydrated(fiber, retryLane);
      break;
  }
}

function markRetryLaneImpl(fiber: Fiber, retryLane: Lane) {
  const suspenseState: null | SuspenseState = fiber.memoizedState;
  if (suspenseState !== null && suspenseState.dehydrated !== null) {
    suspenseState.retryLane = higherPriorityLane(
      suspenseState.retryLane,
      retryLane,
    );
  }
}

// Increases the priority of thennables when they resolve within this boundary.
function markRetryLaneIfNotHydrated(fiber: Fiber, retryLane: Lane) {
  markRetryLaneImpl(fiber, retryLane);
  const alternate = fiber.alternate;
  if (alternate) {
    markRetryLaneImpl(alternate, retryLane);
  }
}

export function attemptUserBlockingHydration(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }
  const eventTime = requestEventTime();
  const lane = InputDiscreteHydrationLane;
  scheduleUpdateOnFiber(fiber, lane, eventTime);
  markRetryLaneIfNotHydrated(fiber, lane);
}

export function attemptContinuousHydration(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }
  const eventTime = requestEventTime();
  const lane = SelectiveHydrationLane;
  scheduleUpdateOnFiber(fiber, lane, eventTime);
  markRetryLaneIfNotHydrated(fiber, lane);
}

export function attemptHydrationAtCurrentPriority(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority other than synchronously flush it.
    return;
  }
  const eventTime = requestEventTime();
  const lane = requestUpdateLane(fiber);
  scheduleUpdateOnFiber(fiber, lane, eventTime);
  markRetryLaneIfNotHydrated(fiber, lane);
}

export function runWithPriority<T>(priority: LanePriority, fn: () => T) {
  const previousPriority = getCurrentUpdateLanePriority();
  try {
    setCurrentUpdateLanePriority(priority);
    return fn();
  } finally {
    setCurrentUpdateLanePriority(previousPriority);
  }
}

export {getCurrentUpdateLanePriority};

export {findHostInstance};

export {findHostInstanceWithWarning};

export function findHostInstanceWithNoPortals(
  fiber: Fiber,
): PublicInstance | null {
  const hostFiber = findCurrentHostFiberWithNoPortals(fiber);
  if (hostFiber === null) {
    return null;
  }
  if (hostFiber.tag === FundamentalComponent) {
    return hostFiber.stateNode.instance;
  }
  return hostFiber.stateNode;
}

let shouldSuspendImpl = fiber => false;

export function shouldSuspend(fiber: Fiber): boolean {
  return shouldSuspendImpl(fiber);
}

let overrideHookState = null;
let overrideHookStateDeletePath = null;
let overrideHookStateRenamePath = null;
let overrideProps = null;
let overridePropsDeletePath = null;
let overridePropsRenamePath = null;
let scheduleUpdate = null;
let setSuspenseHandler = null;

if (__DEV__) {
  const copyWithDeleteImpl = (
    obj: Object | Array<any>,
    path: Array<string | number>,
    index: number,
  ) => {
    const key = path[index];
    const updated = Array.isArray(obj) ? obj.slice() : {...obj};
    if (index + 1 === path.length) {
      if (Array.isArray(updated)) {
        updated.splice(((key: any): number), 1);
      } else {
        delete updated[key];
      }
      return updated;
    }
    // $FlowFixMe number or string is fine here
    updated[key] = copyWithDeleteImpl(obj[key], path, index + 1);
    return updated;
  };

  const copyWithDelete = (
    obj: Object | Array<any>,
    path: Array<string | number>,
  ): Object | Array<any> => {
    return copyWithDeleteImpl(obj, path, 0);
  };

  const copyWithRenameImpl = (
    obj: Object | Array<any>,
    oldPath: Array<string | number>,
    newPath: Array<string | number>,
    index: number,
  ) => {
    const oldKey = oldPath[index];
    const updated = Array.isArray(obj) ? obj.slice() : {...obj};
    if (index + 1 === oldPath.length) {
      const newKey = newPath[index];
      // $FlowFixMe number or string is fine here
      updated[newKey] = updated[oldKey];
      if (Array.isArray(updated)) {
        updated.splice(((oldKey: any): number), 1);
      } else {
        delete updated[oldKey];
      }
    } else {
      // $FlowFixMe number or string is fine here
      updated[oldKey] = copyWithRenameImpl(
        // $FlowFixMe number or string is fine here
        obj[oldKey],
        oldPath,
        newPath,
        index + 1,
      );
    }
    return updated;
  };

  const copyWithRename = (
    obj: Object | Array<any>,
    oldPath: Array<string | number>,
    newPath: Array<string | number>,
  ): Object | Array<any> => {
    if (oldPath.length !== newPath.length) {
      console.warn('copyWithRename() expects paths of the same length');
      return;
    } else {
      for (let i = 0; i < newPath.length - 1; i++) {
        if (oldPath[i] !== newPath[i]) {
          console.warn(
            'copyWithRename() expects paths to be the same except for the deepest key',
          );
          return;
        }
      }
    }
    return copyWithRenameImpl(obj, oldPath, newPath, 0);
  };

  const copyWithSetImpl = (
    obj: Object | Array<any>,
    path: Array<string | number>,
    index: number,
    value: any,
  ) => {
    if (index >= path.length) {
      return value;
    }
    const key = path[index];
    const updated = Array.isArray(obj) ? obj.slice() : {...obj};
    // $FlowFixMe number or string is fine here
    updated[key] = copyWithSetImpl(obj[key], path, index + 1, value);
    return updated;
  };

  const copyWithSet = (
    obj: Object | Array<any>,
    path: Array<string | number>,
    value: any,
  ): Object | Array<any> => {
    return copyWithSetImpl(obj, path, 0, value);
  };

  const findHook = (fiber: Fiber, id: number) => {
    // For now, the "id" of stateful hooks is just the stateful hook index.
    // This may change in the future with e.g. nested hooks.
    let currentHook = fiber.memoizedState;
    while (currentHook !== null && id > 0) {
      currentHook = currentHook.next;
      id--;
    }
    return currentHook;
  };

  // Support DevTools editable values for useState and useReducer.
  overrideHookState = (
    fiber: Fiber,
    id: number,
    path: Array<string | number>,
    value: any,
  ) => {
    const hook = findHook(fiber, id);
    if (hook !== null) {
      const newState = copyWithSet(hook.memoizedState, path, value);
      hook.memoizedState = newState;
      hook.baseState = newState;

      // We aren't actually adding an update to the queue,
      // because there is no update we can add for useReducer hooks that won't trigger an error.
      // (There's no appropriate action type for DevTools overrides.)
      // As a result though, React will see the scheduled update as a noop and bailout.
      // Shallow cloning props works as a workaround for now to bypass the bailout check.
      fiber.memoizedProps = {...fiber.memoizedProps};

      scheduleUpdateOnFiber(fiber, SyncLane, NoTimestamp);
    }
  };
  overrideHookStateDeletePath = (
    fiber: Fiber,
    id: number,
    path: Array<string | number>,
  ) => {
    const hook = findHook(fiber, id);
    if (hook !== null) {
      const newState = copyWithDelete(hook.memoizedState, path);
      hook.memoizedState = newState;
      hook.baseState = newState;

      // We aren't actually adding an update to the queue,
      // because there is no update we can add for useReducer hooks that won't trigger an error.
      // (There's no appropriate action type for DevTools overrides.)
      // As a result though, React will see the scheduled update as a noop and bailout.
      // Shallow cloning props works as a workaround for now to bypass the bailout check.
      fiber.memoizedProps = {...fiber.memoizedProps};

      scheduleUpdateOnFiber(fiber, SyncLane, NoTimestamp);
    }
  };
  overrideHookStateRenamePath = (
    fiber: Fiber,
    id: number,
    oldPath: Array<string | number>,
    newPath: Array<string | number>,
  ) => {
    const hook = findHook(fiber, id);
    if (hook !== null) {
      const newState = copyWithRename(hook.memoizedState, oldPath, newPath);
      hook.memoizedState = newState;
      hook.baseState = newState;

      // We aren't actually adding an update to the queue,
      // because there is no update we can add for useReducer hooks that won't trigger an error.
      // (There's no appropriate action type for DevTools overrides.)
      // As a result though, React will see the scheduled update as a noop and bailout.
      // Shallow cloning props works as a workaround for now to bypass the bailout check.
      fiber.memoizedProps = {...fiber.memoizedProps};

      scheduleUpdateOnFiber(fiber, SyncLane, NoTimestamp);
    }
  };

  // Support DevTools props for function components, forwardRef, memo, host components, etc.
  overrideProps = (fiber: Fiber, path: Array<string | number>, value: any) => {
    fiber.pendingProps = copyWithSet(fiber.memoizedProps, path, value);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    scheduleUpdateOnFiber(fiber, SyncLane, NoTimestamp);
  };
  overridePropsDeletePath = (fiber: Fiber, path: Array<string | number>) => {
    fiber.pendingProps = copyWithDelete(fiber.memoizedProps, path);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    scheduleUpdateOnFiber(fiber, SyncLane, NoTimestamp);
  };
  overridePropsRenamePath = (
    fiber: Fiber,
    oldPath: Array<string | number>,
    newPath: Array<string | number>,
  ) => {
    fiber.pendingProps = copyWithRename(fiber.memoizedProps, oldPath, newPath);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    scheduleUpdateOnFiber(fiber, SyncLane, NoTimestamp);
  };

  scheduleUpdate = (fiber: Fiber) => {
    scheduleUpdateOnFiber(fiber, SyncLane, NoTimestamp);
  };

  setSuspenseHandler = (newShouldSuspendImpl: Fiber => boolean) => {
    shouldSuspendImpl = newShouldSuspendImpl;
  };
}

function findHostInstanceByFiber(fiber: Fiber): Instance | TextInstance | null {
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

function emptyFindFiberByHostInstance(
  instance: Instance | TextInstance,
): Fiber | null {
  return null;
}

function getCurrentFiberForDevTools() {
  return ReactCurrentFiberCurrent;
}

export function injectIntoDevTools(devToolsConfig: DevToolsConfig): boolean {
  const {findFiberByHostInstance} = devToolsConfig;
  const {ReactCurrentDispatcher} = ReactSharedInternals;

  return injectInternals({
    bundleType: devToolsConfig.bundleType,
    version: devToolsConfig.version,
    rendererPackageName: devToolsConfig.rendererPackageName,
    rendererConfig: devToolsConfig.rendererConfig,
    overrideHookState,
    overrideHookStateDeletePath,
    overrideHookStateRenamePath,
    overrideProps,
    overridePropsDeletePath,
    overridePropsRenamePath,
    setSuspenseHandler,
    scheduleUpdate,
    currentDispatcherRef: ReactCurrentDispatcher,
    findHostInstanceByFiber,
    findFiberByHostInstance:
      findFiberByHostInstance || emptyFindFiberByHostInstance,
    // React Refresh
    findHostInstancesForRefresh: __DEV__ ? findHostInstancesForRefresh : null,
    scheduleRefresh: __DEV__ ? scheduleRefresh : null,
    scheduleRoot: __DEV__ ? scheduleRoot : null,
    setRefreshHandler: __DEV__ ? setRefreshHandler : null,
    // Enables DevTools to append owner stacks to error messages in DEV mode.
    getCurrentFiber: __DEV__ ? getCurrentFiberForDevTools : null,
  });
}
