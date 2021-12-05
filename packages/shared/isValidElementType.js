/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {
  REACT_CONTEXT_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_PROFILER_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_DEBUG_TRACING_MODE_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_SUSPENSE_TYPE,
  REACT_SUSPENSE_LIST_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
  REACT_FUNDAMENTAL_TYPE,
  REACT_SCOPE_TYPE,
  REACT_BLOCK_TYPE,
  REACT_SERVER_BLOCK_TYPE,
  REACT_LEGACY_HIDDEN_TYPE,
} from 'shared/ReactSymbols';
import {enableScopeAPI} from './ReactFeatureFlags';

// 判断参数是否是一个合法的元素类型
//  合法的元素类型应该：
//    1. 是一个函数，代表类组件和函数组件
//    2. 为一个字符串
//    3. 内建类型(标识或者标识对象)
export default function isValidElementType(type: mixed) {
  // 如果类型是一个字符串，或者是一个函数，则是合法的
  // 字符串是html标准标签，函数的话是React组件，注意js的类也是函数(构造函数)
  if (typeof type === 'string' || typeof type === 'function') {
    return true;
  }

  // Note: typeof might be other than 'symbol' or 'number' (e.g. if it's a polyfill).
  // 翻译：注意，可能是`symbol`常量或者数字(symbol垫片产生的是数字)
  // 如果是一些内建组件，如React.Fragment，也是合法的
  if (
    // React.Fragment
    type === REACT_FRAGMENT_TYPE ||
    // React.Profiler
    type === REACT_PROFILER_TYPE ||
    // React.unstable_DebugTracingMode
    type === REACT_DEBUG_TRACING_MODE_TYPE ||
    // React.StrictMode
    type === REACT_STRICT_MODE_TYPE ||
    // React.Suspense
    type === REACT_SUSPENSE_TYPE ||
    // React.SuspenseList
    type === REACT_SUSPENSE_LIST_TYPE ||
    // React.unstable_LegacyHidden
    type === REACT_LEGACY_HIDDEN_TYPE ||
    // React.unstable_Scope, 开启作用域api的话
    (enableScopeAPI && type === REACT_SCOPE_TYPE)
  ) {
    return true;
  }

  // 如果是一个对象且不为null
  if (typeof type === 'object' && type !== null) {
    // 如果其类型为下面类型，如果为REACT_SERVER_BLOCK_TYPE数组时，也是合法的type
    if (
      // 为React.lazy创建出来的对象
      type.$$typeof === REACT_LAZY_TYPE ||
      // 为React.memo创建出来的对象
      type.$$typeof === REACT_MEMO_TYPE ||
      // 为context.Provider对象
      type.$$typeof === REACT_PROVIDER_TYPE ||
      // 为context对象
      type.$$typeof === REACT_CONTEXT_TYPE ||
      // 为React.forwardRef函数返回对象
      type.$$typeof === REACT_FORWARD_REF_TYPE ||
      // 为react.unstable_createFundamental创建的对象
      type.$$typeof === REACT_FUNDAMENTAL_TYPE ||
      // 为react.block创建的对象
      type.$$typeof === REACT_BLOCK_TYPE ||
      // TODO:
      type[(0: any)] === REACT_SERVER_BLOCK_TYPE
    ) {
      return true;
    }
  }

  return false;
}
