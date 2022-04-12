/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {DOMEventName} from './DOMEventNames';

import {enableCreateEventHandleAPI} from 'shared/ReactFeatureFlags';

export const allNativeEvents: Set<DOMEventName> = new Set();

if (enableCreateEventHandleAPI) {
  allNativeEvents.add('beforeblur');
  allNativeEvents.add('afterblur');
}

/**
 * Mapping from registration name to event name
 */
export const registrationNameDependencies = {};

/**
 * Mapping from lowercase registration names to the properly cased version,
 * used to warn in the case of missing event handlers. Available
 * only in __DEV__.
 * @type {Object}
 */
export const possibleRegistrationNames = __DEV__ ? {} : (null: any);
// Trust the developer to only use possibleRegistrationNames in __DEV__

// 注册事件到两个阶段
export function registerTwoPhaseEvent(
  // 注册名, react事件属性名，如onClick
  registrationName: string,
  // 依赖列表,原生事件
  dependencies: Array<DOMEventName>,
): void {
  // 注册react的on属性
  registerDirectEvent(registrationName, dependencies);
  // 注册react的onXXXCapture属性
  registerDirectEvent(registrationName + 'Capture', dependencies);
}

// 注册react on属性
export function registerDirectEvent(
  // 注册名, react事件属性名，如onClick
  registrationName: string,
  // 依赖列表,原生事件
  dependencies: Array<DOMEventName>,
) {
  if (__DEV__) {
    // 如果已经被注册过了，则发出警告
    if (registrationNameDependencies[registrationName]) {
      console.error(
        'EventRegistry: More than one plugin attempted to publish the same ' +
          'registration name, `%s`.',
        registrationName,
      );
    }
  }

  // 缓存，防止多次注册
  registrationNameDependencies[registrationName] = dependencies;

  if (__DEV__) {
    const lowerCasedName = registrationName.toLowerCase();
    // 可能的注册信息映射表
    // TODO: ll 所以其实react中的事件属性on其实是大小写不敏感的？
    possibleRegistrationNames[lowerCasedName] = registrationName;

    // 特殊处理onDoubleClick，因为他还可能是ondblclick
    if (registrationName === 'onDoubleClick') {
      possibleRegistrationNames.ondblclick = registrationName;
    }
  }

  // 维护所有的原生事件队列
  for (let i = 0; i < dependencies.length; i++) {
    allNativeEvents.add(dependencies[i]);
  }
}
