/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import invariant from 'shared/invariant';
import {
  getInstanceFromNode,
  getFiberCurrentPropsFromNode,
} from '../client/ReactDOMComponentTree';

// Use to restore controlled state after a change event has fired.

let restoreImpl = null;
let restoreTarget = null;
let restoreQueue = null;

// 重置节点状态
function restoreStateOfTarget(target: Node) {
  // We perform this translation at the end of the event loop so that we
  // always receive the correct fiber here

  // 翻译：
  // 我们在事件循环结束时执行此转换，以便我们始终在此处接收正确的fiber对象

  // 从节点中获取fiber实例
  const internalInstance = getInstanceFromNode(target);
  if (!internalInstance) {
    // Unmounted
    // 如果没有，代表已经卸载了
    return;
  }
  // 下面的提示日志，
  // 需要调用 setRestoreImplementation() 来处理受控事件的目标。 此错误可能是由 React 中的错误引起的。 请提出issue。
  invariant(
    typeof restoreImpl === 'function',
    'setRestoreImplementation() needs to be called to handle a target for controlled ' +
      'events. This error is likely caused by a bug in React. Please file an issue.',
  );
  // 获取fiber对象中的状态节点
  const stateNode = internalInstance.stateNode;
  // Guard against Fiber being unmounted.
  // 翻译：放置fiber被卸载
  if (stateNode) {
    // 从状态节点中获取fiber对象的属性集
    const props = getFiberCurrentPropsFromNode(stateNode);
    // 恢复状态
    restoreImpl(internalInstance.stateNode, internalInstance.type, props);
  }
}

export function setRestoreImplementation(
  impl: (domElement: Element, tag: string, props: Object) => void,
): void {
  restoreImpl = impl;
}

// 将需要的恢复事件相关的dom节点放入队列
export function enqueueStateRestore(target: Node): void {
  if (restoreTarget) {
    if (restoreQueue) {
      restoreQueue.push(target);
    } else {
      restoreQueue = [target];
    }
  } else {
    restoreTarget = target;
  }
}

// 受控的组件是否有待更新
export function needsStateRestore(): boolean {
  // 没有需要恢复的dom节点和没有需要恢复的节点队列
  // restoreTarget和restoreQueue应该是迭代过程中，不同时期为了相互兼容出来的
  // restoreTarget为首个需要恢复的节点，如果本批次超过1个，则会存入到restoreQueue中去
  return restoreTarget !== null || restoreQueue !== null;
}

// 恢复需要恢复的dom节点的对应组件的fiber对象的状态
export function restoreStateIfNeeded() {
  // 没有直接返回
  if (!restoreTarget) {
    return;
  }
  // 取出需要重置的节点和节点队列
  const target = restoreTarget;
  const queuedTargets = restoreQueue;
  // 置空保存需要重置的节点和节点队列
  restoreTarget = null;
  restoreQueue = null;

  // 重置dom节点对应组件的fiber对象的状态
  restoreStateOfTarget(target);
  // 重置队列中每个dom节点对应组件的fiber对象的状态
  if (queuedTargets) {
    for (let i = 0; i < queuedTargets.length; i++) {
      restoreStateOfTarget(queuedTargets[i]);
    }
  }
}
