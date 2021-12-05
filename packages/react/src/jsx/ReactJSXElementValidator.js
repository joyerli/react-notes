/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * ReactElementValidator provides a wrapper around a element factory
 * which validates the props passed to the element. This is intended to be
 * used only in DEV and could be replaced by a static type checker for languages
 * that support it.
 */

// 翻译：ReactElementValidator 为元素工厂提供了一个包装器，用于验证传递给元素的道具。
// 这旨在仅在 DEV 中使用，并且可以由支持它的语言的静态类型检查器替换。

// 本文本(ReactElementValidator)只是给真正的执行函数外面包装一层验证逻辑，
//   以提供在开发模式下更加友好的日志提示。

import isValidElementType from 'shared/isValidElementType';
import getComponentName from 'shared/getComponentName';
import checkPropTypes from 'shared/checkPropTypes';
import {
  getIteratorFn,
  REACT_FORWARD_REF_TYPE,
  REACT_MEMO_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_ELEMENT_TYPE,
} from 'shared/ReactSymbols';
import {warnAboutSpreadingKeyToJSX} from 'shared/ReactFeatureFlags';

import {jsxDEV} from './ReactJSXElement';

import {describeUnknownElementTypeFrameInDEV} from 'shared/ReactComponentStackFrame';

import ReactSharedInternals from 'shared/ReactSharedInternals';

// TODO: 当前所有者？
const ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;
// TODO: 当前调试窗口？
const ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;

// 将当前元素元素设置为观察窗口中的验证元素（TODO: 应该是用在devtool中）
function setCurrentlyValidatingElement(element) {
  if (__DEV__) {
    if (element) {
      const owner = element._owner;
      // TODO:获取报错堆栈
      const stack = describeUnknownElementTypeFrameInDEV(
        element.type,
        element._source,
        owner ? owner.type : null,
      );
      // TODO:设置报错窗口
      ReactDebugCurrentFrame.setExtraStackFrame(stack);
    } else {
      ReactDebugCurrentFrame.setExtraStackFrame(null);
    }
  }
}

let propTypesMisspellWarningShown;

if (__DEV__) {
  propTypesMisspellWarningShown = false;
}

const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Verifies the object is a ReactElement.
 * See https://reactjs.org/docs/react-api.html#isvalidelement
 *
 * 译：验证参数对象是一个React元素。
 *
 * @param {?object} object
 * @return {boolean} True if `object` is a ReactElement.
 * @final
 */
export function isValidElement(object) {
  if (__DEV__) {
    // 需要为非空对象，且有符合特殊标记$$typeof等于react内置标记REACT_ELEMENT_TYPE
    return (
      typeof object === 'object' &&
      object !== null &&
      object.$$typeof === REACT_ELEMENT_TYPE
    );
  }
}

// 获取发生错误的渲染函数名信息
function getDeclarationErrorAddendum() {
  if (__DEV__) {
    // TODO: 阅读ReactCurrentOwner.current是个啥
    if (ReactCurrentOwner.current) {
      const name = getComponentName(ReactCurrentOwner.current.type);
      if (name) {
        return '\n\nCheck the render method of `' + name + '`.';
      }
    }
    return '';
  }
}

// 根据文件信息获取报错点信息，返回一个包含文件名和行号的信息提示字符串
function getSourceInfoErrorAddendum(source) {
  if (__DEV__) {
    if (source !== undefined) {
      const fileName = source.fileName.replace(/^.*[\\\/]/, '');
      const lineNumber = source.lineNumber;
      return '\n\nCheck your code at ' + fileName + ':' + lineNumber + '.';
    }
    return '';
  }
}

/**
 * Warn if there's no key explicitly set on dynamic arrays of children or
 * object keys are not valid. This allows us to keep track of children between
 * updates.
 */

// 译：如果没有在子项的动态数组上显式设置key或key无效，则发出警告。 这允许我们在更新之间跟踪数组子节点

// 这个对象用于组件对子节点没有设置key报错信息的缓存。这会意味着一个组件第一次找到存在没有设置key的数组子节点时，
// 打印警告信息，后续还存在是不会会被忽略。
const ownerHasKeyUseWarning = {};

// 获取当前组件用于报错中的关键信息（主要是组件名）
function getCurrentComponentErrorInfo(parentType) {
  if (__DEV__) {
    let info = getDeclarationErrorAddendum();

    if (!info) {
      const parentName =
        typeof parentType === 'string'
          ? parentType
          : parentType.displayName || parentType.name;
      if (parentName) {
        info = `\n\nCheck the top-level render call using <${parentName}>.`;
      }
    }
    return info;
  }
}

/**
 * Warn if the element doesn't have an explicit key assigned to it.
 * This element is in an array. The array could grow and shrink or be
 * reordered. All children that haven't already been validated are required to
 * have a "key" property assigned to it. Error statuses are cached so a warning
 * will only be shown once.
 *
 * 翻译：
 * 如果元素没有分配给它的显式键，则发出警告。 这个元素在一个数组中。
 * 数组可以增长和缩小或重新排序。 所有尚未经过验证的子项都需要为其分配一个“key”属性。
 * 错误状态会被缓存，因此警告只会显示一次。
 *
 * 验证每个元素是否携带key。因为如果是一个元素数组的话，数组可能增加缩小和重排，如果没有设置key，
 * 则会出现在元素内容没有发生变化的时候，但由于数组位置发生变化，导致diff算法看起来，进而会重新渲染。
 * 所以需要给数组中的元素都设置key。
 * 注意该警告在同一个地方只会提示一次，后续会被缓存。
 *
 * @internal
 * @param {ReactElement} element Element that requires a key.
 * @param {*} parentType element's parent's type.
 */
function validateExplicitKey(element, parentType) {
  if (__DEV__) {
    if (
      // 判断是否被校验过
      !element._store || element._store.validated
      // 设置了key
      || element.key != null
    ) {
      return;
    }
    // 设置缓存
    element._store.validated = true;

    // 获取当前组件中用于报错信息
    const currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
    // 下面的一小段代码用于保证一个组件一次只提示一个没有设置key的警告信息
    // 如果已经报错过了（组件层次），则忽略
    if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
      return;
    }
    // 组件已报错缓存
    ownerHasKeyUseWarning[currentComponentErrorInfo] = true;

    // Usually the current owner is the offender, but if it accepts children as a
    // property, it may be the creator of the child that's responsible for
    // assigning it a key.

    // 翻译：通常当前的所有者是一个“罪犯”，但是当前的children可能是通过组件的属性传递过来，
    //  此时这个组件应该维护它的key

    // 当children是通过属性设置时，可以提示是某个组件的children属性的值忘记设置key属性了

    let childOwner = '';
    if (
      element &&
      element._owner &&
      element._owner !== ReactCurrentOwner.current
    ) {
      // Give the component that originally created this child.
      childOwner = ` It was passed a child from ${getComponentName(
        element._owner.type,
      )}.`;
    }

    // 将当前元素元素设置为观察窗口中的验证元素（TODO: 应该是用在devtool中）
    setCurrentlyValidatingElement(element);
    // 报错提示
    console.error(
      'Each child in a list should have a unique "key" prop.' +
        '%s%s See https://reactjs.org/link/warning-keys for more information.',
      currentComponentErrorInfo,
      childOwner,
    );
    // 清空窗口
    setCurrentlyValidatingElement(null);
  }
}

/**
 * Ensure that every element either is passed in a static location, in an
 * array with an explicit keys property defined, or in an object literal
 * with valid key property.
 *
 * 翻译：确保每个元素都在静态位置、在定义了显式键属性的数组中或在具有有效键属性的对象文字中传递。
 *
 * 每个为元素类型的子节点必须要key。文本子节点不需要
 *
 * @internal
 * @param {ReactNode} node Statically passed child of any type.
 * @param {*} parentType node's parent's type.
 */
function validateChildKeys(node, parentType) {
  if (__DEV__) {
    // 为文本，空节点
    if (typeof node !== 'object') {
      return;
    }
    // 如果当前节点还是一个数组
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const child = node[i];
        // 是否是一个合法的元素
        if (isValidElement(child)) {
          // TODO: 验证元素的
          validateExplicitKey(child, parentType);
        }
      }
    } else
    // 如果是一个合法的元素，此时不是一个数组
    if (isValidElement(node)) {
      // This element was passed in a valid location. 保存元素通过检验标记
      // 节点存储验证信息
      if (node._store) {
        node._store.validated = true;
      }
    } else if (node) {
      // 判断node是否为一个具有迭代器的数据对象
      const iteratorFn = getIteratorFn(node);
      if (typeof iteratorFn === 'function') {
        // Entry iterators used to provide implicit keys,
        // but now we print a separate warning for them later.
        // 入口迭代器曾经提供隐式键，但现在我们稍后为它们打印单独的警告

        // 将迭代器遍历
        if (iteratorFn !== node.entries) {
          const iterator = iteratorFn.call(node);
          let step;
          while (!(step = iterator.next()).done) {
            // 验证每一个迭代器的值
            if (isValidElement(step.value)) {
              validateExplicitKey(step.value, parentType);
            }
          }
        }
      }
    }
  }
}

/**
 * Given an element, validate that its props follow the propTypes definition,
 * provided by the type.
 *
 * 传递一个元素，验证他的属性是否符合propTypes定义。
 *
 * 验证元素中props值
 *
 * @param {ReactElement} element
 */
function validatePropTypes(element) {
  if (__DEV__) {
    const type = element.type;
    // 如果不是一个组件
    if (type === null || type === undefined || typeof type === 'string') {
      return;
    }

    // 获取属性定义
    let propTypes;
    if (typeof type === 'function') {
      propTypes = type.propTypes;
    } else if (
      typeof type === 'object' &&
      (type.$$typeof === REACT_FORWARD_REF_TYPE ||
        // Note: Memo only checks outer props here.
        // Inner props are checked in the reconciler.

        // 翻译：Memo元素只会验证表层的props值，内部的值交给reconciler去校验。

        type.$$typeof === REACT_MEMO_TYPE)
    ) {
      propTypes = type.propTypes;
    } else {
      return;
    }
    // 如果有属性定义
    if (propTypes) {
      // Intentionally inside to avoid triggering lazy initializers:
      // 翻译: 故意写在里面，避免触发懒初始（意思每一次都重新获取组件名）
      // 获取组件名
      const name = getComponentName(type);
      // 验证元素中的props值是否符合定义的属性类型
      checkPropTypes(propTypes, element.props, 'prop', name, element);
    } else
    // 如果没有属性定义，却又配置了没有属性定义则警告的特性，打印警告信息
    if (type.PropTypes !== undefined && !propTypesMisspellWarningShown) {
      propTypesMisspellWarningShown = true;
      // Intentionally inside to avoid triggering lazy initializers:
      // 翻译: 故意写在里面，避免触发懒初始（意思每一次都重新获取组件名）
      const name = getComponentName(type);
      console.error(
        'Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?',
        name || 'Unknown',
      );
    }
    // 如果在不是React.createClass创建的组件中设置了getDefaultProps，则警告
    if (
      typeof type.getDefaultProps === 'function' &&
      !type.getDefaultProps.isReactClassApproved
    ) {
      console.error(
        'getDefaultProps is only used on classic React.createClass ' +
          'definitions. Use a static property named `defaultProps` instead.',
      );
    }
  }
}

/**
 * Given a fragment, validate that it can only be provided with fragment props
 *
 * 翻译：传递进来一个fragment元素，验证其正确性
 *
 * @param {ReactElement} fragment
 */
function validateFragmentProps(fragment) {
  if (__DEV__) {
    const keys = Object.keys(fragment.props);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      // 只允许包含key和children这两种属性
      if (key !== 'children' && key !== 'key') {
        // TODO: 设置当前报错元素
        setCurrentlyValidatingElement(fragment);
        console.error(
          'Invalid prop `%s` supplied to `React.Fragment`. ' +
            'React.Fragment can only have `key` and `children` props.',
          key,
        );
        setCurrentlyValidatingElement(null);
        break;
      }
    }

    // 不允许有ref属性
    if (fragment.ref !== null) {
      setCurrentlyValidatingElement(fragment);
      console.error('Invalid attribute `ref` supplied to `React.Fragment`.');
      setCurrentlyValidatingElement(null);
    }
  }
}

// 携带验证提示信息的jsx函数
// 对开发更加友好的jsx函数，会对元素的一些设定进行判断，对可能不是期望操作进行警告提示。
// TODO: 最后需要跟../ReactElementValidator.createElementWithValidation做差异对比
export function jsxWithValidation(
  type,
  props,
  key,
  isStaticChildren,
  source,
  self,
) {
  // 只有开发模式执行
  if (__DEV__) {
    // 是否是一个合法的元素类型（html标签；组件；内建标记）
    const validType = isValidElementType(type);

    // We warn in this case but don't throw. We expect the element creation to
    // succeed and there will likely be errors in render.
    // 译：在这种情况下，我们会发出警告，但不会抛出。我们希望元素创建成功，并且渲染中可能会出现错误。
    // 意思为，为了维持跟生产环境一致的行为，只对数据进行验证和信息警告，并不会抛出异常终端。

    // 如果不是合法的类型，提示
    if (!validType) {
      let info = '';
      if (
        type === undefined ||
        (typeof type === 'object' &&
          type !== null &&
          Object.keys(type).length === 0)
      ) {
        info +=
          ' You likely forgot to export your component from the file ' +
          "it's defined in, or you might have mixed up default and named imports.";
      }

      // 根据文件信息获取报错点信息，返回一个包含文件名和行号的信息提示字符串
      const sourceInfo = getSourceInfoErrorAddendum(source);
      // 如果能获取到报错文件信息，则追加到报错信息中，提高体验
      if (sourceInfo) {
        info += sourceInfo;
      } else {
        // 如果不能从文件信息中获取信息（此时可能没有传递source参数），则追加报错render函数信息，提示使用者
        //  那个渲染函数中有错误代码
        info += getDeclarationErrorAddendum();
      }

      // 得到当前非法类型描述
      let typeString;
      if (type === null) {
        typeString = 'null';
      } else if (Array.isArray(type)) {
        typeString = 'array';
      } else
      // 判断出type为React Element 而不是组件，组件其实可以看作是一个元素的工厂函数。
      if (type !== undefined && type.$$typeof === REACT_ELEMENT_TYPE) {
        // 注意，此时type是一个元素
        typeString = `<${getComponentName(type.type) || 'Unknown'} />`;
        info =
          ' Did you accidentally export a JSX literal instead of a component?';
      } else {
        typeString = typeof type;
      }

      // 报错提示，说明不支持这些类型
      console.error(
        'React.jsx: type is invalid -- expected a string (for ' +
          'built-in components) or a class/function (for composite ' +
          'components) but got: %s.%s',
        typeString,
        info,
      );
    }

    // 调用开发模式的jsx函数
    // 该函数为真正的逻辑函数，而jsxWithValidation为他的包裹函数，在它之上添加了一些保持行为一致的记录日志的语句
    const element = jsxDEV(type, props, key, source, self);

    // The result can be nullish if a mock or a custom function is used.
    // TODO: Drop this when these are no longer allowed as the type argument.

    // 译：如果使用模拟或自定义函数，则结果可能为空。TODO：当不再允许将其作为类型参数时，请删除此选项。
    // 意思是，为了兼容历史债务，jsxDEV可能返回为空，所以有下面的代码判断

    // TODO: 但从当前实际的代码来看，element已经不可能为空，所以这是一段历史遗留忘记删除的无用代码
    if (element == null) {
      return element;
    }

    // 后续主要是验证element内部值是否合法

    // Skip key warning if the type isn't valid since our key validation logic
    // doesn't expect a non-string/function type and can throw confusing errors.
    // We don't want exception behavior to differ between dev and prod.
    // (Rendering will throw with a helpful message and as soon as the type is
    // fixed, the key warnings will appear.)

    // 百度翻译：如果类型无效，则跳过键警告，因为我们的键验证逻辑不需要非字符串/函数类型，
    //   并且可能引发混乱的错误。我们不希望dev和prod之间的异常行为有所不同。
    //   （渲染将抛出一条有用的消息，一旦类型被修复，就会出现关键警告。）

    // 理解下来就是说，如果类型已经无效了，那么就不需要提示下面if代码快的报错信息了。
    //  因为下面这个if中的校验逻辑只有在类型有效的情况下才需要符合。验证的逻辑主要是验证子节点。
    if (validType) {
      const children = props.children;
      // 如果子节点不为空，则进入校验子节点的环节
      if (children !== undefined) {
        // 是否静态子节点
        if (isStaticChildren) {
          if (Array.isArray(children)) {
            // 静态子节点的最外层子节点不要求设置key,其他更深层需要
            for (let i = 0; i < children.length; i++) {
              // 判断数组中的每一个项是否设置是一个包含合法key的children数组
              validateChildKeys(children[i], type);
            }

            // 给每个子节点冻结（ps：这个行为在这里发生，岂不是开发模式子节点被冻结，生产环境不冻结，不一致了？？？）
            if (Object.freeze) {
              Object.freeze(children);
            }
          } else {
            // 静态子节点必须为一个数组
            console.error(
              'React.jsx: Static children should always be an array. ' +
                'You are likely explicitly calling React.jsxs or React.jsxDEV. ' +
                'Use the Babel transform instead.',
            );
          }
        } else {
          // 判断子节点如果为数组中的则每个子节都要设置key属性
          validateChildKeys(children, type);
        }
      }
    }

    // TODO: 这是个啥？猜测是react支持开启的一些开关或者配置
    // 警惕的逻辑是
    // 如果开启了将key作为一个解构对象中的使用，那么就现实警告信息。
    // 意味着在代码<SomeComp {...props} />，如果props中包含key，官方是不推荐的.
    // 建议你这样使用 <SomeComp {...props} key={key}/>props中不包含key
    if (warnAboutSpreadingKeyToJSX) {
      if (hasOwnProperty.call(props, 'key')) {
        console.error(
          'React.jsx: Spreading a key to JSX is a deprecated pattern. ' +
            'Explicitly pass a key after spreading props in your JSX call. ' +
            'E.g. <%s {...props} key={key} />',
          getComponentName(type) || 'ComponentName',
        );
      }
    }

    // 如果是空元素（Fragment），则验证元素中的属性（只允许有key, children）
    if (type === REACT_FRAGMENT_TYPE) {
      validateFragmentProps(element);
    } else {
      // 验证元素中的属性
      validatePropTypes(element);
    }

    return element;
  }
}

// These two functions exist to still get child warnings in dev
// even with the prod transform. This means that jsxDEV is purely
// opt-in behavior for better messages but that we won't stop
// giving you warnings if you use production apis.
// 译：下面的两个函数的存在是为了在dev中即使使用prod转换也能获得子警告。
//   这意味着jsxDEV纯粹是为了获得更好的消息而选择加入的行为，但如果您使用生产API，我们不会停止向您发出警告。
// 意思是，虽然这里整体的代码是提供到生产环境的(因为这是从模块jsx-runtime提供出去的，为生产环境使用)，
//  但存在把正式环境的代码强制使用到开发环境的情况，在这种情况下，也提供更多的提示日志。

// jsxs api在开发模式下底层函数
export function jsxWithValidationStatic(type, props, key) {
  if (__DEV__) {
    // 注意只会传递四个参数
    return jsxWithValidation(type, props, key, true);
  }
}

// 开发模式下jsx函数底层函数
export function jsxWithValidationDynamic(type, props, key) {
  if (__DEV__) {
    // 可以看到底层都是jsxWithValidation实现
    // 注意只会传递四个参数
    return jsxWithValidation(type, props, key, false);
  }
}
