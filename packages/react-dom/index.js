/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Export all exports so that they're available in tests.
// We can't use export * from in Flow for some reason.
export {
  // 创建 portal, 将react节点挂载在另外一个dom节点中
  createPortal,
  unstable_batchedUpdates,
  // 提高渲染优先级
  flushSync,
  // 一些不稳定的内部使用api
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  // 版本
  version,
  // 查找组件对应的dom节点，严格模式下禁止使用，不推荐使用，可使用ref方案代替
  findDOMNode,
  // 挂载组件，在指定的容器中渲染一个react元素,作用于ssr场景
  hydrate,
  // 挂载组件，在指定的容器中渲染一个react元素
  render,
  // 卸载组件
  unmountComponentAtNode,
  createRoot,
  createRoot as unstable_createRoot,
  createBlockingRoot,
  createBlockingRoot as unstable_createBlockingRoot,
  unstable_flushControlled,
  unstable_scheduleHydration,
  unstable_runWithPriority,
  unstable_renderSubtreeIntoContainer,
  unstable_createPortal,
  unstable_createEventHandle,
  unstable_isNewReconciler,
} from './src/client/ReactDOM';
