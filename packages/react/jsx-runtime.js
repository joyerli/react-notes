/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// 下一代jsx编译支持方案中，使用这些api会在替换react.createElement使用。
// 这样的好处，jsx文件不在需要一定导入react模块。
// Fragment：空元素时使用
// jsx: 代React.createElement
// jsxs: 支持静态子节点的jsx

// jsx, jsxs都是React后续官方推进的的用于替代React.createElement方案
export {Fragment, jsx, jsxs} from './src/jsx/ReactJSX';
