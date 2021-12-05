/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import getComponentName from 'shared/getComponentName';
import invariant from 'shared/invariant';
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols';

import ReactCurrentOwner from './ReactCurrentOwner';

const hasOwnProperty = Object.prototype.hasOwnProperty;

const RESERVED_PROPS = {
  key: true,
  ref: true,
  __self: true,
  __source: true,
};

let specialPropKeyWarningShown,
  specialPropRefWarningShown,
  didWarnAboutStringRefs;

if (__DEV__) {
  didWarnAboutStringRefs = {};
}

function hasValidRef(config) {
  if (__DEV__) {
    if (hasOwnProperty.call(config, 'ref')) {
      const getter = Object.getOwnPropertyDescriptor(config, 'ref').get;
      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }
  return config.ref !== undefined;
}

function hasValidKey(config) {
  if (__DEV__) {
    if (hasOwnProperty.call(config, 'key')) {
      const getter = Object.getOwnPropertyDescriptor(config, 'key').get;
      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }
  return config.key !== undefined;
}

// 在开发模式下，获取属性对象中的key属性，则会报错，报错信息使用displayName优化体验
function defineKeyPropWarningGetter(props, displayName) {
  const warnAboutAccessingKey = function() {
    if (__DEV__) {
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
    }
  };
  warnAboutAccessingKey.isReactWarning = true;
  Object.defineProperty(props, 'key', {
    get: warnAboutAccessingKey,
    configurable: true,
  });
}


// 在开发模式下，获取属性对象中的reg属性，则会报错，报错信息使用displayName优化体验
function defineRefPropWarningGetter(props, displayName) {
  const warnAboutAccessingRef = function() {
    if (__DEV__) {
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
    }
  };
  warnAboutAccessingRef.isReactWarning = true;
  Object.defineProperty(props, 'ref', {
    get: warnAboutAccessingRef,
    configurable: true,
  });
}

function warnIfStringRefCannotBeAutoConverted(config) {
  if (__DEV__) {
    if (
      typeof config.ref === 'string' &&
      ReactCurrentOwner.current &&
      config.__self &&
      ReactCurrentOwner.current.stateNode !== config.__self
    ) {
      const componentName = getComponentName(ReactCurrentOwner.current.type);

      if (!didWarnAboutStringRefs[componentName]) {
        console.error(
          'Component "%s" contains the string ref "%s". ' +
            'Support for string refs will be removed in a future major release. ' +
            'This case cannot be automatically converted to an arrow function. ' +
            'We ask you to manually fix this case by using useRef() or createRef() instead. ' +
            'Learn more about using refs safely here: ' +
            'https://reactjs.org/link/strict-mode-string-ref',
          componentName,
          config.ref,
        );
        didWarnAboutStringRefs[componentName] = true;
      }
    }
  }
}

/**
 * Factory method to create a new React element. This no longer adheres to
 * the class pattern, so do not use new to call it. Also, instanceof check
 * will not work. Instead test $$typeof field against Symbol.for('react.element') to check
 * if something is a React Element.
 * 注释翻译: 创建一个新的react元素的工厂函数，将不在遵循类模式使用new去调用它。
 *  同样，不可以使用`instanceof`操作来检验一个元素是否属于某一个类，而是请使用元素对象中
 *  $$typeof字段和Symbol.for('react.element')判断。
 *
 * @param {*} type 元素类型
 * @param {*} props 元素属性
 * @param {*} key 元素编号
 * @param {string|object} ref ref属性
 * @param {*} owner TODO: 当前所有者,见下面self中的说明
 * @param {*} self A *temporary* helper to detect places where `this` is
 * different from the `owner` when React.createElement is called, so that we
 * can warn. We want to get rid of owner and replace string `ref`s with arrow
 * functions, and as long as `this` and owner are the same, there will be no
 * change in behavior.
 * 注释翻译: 一个在调用React.createElement时临时的判断调用者this跟owner不一致时发出警告的机制。
 *  后续ref只允许使用箭头函数方式，就可以保证this跟owner不会出现不一致，该机制也就可以废除掉。
 * TODO:
 * 实际情况下，经过研究发现：
 * 对于 owner，为调用React.createElement所在组件对象会被挂载到的容器FiberNode节点，
 *  FiberNode为虚拟dom节点, 可以是没有真实的dom对应的节点。如:
 *
 * class Welcome extends React.PureComponent {
 *   render() {
 *     const node = (<h1 key='123'>Hello, word</h1>);
 *     console.log(node);
 *     return (<h5>{node}</h5>);
 *   }
 * }
 *
 * const DEMO = () => {
 *   return (<h1>
 *      <h2><Welcome /></h2>
 *   <h1>)
 * };
 *
 * 输出来的node中的owner为h2对应的FiberNode节点
 *
 * 对于self, 为调用React.createElement所在环境的this值，在class类组件中一般为类对象，在函数组件中为空。
 *  类对象在在最后也会绑定一个对应的FiberNode节点，为当前组件对象会挂载到的dom节点对应的FiberNode节点，
 *  所以才能判断他们是否一致吧。
 *
 * @param {*} source An annotation object (added by a transpiler or otherwise)
 * indicating filename, line number, and/or other information.
 * 一个注释对象，由转译器(如babel)提供.包含filename，line number和其他信息。
 * @internal
 */
const ReactElement = function(type, key, ref, self, source, owner, props) {
  // 元素对象
  const element = {
    // This tag allows us to uniquely identify this as a React Element
    // react元素对象标记
    $$typeof: REACT_ELEMENT_TYPE,

    // Built-in properties that belong on the element
    // 内建属性
    type: type,
    key: key,
    ref: ref,
    props: props,

    // Record the component responsible for creating this element.
    // 翻译：记录负责创建此元素的组件。
    // TODO: 该字段负责记录创建该元素的组件元素将会对挂载到的FiberNode节点对象
    _owner: owner,
  };

  if (__DEV__) {
    // The validation flag is currently mutative. We put it on
    // an external backing store so that we can freeze the whole object.
    // This can be replaced with a WeakMap once they are implemented in
    // commonly used development environments.
    // 注释翻译: 验证标志当前是可变的。我们把它放在一个外部后备存储器中，这样我们就可以冻结整个对象。
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
    // 初始化元素中_store.validated
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
    // 冻结整个element不可以变更
    if (Object.freeze) {
      Object.freeze(element.props);
      Object.freeze(element);
    }
  }

  return element;
};

/**
 * TODO: 感觉是无用代码，根本就没有哪个地方用到了，可能是在做代码拆包过程中的遗留代码
 *  跟./jsx/React.ReactJSXElement#jsx一摸一样
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type
 * @param {object} props
 * @param {string} key
 */
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
  if (maybeKey !== undefined) {
    key = '' + maybeKey;
  }

  if (hasValidKey(config)) {
    key = '' + config.key;
  }

  if (hasValidRef(config)) {
    ref = config.ref;
  }

  // Remaining properties are added to a new props object
  for (propName in config) {
    if (
      hasOwnProperty.call(config, propName) &&
      !RESERVED_PROPS.hasOwnProperty(propName)
    ) {
      props[propName] = config[propName];
    }
  }

  // Resolve default props
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

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
 * TODO: 感觉是无用代码，根本就没有往外导出，可能是在做代码拆包过程中的遗留代码
 *  跟./jsx/React.ReactJSXElement#jsxDev几乎一样
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type
 * @param {object} props
 * @param {string} key
 */
export function jsxDEV(type, config, maybeKey, source, self) {
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
  if (maybeKey !== undefined) {
    key = '' + maybeKey;
  }

  if (hasValidKey(config)) {
    key = '' + config.key;
  }

  if (hasValidRef(config)) {
    ref = config.ref;
    warnIfStringRefCannotBeAutoConverted(config);
  }

  // Remaining properties are added to a new props object
  for (propName in config) {
    if (
      hasOwnProperty.call(config, propName) &&
      !RESERVED_PROPS.hasOwnProperty(propName)
    ) {
      props[propName] = config[propName];
    }
  }

  // Resolve default props
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

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

// 创建并且返回一个自定类型的react元素
// type: 组件类型，一般是一个字符串或者一个函数。字符串为html标签字符串，如div,span;函数代表React组件
//   可以是React.FC函数或者React.Component的子类。其他如React各种内建的组件或者一些包裹函数，如懒加载，缓存等。
// config: 组件配置，简单理解就是组件的属性
// children: 子节点，其他React.Element值，也是通过createElement创建的，该参数可以是不定参数，可以传递多个(注意不是数组)。
// 注意，该函数基本不会对传入函数做什么验证，也就是基本传入任何参数，几乎都可以创建成功的元素对象，
//  尽可能的创建一个react元素。检验元素对象是否符合标准都在渲染时去执行。
/**
 * Create and return a new ReactElement of the given type.
 * See https://reactjs.org/docs/react-api.html#createelement
 */
export function createElement(type, config, children) {
  let propName;

  // Reserved names are extracted
  // 保存组件属性，从config中选出来的值
  const props = {};

  let key = null;
  let ref = null;
  let self = null;
  let source = null;

  if (config != null) {
    // 配置有没有包含ref
    if (hasValidRef(config)) {
      ref = config.ref;

      if (__DEV__) {
        // TODO: 就某些情况下发出警告
        // 百度翻译出来: 如果无法自动转换字符串引用，则发出警告
        // 大概就是如果ref是一个字符串且无法转换，则发出警告
        warnIfStringRefCannotBeAutoConverted(config);
      }
    }
    // 是否有key属性
    if (hasValidKey(config)) {
      key = '' + config.key;
    }

    // 获取配置中的__self, __source属性
    // TODO: 暂时不知道怎么用
    // 经过研究，jsx生成的调用react.createElement是会传递这两个参数的
    // __source: 当前文件信息，结构为{ fileName: string, lineNumber: string, columnNumber: string }
    //      __source.fileName：组件所在文件绝对路径
    //      __source.lineNumber: 调用语句所在行数
    //      __source.columnNumber: 调用语句所在列数
    // __self: 组件所在this对象，函数式组件没有，只有类组件有，一般指向当前类对象
    self = config.__self === undefined ? null : config.__self;
    source = config.__source === undefined ? null : config.__source;
    // Remaining properties are added to a new props object
    // 将其他属性保存在一个新的对象中
    // 会剔除上面说的__self，__source， key, ref, 其他都作为组件的属性
    for (propName in config) {
      if (
        // 不config.hasOwnProperty是为了防空指针
        hasOwnProperty.call(config, propName) &&
        // 剔除__self，__source， key, ref,
        !RESERVED_PROPS.hasOwnProperty(propName)
      ) {
        props[propName] = config[propName];
      }
    }
  }

  // Children can be more than one argument, and those are transferred onto
  // the newly allocated props object.
  // 子节点可能有多个
  const childrenLength = arguments.length - 2;
  if (childrenLength === 1) {
    // 如果子节点只有一个，直接将子节点放到属性对象中
    props.children = children;
  } else if (childrenLength > 1) {
    // 如果子节点是数组，那么子节点保存为一个数组
    const childArray = Array(childrenLength);
    for (let i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }
    if (__DEV__) {
      // 开发模式下，且当前浏览器支持冻结对象的话，冻结子节点对象数组
      if (Object.freeze) {
        Object.freeze(childArray);
      }
    }
    props.children = childArray;
  }

  // Resolve default props
  // 解析组件类型中的默认值
  if (type && type.defaultProps) {
    // 将类型中的默认值设置到当前的组件属性对象，只有当属性对象中无值得时候才会设置
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        // 无值得时候才会设置
        props[propName] = defaultProps[propName];
      }
    }
  }
  // 开发模式下，警告props对象中存在了key和ref的值(可能通过默认值设置了)
  if (__DEV__) {
    if (key || ref) {
      // 组件的显示名逻辑： 如果是React组件类型的话，则一次获取类型的displayName，name值，没有则设置为Unknown；
      // 如果不是类型，则直接显示类型值(此时应该是标签字符串，如div, span)
      const displayName =
        typeof type === 'function'
          ? type.displayName || type.name || 'Unknown'
          : type;
      // 警告出现key属性,在获取时报错
      if (key) {
        defineKeyPropWarningGetter(props, displayName);
      }
      // 警告出现ref属性,在获取时报错
      if (ref) {
        defineRefPropWarningGetter(props, displayName);
      }
    }
  }
  // 新建一个React.Element对象
  return ReactElement(
    type,
    key,
    ref,
    self,
    source,
    // TODO: 暂时还不知道具体内涵
    // 感觉跟react渲染有关，react在整个渲染过程，都会维护好这个ReactCurrentOwner.current
    ReactCurrentOwner.current,
    props,
  );
}

/**
 * Return a function that produces ReactElements of a given type.
 * See https://reactjs.org/docs/react-api.html#createfactory
 */
export function createFactory(type) {
  const factory = createElement.bind(null, type);
  // Expose the type on the factory and the prototype so that it can be
  // easily accessed on elements. E.g. `<Foo />.type === Foo`.
  // This should not be named `constructor` since this may not be the function
  // that created the element, and it may not even be a constructor.
  // Legacy hook: remove it
  factory.type = type;
  return factory;
}

export function cloneAndReplaceKey(oldElement, newKey) {
  const newElement = ReactElement(
    oldElement.type,
    newKey,
    oldElement.ref,
    oldElement._self,
    oldElement._source,
    oldElement._owner,
    oldElement.props,
  );

  return newElement;
}

/**
 * Clone and return a new ReactElement using element as the starting point.
 * See https://reactjs.org/docs/react-api.html#cloneelement
 */
export function cloneElement(element, config, children) {
  invariant(
    !(element === null || element === undefined),
    'React.cloneElement(...): The argument must be a React element, but you passed %s.',
    element,
  );

  let propName;

  // Original props are copied
  const props = Object.assign({}, element.props);

  // Reserved names are extracted
  let key = element.key;
  let ref = element.ref;
  // Self is preserved since the owner is preserved.
  const self = element._self;
  // Source is preserved since cloneElement is unlikely to be targeted by a
  // transpiler, and the original source is probably a better indicator of the
  // true owner.
  const source = element._source;

  // Owner will be preserved, unless ref is overridden
  let owner = element._owner;

  if (config != null) {
    if (hasValidRef(config)) {
      // Silently steal the ref from the parent.
      ref = config.ref;
      owner = ReactCurrentOwner.current;
    }
    if (hasValidKey(config)) {
      key = '' + config.key;
    }

    // Remaining properties override existing props
    let defaultProps;
    if (element.type && element.type.defaultProps) {
      defaultProps = element.type.defaultProps;
    }
    for (propName in config) {
      if (
        hasOwnProperty.call(config, propName) &&
        !RESERVED_PROPS.hasOwnProperty(propName)
      ) {
        if (config[propName] === undefined && defaultProps !== undefined) {
          // Resolve default props
          props[propName] = defaultProps[propName];
        } else {
          props[propName] = config[propName];
        }
      }
    }
  }

  // Children can be more than one argument, and those are transferred onto
  // the newly allocated props object.
  const childrenLength = arguments.length - 2;
  if (childrenLength === 1) {
    props.children = children;
  } else if (childrenLength > 1) {
    const childArray = Array(childrenLength);
    for (let i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }
    props.children = childArray;
  }

  return ReactElement(element.type, key, ref, self, source, owner, props);
}

/**
 * Verifies the object is a ReactElement.
 * See https://reactjs.org/docs/react-api.html#isvalidelement
 * @param {?object} object
 * @return {boolean} True if `object` is a ReactElement.
 * @final
 */
export function isValidElement(object) {
  return (
    typeof object === 'object' &&
    object !== null &&
    object.$$typeof === REACT_ELEMENT_TYPE
  );
}
