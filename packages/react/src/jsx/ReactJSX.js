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
// 开发模式下使用待验证的jsx函数，非开发模式使用正式jsx函数
const jsx = __DEV__ ? jsxWithValidationDynamic : jsxProd;
// we may want to special case jsxs internally to take advantage of static children.
// for now we can ship identical prod functions
// 译：我们可能希望在内部对JSX进行特殊处理，以利用静态子级。但目前，在生产环境还是不可用无效状态
// 意思是，jsxs是为了处理静态子级功能，但是在生产环境，跟普通jsx一致
// 跟jsx的区别？
// 生产环境没有区别，都是用的jsxProd, 开发模式下的区别是, jsxs会对子节点做一个校验，只允许数组类型的子节点，
// 并且数组第一层的子节点可以不设置key。
const jsxs = __DEV__ ? jsxWithValidationStatic : jsxProd;
// 开发模式下的jsx函数，携带参数验证，支持更多的提示日志
// jsxWithValidation和jsxWithValidationDynamic，jsxWithValidationStatic的区别？
//   jsxWithValidationDynamic就是用jsxWithValidation实现，参入的第四个参数固定为false(即不创建静态子节点)
//   jsxWithValidationStatic也是用jsxWithValidation实现，参入的第四个参数固定为true(创建静态子节点)
//   所以jsxWithValidationDynamic，jsxWithValidationStatic就是jsxWithValidation的特定场景版本
const jsxDEV = __DEV__ ? jsxWithValidation : undefined;

/**
 * react 17的jsx入口
 * jsx, jsxs都是React17中替代React.createElement方案
 */
export {REACT_FRAGMENT_TYPE as Fragment, jsx, jsxs, jsxDEV};
