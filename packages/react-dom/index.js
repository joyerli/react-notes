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

// 翻译：导出所有的内容用于方便测试时使用。受限于flow导致无法使用export *

//  17官方文档中公布的api有hydrate, findDOMNode, render, unmountComponentAtNode, createPortal,
// 其他出来的api都是方便测试使用。

// 暴露的api列表
export {
  // 创建 portal, 将react节点挂载在另外一个dom节点中
  createPortal,
  // TODO: 不稳定特性，待研究
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
  // TODO: 不稳定特性，待研究
  createRoot,
  createRoot as unstable_createRoot,
  // TODO: 不稳定特性，待研究
  createBlockingRoot,
  createBlockingRoot as unstable_createBlockingRoot,
  // TODO: 不稳定特性，待研究
  unstable_flushControlled,
  // TODO: 不稳定特性，待研究
  unstable_scheduleHydration,
  // TODO: 不稳定特性，待研究
  unstable_runWithPriority,
  // TODO: 不稳定特性，待研究
  unstable_renderSubtreeIntoContainer,
  // TODO: 不稳定特性，待研究
  unstable_createPortal,
  // TODO: 不稳定特性，待研究
  unstable_createEventHandle,
  // TODO: 不稳定特性，待研究
  unstable_isNewReconciler,
} from './src/client/ReactDOM';
