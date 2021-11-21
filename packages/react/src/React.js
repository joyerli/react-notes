/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import ReactVersion from 'shared/ReactVersion';
import {
  REACT_FRAGMENT_TYPE,
  REACT_DEBUG_TRACING_MODE_TYPE,
  REACT_PROFILER_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_SUSPENSE_TYPE,
  REACT_SUSPENSE_LIST_TYPE,
  REACT_LEGACY_HIDDEN_TYPE,
  REACT_SCOPE_TYPE,
} from 'shared/ReactSymbols';

import {Component, PureComponent} from './ReactBaseClasses';
import {createRef} from './ReactCreateRef';
import {forEach, map, count, toArray, only} from './ReactChildren';
import {
  createElement as createElementProd,
  createFactory as createFactoryProd,
  cloneElement as cloneElementProd,
  isValidElement,
} from './ReactElement';
import {createContext} from './ReactContext';
import {lazy} from './ReactLazy';
import {forwardRef} from './ReactForwardRef';
import {memo} from './ReactMemo';
import {block} from './ReactBlock';
import {
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useDebugValue,
  useLayoutEffect,
  useMemo,
  useMutableSource,
  useReducer,
  useRef,
  useState,
  useTransition,
  useDeferredValue,
  useOpaqueIdentifier,
} from './ReactHooks';
import {
  createElementWithValidation,
  createFactoryWithValidation,
  cloneElementWithValidation,
} from './ReactElementValidator';
import {createMutableSource} from './ReactMutableSource';
import ReactSharedInternals from './ReactSharedInternals';
import {createFundamental} from './ReactFundamental';
import {startTransition} from './ReactStartTransition';

// TODO: Move this branching into the other module instead and just re-export.
// 如果是开发环境采用携带验证方式的函数，生产环境导入精简代码
const createElement = __DEV__ ? createElementWithValidation : createElementProd;
const cloneElement = __DEV__ ? cloneElementWithValidation : cloneElementProd;
const createFactory = __DEV__ ? createFactoryWithValidation : createFactoryProd;

const Children = {
  map,
  forEach,
  count,
  toArray,
  only,
};

export {
  // 子节点工具
  Children,
  createMutableSource,
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
  // hooks
  useMemo,
  // hooks
  useMutableSource,
  // hooks
  useReducer,
  // hooks
  useRef,
  // hooks
  useState,
  // 空标签，代码片段
  REACT_FRAGMENT_TYPE as Fragment,
  // 性能分析
  REACT_PROFILER_TYPE as Profiler,
  // 严格模式
  REACT_STRICT_MODE_TYPE as StrictMode,
  REACT_DEBUG_TRACING_MODE_TYPE as unstable_DebugTracingMode,
  // 配合lazy加载组件后才显示组件
  REACT_SUSPENSE_TYPE as Suspense,
  // 创建一个react元素(节点)
  createElement,
  // 克隆一个react元素(节点)
  cloneElement,
  // 判断是否为一个react元素(节点)
  isValidElement,
  // 版本
  ReactVersion as version,
  // 内部共享
  ReactSharedInternals as __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  // 创建指定类型的react元素，已被废弃
  // Deprecated behind disableCreateFactory
  createFactory,
  // 并发渲染模式下的相关hooks
  // Concurrent Mode
  useTransition,
  // 并发渲染模式下的相关hooks
  startTransition,
  useDeferredValue,
  REACT_SUSPENSE_LIST_TYPE as SuspenseList,
  REACT_LEGACY_HIDDEN_TYPE as unstable_LegacyHidden,
  // enableBlocksAPI
  block,
  // enableFundamentalAPI
  createFundamental as unstable_createFundamental,
  // enableScopeAPI
  REACT_SCOPE_TYPE as unstable_Scope,
  useOpaqueIdentifier as unstable_useOpaqueIdentifier,
};
