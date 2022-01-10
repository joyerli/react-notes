/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

/* eslint-disable react-internal/invariant-args */

import invariant from 'shared/invariant';

// We expect that our Rollup, Jest, and Flow configurations
// always shim this module with the corresponding host config
// (either provided by a renderer, or a generic shim for npm).
// 翻译：
// 我们希望我们的 Rollup、Jest 和 Flow 配置始终使用相应的主机配置（由渲染器提供，或 npm 的通用 shim）填充此模块。
//
// We should never resolve to this file, but it exists to make
// sure that if we *do* accidentally break the configuration,
// the failure isn't silent.
// 翻译：我们永远不应该解析到这个文件，但它的存在是为了确保如果我们 *do* 不小心破坏了配置，失败不是静默的。
//

invariant(false, 'This module must be shimmed by a specific renderer.');
