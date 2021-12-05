/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import getComponentName from 'shared/getComponentName';
import ReactSharedInternals from 'shared/ReactSharedInternals';

import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols';

const ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;

const hasOwnProperty = Object.prototype.hasOwnProperty;

const RESERVED_PROPS = {
  key: true,
  ref: true,
  __self: true,
  __source: true,
};

let specialPropKeyWarningShown;
let specialPropRefWarningShown;
let didWarnAboutStringRefs;

if (__DEV__) {
  didWarnAboutStringRefs = {};
}

// 是否有合法的ref值
function hasValidRef(config) {
  if (__DEV__) {
    // 特殊情况: 如果是属性集中包含key，但有警告设置，那么就当作是没有(返回false)
    if (hasOwnProperty.call(config, 'ref')) {
      const getter = Object.getOwnPropertyDescriptor(config, 'ref').get;
      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }
  // 判断是否有ref
  return config.ref !== undefined;
}

// 是否有合法的key
function hasValidKey(config) {
  if (__DEV__) {
    // 特殊情况: 如果是属性集中包含key，但有警告设置，那么就当作是没有(返回false)
    if (hasOwnProperty.call(config, 'key')) {
      const getter = Object.getOwnPropertyDescriptor(config, 'key').get;
      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }
  // 判断是否有key
  return config.key !== undefined;
}

// 如果ref的值设置为一个字符串，则打印警告
function warnIfStringRefCannotBeAutoConverted(config, self) {
  if (__DEV__) {
    if (
      typeof config.ref === 'string' &&
      ReactCurrentOwner.current &&
      self &&
      // TODO: 这段话的含义
      ReactCurrentOwner.current.stateNode !== self
    ) {
      const componentName = getComponentName(ReactCurrentOwner.current.type);

      // 警告打印操作同样有缓存，保证每一个组件同样一个错误只打印一次
      if (!didWarnAboutStringRefs[componentName]) {
        console.error(
          'Component "%s" contains the string ref "%s". ' +
            'Support for string refs will be removed in a future major release. ' +
            'This case cannot be automatically converted to an arrow function. ' +
            'We ask you to manually fix this case by using useRef() or createRef() instead. ' +
            'Learn more about using refs safely here: ' +
            'https://reactjs.org/link/strict-mode-string-ref',
          getComponentName(ReactCurrentOwner.current.type),
          config.ref,
        );
        didWarnAboutStringRefs[componentName] = true;
      }
    }
  }
}

// 定义属性集中的key值
// 并且限制key属性的取值行为，发生时会打印警告
function defineKeyPropWarningGetter(props, displayName) {
  if (__DEV__) {
    const warnAboutAccessingKey = function() {
      if (!specialPropKeyWarningShown) {
        specialPropKeyWarningShown = true;
        console.error(
          '%s: `key` is not a prop. Trying to access it will result ' +
            'in `undefined` being returned. If you need to access the same ' +
            'value within the child component, you should pass it as a different ' +
            'prop. (https://reactjs.org/link/special-props)',
          displayName,
        );
      }
    };
    warnAboutAccessingKey.isReactWarning = true;
    Object.defineProperty(props, 'key', {
      get: warnAboutAccessingKey,
      configurable: true,
    });
  }
}

// 定义属性集中的ref值
// 并且限制ref属性的取值行为，发生时会打印警告
function defineRefPropWarningGetter(props, displayName) {
  if (__DEV__) {
    const warnAboutAccessingRef = function() {
      if (!specialPropRefWarningShown) {
        specialPropRefWarningShown = true;
        console.error(
          '%s: `ref` is not a prop. Trying to access it will result ' +
            'in `undefined` being returned. If you need to access the same ' +
            'value within the child component, you should pass it as a different ' +
            'prop. (https://reactjs.org/link/special-props)',
          displayName,
        );
      }
    };
    warnAboutAccessingRef.isReactWarning = true;
    Object.defineProperty(props, 'ref', {
      get: warnAboutAccessingRef,
      configurable: true,
    });
  }
}

/**
 * Factory method to create a new React element. This no longer adheres to
 * the class pattern, so do not use new to call it. Also, instanceof check
 * will not work. Instead test $$typeof field against Symbol.for('react.element') to check
 * if something is a React Element.
 *
 * 翻译：创建新React元素的工厂函数。 不再使用类形式来创建新的元素对象，所以也就不再使用`new`关键字。
 * 这会导致无法使用instanceof来检查对象是否为一个元素对象，新的方式需要针对对象属性$$typeof是否等于Symbol.for('react.element')来判断。
 *
 * 创建一个React元素对象
 *
 * TODO: 跟../ReactElement.js中的ReactElement函数有什么区别
 *
 * @param {*} type
 * @param {*} props
 * @param {*} key
 * @param {string|object} ref
 * @param {*} owner
 * @param {*} self A *temporary* helper to detect places where `this` is
 * different from the `owner` when React.createElement is called, so that we
 * can warn. We want to get rid of owner and replace string `ref`s with arrow
 * functions, and as long as `this` and owner are the same, there will be no
 * change in behavior.
 *
 * 翻译：当 React.createElement 被调用时，一个 *temporary* 帮助器检测 `this` 与 `owner` 不同的地方
 *  以便我们可以发出警告。 我们想去掉 owner 并用箭头函数替换字符串 `ref`s，
 *  只要 `this` 和 owner 相同，行为就不会改变。
 *
 * owner是react框架在执行的时候，一直会记录的一个当前节点对应的对象。
 * 而self是转译器在转译的时候会传递进来，调用React.createElement所在环境的this值。
 * 更多探讨可以查看`./ReactElement.js`中的`ReactElement`函数的注释说明
 *
 * @param {*} source An annotation object (added by a transpiler or otherwise)
 * indicating filename, line number, and/or other information.
 * 翻译：一个注释对象，由转译器(如babel)提供.包含filename，line number和其他信息。
 * @internal // 意思是内部使用，请勿自己导入使用
 */
const ReactElement = function(type, key, ref, self, source, owner, props) {
  const element = {
    // This tag allows us to uniquely identify this as a React Element

    // 翻译：react元素对象标记

    // 通过判断该属性，可以判断对象是否是一个react元素

    $$typeof: REACT_ELEMENT_TYPE,

    // Built-in properties that belong on the element

    // 原属内建属性

    // 类型，可以是一个组件，一个html标签字符串，react内建标识或者对象表示
    type: type,
    key: key,
    ref: ref,
    // 属性值
    props: props,

    // Record the component responsible for creating this element.
    // 翻译：记录负责创建此元素的组件。
    // 该字段负责记录创建该元素的组件元素将会对挂载到的FiberNode节点对象
    _owner: owner,
  };

  if (__DEV__) {
    // The validation flag is currently mutative. We put it on
    // an external backing store so that we can freeze the whole object.
    // This can be replaced with a WeakMap once they are implemented in
    // commonly used development environments.

    // 翻译: 验证标志当前是可变的。我们把它放在一个外部后备存储器中，这样我们就可以冻结整个对象。

    //  一旦它们在常用的开发环境中实现，就可以用WeakMap来代替。
    // 初始化元素的_store属性, 一个额外的存储对象，当前只有validated这个标记。
    //  用于在开发模式下，标记这个元素是否经过数据校验。
    element._store = {};

    // To make comparing ReactElements easier for testing purposes, we make
    // the validation flag non-enumerable (where possible, which should
    // include every environment we run tests in), so the test framework
    // ignores it.

    // 翻译：为了使比较ReactElements更容易进行测试，
    //  我们将验证标志设置为不可枚举（在可能的情况下，它应该包括我们在其中运行测试的每个环境），
    //  因此测试框架会忽略它。
    // 定义元素对象中的_store.validated

    Object.defineProperty(element._store, 'validated', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: false,
    });

    // self and source are DEV only properties.
    // 翻译： self和source时开发模式下才有的属性
    // 初始化元素中的_self属性，并且后续不可变更
    Object.defineProperty(element, '_self', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: self,
    });
    // Two elements created in two different places should be considered
    // equal for testing purposes and therefore we hide it from enumeration.
    // 翻译：在测试场景中，在不同位置创建的两个元素应该时同等，所以将其设置为不可枚举(隐藏他)
    Object.defineProperty(element, '_source', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: source,
    });
    // 如果当前语言环境支持冻结，那么冻结元素的属性集合和元素。
    // 注意只在开发模式下冻结，生产环境不冻结
    if (Object.freeze) {
      Object.freeze(element.props);
      Object.freeze(element);
    }
  }

  return element;
};

/**
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type
 * @param {object} props
 * @param {string} key
 */
// 创建jsx标签函数，代替react.createElement函数。

// 跟createElement的区别:
// api不同：createElement参数列表type, props, children, 而jsx是type, props和maybeKey，两者区别是children传递不同。
//   createElement的子节点列表是作为单独的参数，jsx是作为props中的一个属性。其他jsx中支持maybeKey，来支持key的更加标准化。
export function jsx(type, config, maybeKey) {
  let propName;

  // Reserved names are extracted
  const props = {};

  let key = null;
  let ref = null;

  // Currently, key can be spread in as a prop. This causes a potential
  // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
  // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
  // but as an intermediary step, we will use jsxDEV for everything except
  // <div {...props} key="Hi" />, because we aren't currently able to tell if
  // key is explicitly declared to be undefined or not.

  // 翻译： 当前，key可以通过prop 传递。如果key是显式传递（如 <div {...props} key="Hi" /> 或者 <div key="Hi" {...props} />），
  // 这会导致一些潜在问题。后续想放弃key的传递, 但当前作为中间支持，由于无法明确的判断key是否被定义了，
  // 会对除<div {...props} key="Hi" />外的使用方式使用jsxDEV，

  // 意思react以后计划放弃通过{...props}支持key值的传递, key必须显式的在当前层设置，不会渗透到下一层。
  // 当前为了兼容老代码，才有下面的写法。

  // 如果有maybeKey， 也就是<div key="Hi" {...props} />中设置的key

  if (maybeKey !== undefined) {
    key = '' + maybeKey;
  }

  // 如果属性集中有设置key, 则使用属性集中的值
  if (hasValidKey(config)) {
    key = '' + config.key;
  }

  // 如果属性值中有ref配置，则使用
  if (hasValidRef(config)) {
    // 当ref设置为字符串时打印警告信息
    ref = config.ref;
  }

  // Remaining properties are added to a new props object

  // 剩余的属性都添加到一个新的属性集里面去

  // 将所有的传递进来的属性集复制到一个新的对象中去。
  // 注意不会复制传入进来的属性集的继承属性和key, ref, __self, __source。
  for (propName in config) {
    if (
      hasOwnProperty.call(config, propName) &&
      // RESERVED_PROPS为key, ref, __self, __source。
      !RESERVED_PROPS.hasOwnProperty(propName)
    ) {
      props[propName] = config[propName];
    }
  }

  // Resolve default props

  // 生效默认值
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

  // 创建一个ELEMENT对象返回
  return ReactElement(
    type,
    key,
    ref,
    undefined,
    undefined,
    ReactCurrentOwner.current,
    props,
  );
}

/**
 * 开发模式下的jsx函数，jsx创建一个react元素的工具函数。协助编译器将jsx语法转义成创建react元素的函数
 * jsx函数是react.createElement的优化版本，专供编译器使用
 *
 * jsxDEV跟jsx有什么区别
 *  * jsxDEV比jsx多支持传递source，self对象，用于生成错误提示
 *  * jsxDEV比jsx多了一个ref设置为字符串的错误警告
 *  * jsxDEV生成的react元素中的props属性中多了key和ref这两个属性
 *
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type  元素类型，为组件或者html标签名或者内建标识和内建对象标识
 * @param {object} props 属性集合
 * @param {string} maybeKey 可能的key，单独解析出来，单独设置，因为有特殊情况
 */
export function jsxDEV(type, config, maybeKey, source, self) {
  // 只在开发模式生效
  if (__DEV__) {
    let propName;

    // Reserved names are extracted
    const props = {};

    let key = null;
    let ref = null;

    // Currently, key can be spread in as a prop. This causes a potential
    // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
    // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
    // but as an intermediary step, we will use jsxDEV for everything except
    // <div {...props} key="Hi" />, because we aren't currently able to tell if
    // key is explicitly declared to be undefined or not.

    // 翻译： 当前，key可以通过prop 传递。如果key是显式传递（如 <div {...props} key="Hi" /> 或者 <div key="Hi" {...props} />），
    // 这会导致一些潜在问题。后续想放弃key的传递, 但当前作为中间支持，由于无法明确的判断key是否被定义了，
    // 会对除<div {...props} key="Hi" />外的使用方式使用jsxDEV，

    // 意思react以后计划放弃通过{...props}支持key值的传递, key必须显式的在当前层设置，不会渗透到下一层。
    // 当前为了兼容老代码，才有下面的写法。

    // 如果有maybeKey， 也就是<div key="Hi" {...props} />中设置的key
    if (maybeKey !== undefined) {
      key = '' + maybeKey;
    }

    // 如果属性集中有设置key, 则使用属性集中的值
    if (hasValidKey(config)) {
      key = '' + config.key;
    }

    // 如果属性值中有ref配置，则使用
    if (hasValidRef(config)) {
      ref = config.ref;
      // 当ref设置为字符串时打印警告信息
      warnIfStringRefCannotBeAutoConverted(config, self);
    }

    // Remaining properties are added to a new props object
    // 将所有的属性信息迁移到一个新对象
    // 可以断开原属性集对象引用
    // 注意不会复制传入进来的属性集的继承属性和key, ref, __self, __source。
    for (propName in config) {
      if (
        hasOwnProperty.call(config, propName) &&
        // RESERVED_PROPS为key, ref, __self, __source。
        !RESERVED_PROPS.hasOwnProperty(propName)
      ) {
        props[propName] = config[propName];
      }
    }

    // Resolve default props

    // 生效默认值
    if (type && type.defaultProps) {
      const defaultProps = type.defaultProps;
      for (propName in defaultProps) {
        if (props[propName] === undefined) {
          props[propName] = defaultProps[propName];
        }
      }
    }

    // 将key和ref的都设置到props对象中
    // 只在开发模式下生效
    // TODO: 当前不知道有何用
    if (key || ref) {
      const displayName =
        typeof type === 'function'
          ? type.displayName || type.name || 'Unknown'
          : type;
      if (key) {
        defineKeyPropWarningGetter(props, displayName);
      }
      if (ref) {
        defineRefPropWarningGetter(props, displayName);
      }
    }

    // 构建一个react元素
    return ReactElement(
      type,
      key,
      ref,
      self,
      source,
      ReactCurrentOwner.current,
      props,
    );
  }
}
