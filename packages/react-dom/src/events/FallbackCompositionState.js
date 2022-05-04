/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * These variables store information about text content of a target node,
 * allowing comparison of content before and after a given event.
 *
 * Identify the node where selection currently begins, then observe
 * both its text content and its current position in the DOM. Since the
 * browser may natively replace the target node during composition, we can
 * use its position to find its replacement.
 *
 *
 */

// 翻译：
// 这些变量存储有关目标节点的文本内容的信息，允许比较给定事件之前和之后的内容。

// 识别当前开始选择的节点，然后观察其文本内容及其在 DOM 中的当前位置。
// 由于浏览器在合成过程中可能会原生替换目标节点，我们可以使用它的位置来找到它的替换。

let root = null;
let startText = null;
let fallbackText = null;

// 初始化低版本ie的Composition事件
export function initialize(nativeEventTarget) {
  // 存储原生事件对象的target节点对象
  root = nativeEventTarget;
  // 获取开始时的文本，从元素的value值或者textContent中获取
  startText = getText();
  return true;
}

export function reset() {
  root = null;
  startText = null;
  fallbackText = null;
}

// 获取低版本ie Composition事件过程中的正在输入的文本
// 也就是模拟Composition事件的的data属性
export function getData() {
  // 如果存在存储的值，则直接返回
  if (fallbackText) {
    return fallbackText;
  }

  let start;
  const startValue = startText;
  const startLength = startValue.length;
  let end;
  const endValue = getText();
  const endLength = endValue.length;

  for (start = 0; start < startLength; start++) {
    if (startValue[start] !== endValue[start]) {
      break;
    }
  }

  const minEnd = startLength - start;
  for (end = 1; end <= minEnd; end++) {
    if (startValue[startLength - end] !== endValue[endLength - end]) {
      break;
    }
  }

  const sliceTail = end > 1 ? 1 - end : undefined;
  fallbackText = endValue.slice(start, sliceTail);
  return fallbackText;
}

// 获取开始时的值
export function getText() {
  if ('value' in root) {
    return root.value;
  }
  return root.textContent;
}
