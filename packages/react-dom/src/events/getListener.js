/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @flow
 */

import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';
import type {Props} from '../client/ReactDOMHostConfig';

import invariant from 'shared/invariant';
import {getFiberCurrentPropsFromNode} from '../client/ReactDOMComponentTree';

function isInteractive(tag: string): boolean {
  return (
    tag === 'button' ||
    tag === 'input' ||
    tag === 'select' ||
    tag === 'textarea'
  );
}

// 是否是不需要处理的事件，也就是无效的事件处理器
// 主要是判断设置了disabled属性的button，input, select等dom对象的事件处理属性
function shouldPreventMouseEvent(
  // 监听器类型属性名，如onClick
  name: string,
  // fiber类型
  type: string,
  // 组件实例的props对象
  props: Props,
): boolean {
  switch (name) {
    case 'onClick':
    case 'onClickCapture':
    case 'onDoubleClick':
    case 'onDoubleClickCapture':
    case 'onMouseDown':
    case 'onMouseDownCapture':
    case 'onMouseMove':
    case 'onMouseMoveCapture':
    case 'onMouseUp':
    case 'onMouseUpCapture':
    case 'onMouseEnter':
      // 按钮(button),输入框(input), 下拉框(select), 文本域(textarea)元素且禁用
      return !!(props.disabled && isInteractive(type));
    default:
      return false;
  }
}

// 获取一个fiber对象中的监听处理器
// 从fiber的状态节点(组件实例)中的props对象拿到对应的监听器
/**
 * @param {object} inst The instance, which is the source of events.
 * 实例，它是事件的来源。
 * @param {string} registrationName Name of listener (e.g. `onClick`).
 * 监听器名字，标准的react的on*属性，如onClick
 * @return {?function} The stored callback.
 * 返回一个回掉函数
 */
export default function getListener(
  inst: Fiber,
  registrationName: string,
): Function | null {
  // 获取对应的状态节点(组件实例)
  const stateNode = inst.stateNode;
  // 如果没有，直接返回
  if (stateNode === null) {
    // Work in progress (ex: onload events in incremental mode).
    // 正在进行的工作（例如：增量模式下的 onload 事件）。
    return null;
  }
  // 获取状态节点的props对象
  const props = getFiberCurrentPropsFromNode(stateNode);
  // 如果不存在，直接返回
  if (props === null) {
    // Work in progress.
    //  正在进行的工作
    return null;
  }
  // 获取对应的属性值
  const listener = props[registrationName];
  // 是否是不需要处理的事件，也就是无效的事件处理器
  // 主要是判断设置了disabled属性的button，input, select等dom对象的事件处理属性
  if (shouldPreventMouseEvent(registrationName, inst.type, props)) {
    return null;
  }
  // 断言
  invariant(
    !listener || typeof listener === 'function',
    'Expected `%s` listener to be a function, instead got a value of `%s` type.',
    registrationName,
    typeof listener,
  );
  return listener;
}
