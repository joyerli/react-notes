/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

type ValueTracker = {|
  getValue(): string,
  setValue(value: string): void,
  stopTracking(): void,
|};
type WrapperState = {_valueTracker?: ?ValueTracker, ...};
type ElementWithValueTracker = HTMLInputElement & WrapperState;

function isCheckable(elem: HTMLInputElement) {
  const type = elem.type;
  const nodeName = elem.nodeName;
  return (
    nodeName &&
    nodeName.toLowerCase() === 'input' &&
    (type === 'checkbox' || type === 'radio')
  );
}

function getTracker(node: ElementWithValueTracker) {
  return node._valueTracker;
}

function detachTracker(node: ElementWithValueTracker) {
  node._valueTracker = null;
}

function getValueFromNode(node: HTMLInputElement): string {
  let value = '';
  if (!node) {
    return value;
  }

  if (isCheckable(node)) {
    value = node.checked ? 'true' : 'false';
  } else {
    value = node.value;
  }

  return value;
}

function trackValueOnNode(node: any): ?ValueTracker {
  const valueField = isCheckable(node) ? 'checked' : 'value';
  const descriptor = Object.getOwnPropertyDescriptor(
    node.constructor.prototype,
    valueField,
  );

  let currentValue = '' + node[valueField];

  // if someone has already defined a value or Safari, then bail
  // and don't track value will cause over reporting of changes,
  // but it's better then a hard failure
  // (needed for certain tests that spyOn input values and Safari)
  if (
    node.hasOwnProperty(valueField) ||
    typeof descriptor === 'undefined' ||
    typeof descriptor.get !== 'function' ||
    typeof descriptor.set !== 'function'
  ) {
    return;
  }
  const {get, set} = descriptor;
  Object.defineProperty(node, valueField, {
    configurable: true,
    get: function() {
      return get.call(this);
    },
    set: function(value) {
      currentValue = '' + value;
      set.call(this, value);
    },
  });
  // We could've passed this the first time
  // but it triggers a bug in IE11 and Edge 14/15.
  // Calling defineProperty() again should be equivalent.
  // https://github.com/facebook/react/issues/11768
  Object.defineProperty(node, valueField, {
    enumerable: descriptor.enumerable,
  });

  const tracker = {
    getValue() {
      return currentValue;
    },
    setValue(value) {
      currentValue = '' + value;
    },
    stopTracking() {
      detachTracker(node);
      delete node[valueField];
    },
  };
  return tracker;
}

export function track(node: ElementWithValueTracker) {
  if (getTracker(node)) {
    return;
  }

  // TODO: Once it's just Fiber we can move this to node._wrapperState
  node._valueTracker = trackValueOnNode(node);
}

// 判断change事件中的监听的值是否发生改变。
export function updateValueIfChanged(node: ElementWithValueTracker) {
  // 无节点范围false
  if (!node) {
    return false;
  }

  // 获取设置在dom节点上的钩子(跟踪器)， 设置在dom节点的_valueTracker属性上
  const tracker = getTracker(node);
  // if there is no tracker at this point it's unlikely
  // that trying again will succeed
  // 如果此时没有跟踪器，则再次尝试不太可能成功

  // 如果没有挂载跟踪器，那么认定他是被改变了
  if (!tracker) {
    return true;
  }

  // 获取变更前的值
  const lastValue = tracker.getValue();
  // 获取此时的值
  const nextValue = getValueFromNode(node);
  // 如果值发生了变化
  if (nextValue !== lastValue) {
    // 跟踪器记录值，返回值被更新
    tracker.setValue(nextValue);
    return true;
  }
  // 值没有被更新
  return false;
}

export function stopTracking(node: ElementWithValueTracker) {
  const tracker = getTracker(node);
  if (tracker) {
    tracker.stopTracking();
  }
}
