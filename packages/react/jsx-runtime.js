/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */
// 这些api会在下一代jsx代码在编译时，不再使用react.createElement; 而是倒入这些api进去。
// 这样的好处，jsx文件不在需要一定导入react模块。
// Fragment：空元素时使用
// jsx: 代React.createElement
// jsx: TODO: 暂时不知道
export {Fragment, jsx, jsxs} from './src/jsx/ReactJSX';
