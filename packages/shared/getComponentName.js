/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {LazyComponent} from 'react/src/ReactLazy';

import {
  REACT_CONTEXT_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_PORTAL_TYPE,
  REACT_MEMO_TYPE,
  REACT_PROFILER_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_SUSPENSE_TYPE,
  REACT_SUSPENSE_LIST_TYPE,
  REACT_LAZY_TYPE,
  REACT_BLOCK_TYPE,
} from 'shared/ReactSymbols';
import type {ReactContext, ReactProviderType} from 'shared/ReactTypes';

function getWrappedName(
  outerType: mixed,
  innerType: any,
  wrapperName: string,
): string {
  const functionName = innerType.displayName || innerType.name || '';
  return (
    (outerType: any).displayName ||
    (functionName !== '' ? `${wrapperName}(${functionName})` : wrapperName)
  );
}

function getContextName(type: ReactContext<any>) {
  return type.displayName || 'Context';
}

// 获取组件名
function getComponentName(type: mixed): string | null {
  // 如果传入空，则返回空
  if (type == null) {
    // Host root, text node or just invalid type.
    return null;
  }
  if (__DEV__) {
    // 如果参数包含一个数字类型的tag值，则警告这是一个react的bug
    // ???
    if (typeof (type: any).tag === 'number') {
      console.error(
        'Received an unexpected object in getComponentName(). ' +
          'This is likely a bug in React. Please file an issue.',
      );
    }
  }
  // 如果是一个组件，则有设置displayName则返回displayName，没有则有name返回name,还没有则返回空
  if (typeof type === 'function') {
    return (type: any).displayName || type.name || null;
  }
  // 如果是html元素名，则直接返回
  if (typeof type === 'string') {
    return type;
  }
  // 如果是一些内建的具有特别含义的元素对象，则返回对应的api描述
  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return 'Fragment';
    case REACT_PORTAL_TYPE:
      return 'Portal';
    case REACT_PROFILER_TYPE:
      return 'Profiler';
    case REACT_STRICT_MODE_TYPE:
      return 'StrictMode';
    case REACT_SUSPENSE_TYPE:
      return 'Suspense';
    case REACT_SUSPENSE_LIST_TYPE:
      return 'SuspenseList';
  }
  // 如果是一个对象
  if (typeof type === 'object') {
    // 有特定的$$typeof值，判断看是什么内建对象标识；
    // 一般react包裹函数返回的都是一个对象作为元素的类型。
    switch (type.$$typeof) {
      case REACT_CONTEXT_TYPE:
        const context: ReactContext<any> = (type: any);
        return getContextName(context) + '.Consumer';
      case REACT_PROVIDER_TYPE:
        const provider: ReactProviderType<any> = (type: any);
        return getContextName(provider._context) + '.Provider';
      case REACT_FORWARD_REF_TYPE:
        return getWrappedName(type, type.render, 'ForwardRef');
      case REACT_MEMO_TYPE:
        return getComponentName(type.type);
      case REACT_BLOCK_TYPE:
        return getComponentName(type._render);
      case REACT_LAZY_TYPE: {
        const lazyComponent: LazyComponent<any, any> = (type: any);
        const payload = lazyComponent._payload;
        const init = lazyComponent._init;
        try {
          return getComponentName(init(payload));
        } catch (x) {
          return null;
        }
      }
    }
  }
  // 如果不符合，则返回空
  return null;
}

export default getComponentName;
