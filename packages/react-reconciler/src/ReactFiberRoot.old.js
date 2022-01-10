/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FiberRoot, SuspenseHydrationCallbacks} from './ReactInternalTypes';
import type {RootTag} from './ReactRootTags';

import {noTimeout, supportsHydration} from './ReactFiberHostConfig';
import {createHostRootFiber} from './ReactFiber.old';
import {
  NoLanes,
  NoLanePriority,
  NoTimestamp,
  createLaneMap,
} from './ReactFiberLane';
import {
  enableSchedulerTracing,
  enableSuspenseCallback,
} from 'shared/ReactFeatureFlags';
import {unstable_getThreadID} from 'scheduler/tracing';
import {initializeUpdateQueue} from './ReactUpdateQueue.old';
import {LegacyRoot, BlockingRoot, ConcurrentRoot} from './ReactRootTags';

// Fiber跟节点类
function FiberRootNode(
  // 挂在dom节点
  containerInfo,
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)// root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  // 当前阅读情况下有 LegacyRoot
  tag,
  // 是否是ssr渲染
  hydrate,
) {
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)// root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  // 当前阅读情况下有 LegacyRoot
  this.tag = tag;
  // 挂在dom节点
  this.containerInfo = containerInfo;
  // TODO:
  this.pendingChildren = null;
  // 当前对应的fiber节点
  this.current = null;
  // TODO:
  this.pingCache = null;
  // TODO:
  this.finishedWork = null;
  // TODO:
  // dom-browser中noTimeout是-1
  this.timeoutHandle = noTimeout;
  // TODO:
  this.context = null;
  // TODO:
  this.pendingContext = null;
  this.hydrate = hydrate;
  this.callbackNode = null;
  // TODO:
  // NoLanePriority 的值为0
  this.callbackPriority = NoLanePriority;
  // TODO:
  // createLaneMap: 创建一个lane通道数组，数组长度为31，值为NoLanes(0)
  this.eventTimes = createLaneMap(NoLanes);
  // TODO:
  // 创建一个lane通道数组，数组长度为31，值为NoTimestamp(-1)
  this.expirationTimes = createLaneMap(NoTimestamp);
  // TODO: 初始化为没有通道NoLanes(0)
  this.pendingLanes = NoLanes;
  // TODO: 初始化为没有通道NoLanes(0)
  this.suspendedLanes = NoLanes;
  // TODO: 初始化为没有通道NoLanes(0)
  this.pingedLanes = NoLanes;
  // TODO: 初始化为没有通道NoLanes(0)
  this.expiredLanes = NoLanes;
  // TODO: 初始化为没有通道NoLanes(0)
  this.mutableReadLanes = NoLanes;
  // TODO: 初始化为没有通道NoLanes(0)
  this.finishedLanes = NoLanes;
  // TODO: 初始化为没有通道NoLanes(0)
  this.entangledLanes = NoLanes;
  // TODO:
  // 创建一个lane通道数组，数组长度为31，值为NoLanes(0)
  this.entanglements = createLaneMap(NoLanes);

  // 是否支持ssr渲染，在dom环境中，为true
  if (supportsHydration) {
    // TODO:
    this.mutableSourceEagerHydrationData = null;
  }

  // 如果开启 是否开启Scheduler调度器调试
  if (enableSchedulerTracing) {
    // TODO: getThreadID底层代码
    this.interactionThreadID = unstable_getThreadID();
    // TODO:
    this.memoizedInteractions = new Set();
    // TODO:
    this.pendingInteractionMap = new Map();
  }
  // 如果没有开启加载器的回调函数，则不保存ssr渲染的回调函数。
  // 当前enableSuspenseCallback固定为false
  if (enableSuspenseCallback) {
    this.hydrationCallbacks = null;
  }

  // 开发模式下的用于提示信息记录当前类型的描述信息
  if (__DEV__) {
    switch (tag) {
      case BlockingRoot:
        this._debugRootType = 'createBlockingRoot()';
        break;
      case ConcurrentRoot:
        this._debugRootType = 'createRoot()';
        break;
      case LegacyRoot:
        this._debugRootType = 'createLegacyRoot()';
        break;
    }
  }
}

// 创建一个FiberRoot对象
export function createFiberRoot(
  // 挂在dom节点
  containerInfo: any,
  // root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)// root标签，可以理解为root类型，有LegacyRoot(旧模式)，BlockingRoot(阻塞模式)，ConcurrentRoot(并发模式)
  // 当前阅读情况下有 LegacyRoot
  tag: RootTag,
  // 是否是ssr渲染
  hydrate: boolean,
  // ssr渲染回调事件对象，有onHydrated, onDeleted等
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): FiberRoot {
  // 创建一个Fiber根节点
  const root: FiberRoot = (new FiberRootNode(containerInfo, tag, hydrate): any);
  // 在开启加载器回调事件后，才允许设置。当前版本的enableSuspenseCallback一定为false
  if (enableSuspenseCallback) {
    root.hydrationCallbacks = hydrationCallbacks;
  }

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 翻译：循环建设。 这现在欺骗了类型系统，因为 stateNode 是 any。

  // 创建root对应的fiber节点对象
  const uninitializedFiber = createHostRootFiber(tag);
  // fiber root对象指向当前的创建的fiber节点
  root.current = uninitializedFiber;
  // fiber节点的stateNode属性只想当前的fiber root对象
  // 所以上面的翻译中说的循环依赖
  uninitializedFiber.stateNode = root;

  // 初始化Fiber的更新队列，也就是Fiber中updateQueue属性
  initializeUpdateQueue(uninitializedFiber);

  // 返回fiber root 对象
  return root;
}
