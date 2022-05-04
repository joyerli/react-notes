/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// 获取当前文档中具有焦点的元素，
// 如果没有文档对象，则返回null
// 如果没有实际的激活元素，则返回body元素
// https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement
export default function getActiveElement(doc: ?Document): ?Element {
  doc = doc || (typeof document !== 'undefined' ? document : undefined);
  if (typeof doc === 'undefined') {
    return null;
  }
  try {
    return doc.activeElement || doc.body;
  } catch (e) {
    return doc.body;
  }
}
