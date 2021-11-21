/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Keep in sync with https://github.com/facebook/flow/blob/master/lib/react.js
export type StatelessFunctionalComponent<
  P,
> = React$StatelessFunctionalComponent<P>;
export type ComponentType<-P> = React$ComponentType<P>;
export type AbstractComponent<
  -Config,
  +Instance = mixed,
> = React$AbstractComponent<Config, Instance>;
export type ElementType = React$ElementType;
export type Element<+C> = React$Element<C>;
export type Key = React$Key;
export type Ref<C> = React$Ref<C>;
export type Node = React$Node;
export type Context<T> = React$Context<T>;
export type Portal = React$Portal;
export type ElementProps<C> = React$ElementProps<C>;
export type ElementConfig<C> = React$ElementConfig<C>;
export type ElementRef<C> = React$ElementRef<C>;
export type Config<Props, DefaultProps> = React$Config<Props, DefaultProps>;
export type ChildrenArray<+T> = $ReadOnlyArray<ChildrenArray<T>> | T;
export type Interaction = {
  name: string,
  timestamp: number,
  ...
};

// Export all exports so that they're available in tests.
// We can't use export * from in Flow for some reason.

// react提供的api,可以看出主要代码在src/react里面
export {
  // 子节点工具
  Children,
  // 创建ref
  createRef,
  // 组件类，提供基础的react组件应该有的一些默认函数，如各种声明周期
  Component,
  // 基于PureComponent的一些定制，实现了shouldComponentUpdate
  PureComponent,
  // 创建一个应用上下文
  createContext,
  // 重定向ref
  forwardRef,
  // 懒加载组件
  lazy,
  // 缓存组件
  memo,
  // hooks
  useCallback,
  // hooks
  useContext,
  // hooks
  useEffect,
  // hooks
  useImperativeHandle,
  // hooks
  useDebugValue,
  // hooks
  useLayoutEffect,
  useMemo,
  // hooks
  useReducer,
  // hooks
  useRef,
  // hooks
  useState,
  useMutableSource,
  useMutableSource as unstable_useMutableSource,
  createMutableSource,
  createMutableSource as unstable_createMutableSource,
  // 空标签，代码片段
  Fragment,
  // 性能分析
  Profiler,
  unstable_DebugTracingMode,
  // 严格模式
  StrictMode,
  // 配合lazy加载组件后才显示组件
  Suspense,
  // 创建一个react元素(节点)
  createElement,
  // 克隆一个react元素(节点)
  cloneElement,
  // 判断是否为一个react元素(节点)
  isValidElement,
  // 版本
  version,
  // 内部函数，用了会被解雇
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  // 创建指定类型的react元素，已被废弃
  createFactory,
  useTransition,
  useTransition as unstable_useTransition,
  startTransition,
  startTransition as unstable_startTransition,
  useDeferredValue,
  useDeferredValue as unstable_useDeferredValue,
  SuspenseList,
  SuspenseList as unstable_SuspenseList,
  block,
  block as unstable_block,
  unstable_LegacyHidden,
  unstable_createFundamental,
  unstable_Scope,
  unstable_useOpaqueIdentifier,
} from './src/React';
