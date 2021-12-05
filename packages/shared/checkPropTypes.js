/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const loggedTypeFailures = {};

import {describeUnknownElementTypeFrameInDEV} from 'shared/ReactComponentStackFrame';

import ReactSharedInternals from 'shared/ReactSharedInternals';

const ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;

function setCurrentlyValidatingElement(element) {
  if (__DEV__) {
    if (element) {
      const owner = element._owner;
      const stack = describeUnknownElementTypeFrameInDEV(
        element.type,
        element._source,
        owner ? owner.type : null,
      );
      ReactDebugCurrentFrame.setExtraStackFrame(stack);
    } else {
      ReactDebugCurrentFrame.setExtraStackFrame(null);
    }
  }
}

// 验证元素中的props值是否符合定义的属性类型
export default function checkPropTypes(
  // 类型定义
  typeSpecs: Object,
  // 组件属性值集合
  values: Object,
  // 所属位置，用于友好的日志信息
  location: string,
  // 组件名
  componentName: ?string,
  // 元素对象
  element?: any,
): void {
  // 只会在开发模式检验
  if (__DEV__) {
    // $FlowFixMe This is okay but Flow doesn't know it.
    // 一个抱怨

    // 防空指针调用has
    const has = Function.call.bind(Object.prototype.hasOwnProperty);
    // 遍历类型定义中自由值(非继承值)
    for (const typeSpecName in typeSpecs) {
      if (has(typeSpecs, typeSpecName)) {
        let error;
        // Prop type validation may throw. In case they do, we don't want to
        // fail the render phase where it didn't fail before. So we log it.
        // After these have been cleaned up, we'll let them throw.

        // 翻译：Prop类型验证错误可能会抛出异常。 如果真的这样做了，我们不想这样导致渲染中断。
        // 所以我们记录它。 在最后都清理干净时，我们将抛出异常。

        // TODO: 啥意思

        try {
          // This is intentionally an invariant that gets caught. It's the same
          // behavior as without this statement except with a better message.

          // 翻译：这是故意被捕获的不变量。 除了有更好的消息外，它与没有此语句的行为相同。

          // TODO: 啥意思

          // 类型定义一定要为一个函数
          if (typeof typeSpecs[typeSpecName] !== 'function') {
            const err = Error(
              (componentName || 'React class') +
                ': ' +
                location +
                ' type `' +
                typeSpecName +
                '` is invalid; ' +
                'it must be a function, usually from the `prop-types` package, but received `' +
                typeof typeSpecs[typeSpecName] +
                '`.' +
                'This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.',
            );
            err.name = 'Invariant Violation';
            throw err;
          }
          // 执行类型定义函数，如果不符合需求，则返回一个异常
          // 从这里可以看出，一个类型定义器的接口：
          // (values: Record<string, any>, propName: string, componentName: string, location: string, ...other: any[])
          error = typeSpecs[typeSpecName](
            values,
            typeSpecName,
            componentName,
            location,
            null,
            'SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED',
          );
        } catch (ex) {
          error = ex;
        }
        // 存在异常，但异常对象不是Error的子类，则打印异常信息，此时一般为类型定义器返回非法，可能用了自定义定义器
        if (error && !(error instanceof Error)) {
          setCurrentlyValidatingElement(element);
          console.error(
            '%s: type specification of %s' +
              ' `%s` is invalid; the type checker ' +
              'function must return `null` or an `Error` but returned a %s. ' +
              'You may have forgotten to pass an argument to the type checker ' +
              'creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and ' +
              'shape all require an argument).',
            componentName || 'React class',
            location,
            typeSpecName,
            typeof error,
          );
          setCurrentlyValidatingElement(null);
        }
        // 如果是一个合法的报错信息，并且这个报错没有打印过，则打印
        // 所以，类型定义检验的报错会根据错误对象的message信息进行缓存，如果打印过，则下次会被忽略，保持控制台报错信息整洁。
        if (error instanceof Error && !(error.message in loggedTypeFailures)) {
          // Only monitor this failure once because there tends to be a lot of the
          // same error.
          loggedTypeFailures[error.message] = true;
          setCurrentlyValidatingElement(element);
          console.error('Failed %s type: %s', location, error.message);
          setCurrentlyValidatingElement(null);
        }
      }
    }
  }
}
