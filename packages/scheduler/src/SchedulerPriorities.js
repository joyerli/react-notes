/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

// TODO: Use symbols?
// 没有优先级
export const NoPriority = 0;
// 需要立即反馈的优先级,最高
export const ImmediatePriority = 1;
// 阻塞用户操作的优先级
export const UserBlockingPriority = 2;
// 普通优先级
export const NormalPriority = 3;
// 低优先级
export const LowPriority = 4;
// 等待空闲时间在执行的优先级任务
export const IdlePriority = 5;
