/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type EventSystemFlags = number;

// 非托管节点的事件
export const IS_EVENT_HANDLE_NON_MANAGED_NODE = 1;
// 没有委托的事件
export const IS_NON_DELEGATED = 1 << 1;
// 捕获(capture)阶段事件
export const IS_CAPTURE_PHASE = 1 << 2;
// passive事件模式
export const IS_PASSIVE = 1 << 3;
// TODO: 重播模式
export const IS_REPLAYED = 1 << 4;
// 支持传统fb使用的事件模式
export const IS_LEGACY_FB_SUPPORT_MODE = 1 << 5;

// 不延迟点击, 支持传统的FB行为的事件模式
export const SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE =
  IS_LEGACY_FB_SUPPORT_MODE | IS_REPLAYED | IS_CAPTURE_PHASE;

// We do not want to defer if the event system has already been
// set to LEGACY_FB_SUPPORT. LEGACY_FB_SUPPORT only gets set when
// we call willDeferLaterForLegacyFBSupport, thus not bailing out
// will result in endless cycles like an infinite loop.
// We also don't want to defer during event replaying.

// 翻译：
// 如果事件系统在设置启用了LEGACY_FB_SUPPORT却不想推迟的话就使用这个选择。
// 该模式下，LEGACY_FB_SUPPORT 仅在我们调用 willDeferLaterForLegacyFBSupport 时设置，
// 因此不退出将导致无限循环，如无限循环。 我们也不想在事件重播期间推迟。

export const SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS =
  IS_EVENT_HANDLE_NON_MANAGED_NODE | IS_NON_DELEGATED | IS_CAPTURE_PHASE;
