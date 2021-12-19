/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Use invariant() to assert state which your program assumes to be true.
 *
 * 翻译：使用 invariant() 来断言您的程序假定为真的状态。
 *
 * Provide sprintf-style format (only %s is supported) and arguments
 * to provide information about what broke and what you were
 * expecting.
 *
 * // 提供 sprintf 样式的格式（仅支持 %s）和参数以提供有关破坏内容和预期内容的信息
 *
 * The invariant message will be stripped in production, but the invariant
 * will remain to ensure logic does not differ in production.
 *
 * // 不变消息将在生产中被剥离，但不变将保留以确保逻辑在生产中不会有所不同。
 */
// 这个函数是一个编译锚点，利用babel参数，在开发模式下，会变成一个检验逻辑，当不通过时，会报错。
// 生产环境会被忽略。
// 下面代码：
// invariant(
//   isValidContainer(container),
//   'Target container is not a DOM element.',
// );
// 会被编译成：
//  if (!isValidContainer(container)) {
//    {
//      throw Error( "Target container is not a DOM element." );
//    }
//  }
export default function invariant(condition, format, a, b, c, d, e, f) {
  throw new Error(
    'Internal React error: invariant() is meant to be replaced at compile ' +
      'time. There is no runtime version.',
  );
}
