/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */
import {REACT_FRAGMENT_TYPE} from 'shared/ReactSymbols';
import {
  jsxWithValidationStatic,
  jsxWithValidationDynamic,
  jsxWithValidation,
} from './ReactJSXElementValidator';
import {jsx as jsxProd} from './ReactJSXElement';
const jsx = __DEV__ ? jsxWithValidationDynamic : jsxProd;
// we may want to special case jsxs internally to take advantage of static children.
// for now we can ship identical prod functions
// 翻译: 我们可能希望在内部对JSX进行特殊处理，以利用静态子级。目前，我们可以提供相同的prod功能
// jsxs支持静态子节点的jsx方案
const jsxs = __DEV__ ? jsxWithValidationStatic : jsxProd;
const jsxDEV = __DEV__ ? jsxWithValidation : undefined;

/**
 * react 17的jsx入口
 * jsx, jsxs都是React17中替代React.createElement方案
 */
export {REACT_FRAGMENT_TYPE as Fragment, jsx, jsxs, jsxDEV};
