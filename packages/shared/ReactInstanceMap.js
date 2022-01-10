/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * `ReactInstanceMap` maintains a mapping from a public facing stateful
 * instance (key) and the internal representation (value). This allows public
 * methods to accept the user facing instance as an argument and map them back
 * to internal methods.
 *
 * Note that this module is currently shared and assumed to be stateless.
 * If this becomes an actual Map, that will break.
 */

// 翻译： ReactInstanceMap` 维护来自面向公众的有状态实例（键）和内部表示（值）的映射。
// 这允许公共方法接受面向用户的实例作为参数并将它们映射回内部方法。

// 请注意，此模块当前是共享的并假定为无状态的。如果这成为实际的 Map，则会中断。

/**
 * This API should be called `delete` but we'd have to make sure to always
 * transform these to strings for IE support. When this transform is fully
 * supported we can rename it.
 */
// 此 API 应称为“删除”，但我们必须确保始终将这些转换为字符串以支持 IE。 当完全支持此转换时，我们可以重命名它。
export function remove(key) {
  key._reactInternals = undefined;
}

export function get(key) {
  return key._reactInternals;
}

export function has(key) {
  return key._reactInternals !== undefined;
}

export function set(key, value) {
  key._reactInternals = value;
}
