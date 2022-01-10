/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

// Filter certain DOM attributes (e.g. src, href) if their values are empty strings.
// This prevents e.g. <img src=""> from making an unnecessary HTTP request for certain browsers.
export const enableFilterEmptyStringAttributesDOM = false;

// Adds verbose console logging for e.g. state updates, suspense, and work loop stuff.
// Intended to enable React core members to more easily debug scheduling issues in DEV builds.
export const enableDebugTracing = false;

// Adds user timing marks for e.g. state updates, suspense, and work loop stuff,
// for an experimental scheduling profiler tool.
// 翻译：添加用户计时标记，例如 状态更新、悬念和工作循环的东西，用于实验性调度分析器工具。
export const enableSchedulingProfiler = __PROFILE__ && __EXPERIMENTAL__;

// Helps identify side effects in render-phase lifecycle hooks and setState
// reducers by double invoking them in Strict Mode.
export const debugRenderPhaseSideEffectsForStrictMode = __DEV__;

// To preserve the "Pause on caught exceptions" behavior of the debugger, we
// replay the begin phase of a failed component inside invokeGuardedCallback.
export const replayFailedUnitOfWorkWithInvokeGuardedCallback = __DEV__;

// Warn about deprecated, async-unsafe lifecycles; relates to RFC #6:
export const warnAboutDeprecatedLifecycles = true;

// Gather advanced timing metrics for Profiler subtrees.
// 翻译:收集 Profiler 子树的高级计时指标

// 是否开启Profiler计时器
export const enableProfilerTimer = __PROFILE__;

// Record durations for commit and passive effects phases.
export const enableProfilerCommitHooks = false;

// Trace which interactions trigger each commit.
// 翻译:跟踪哪些交互触发了每个提交。

// 是否开启Scheduler调度器调试
export const enableSchedulerTracing = __PROFILE__;

// SSR experiments
export const enableSuspenseServerRenderer = __EXPERIMENTAL__;
export const enableSelectiveHydration = __EXPERIMENTAL__;

// Flight experiments
export const enableBlocksAPI = __EXPERIMENTAL__;
export const enableLazyElements = __EXPERIMENTAL__;

// Only used in www builds.
export const enableSchedulerDebugging = false;

// Disable javascript: URL strings in href for XSS protection.
export const disableJavaScriptURLs = false;

// Experimental Host Component support.
export const enableFundamentalAPI = false;

// Experimental Scope support.
export const enableScopeAPI = false;

// Experimental Create Event Handle API.
export const enableCreateEventHandleAPI = false;

// New API for JSX transforms to target - https://github.com/reactjs/rfcs/pull/107

// We will enforce mocking scheduler with scheduler/unstable_mock at some point. (v18?)
// Till then, we warn about the missing mock, but still fallback to a legacy mode compatible version
export const warnAboutUnmockedScheduler = false;

// Add a callback property to suspense to notify which promises are currently
// in the update queue. This allows reporting and tracing of what is causing
// the user to see a loading state.
// Also allows hydration callbacks to fire when a dehydrated boundary gets
// hydrated or deleted.
// 翻译：向 suspense 添加回调属性以通知当前在更新队列中的 Promise。
//  这允许报告和跟踪导致用户看到加载状态的原因。
//  还允许在脱水边界被水合或删除时触发水合回调。

// 是否开启加载器回调事件
export const enableSuspenseCallback = false;

// Part of the simplification of React.createElement so we can eventually move
// from React.createElement to React.jsx
// https://github.com/reactjs/rfcs/blob/createlement-rfc/text/0000-create-element-changes.md
export const warnAboutDefaultPropsOnFunctionComponents = false;

export const disableSchedulerTimeoutBasedOnReactExpirationTime = false;

export const enableTrustedTypesIntegration = false;

// Enables a warning when trying to spread a 'key' to an element;
// a deprecated pattern we want to get rid of in the future
export const warnAboutSpreadingKeyToJSX = false;

export const enableComponentStackLocations = true;

export const enableNewReconciler = false;

// Errors that are thrown while unmounting (or after in the case of passive effects)
// should bypass any error boundaries that are also unmounting (or have unmounted)
// and be handled by the nearest still-mounted boundary.
// If there are no still-mounted boundaries, the errors should be rethrown.
export const skipUnmountedBoundaries = false;

// --------------------------
// Future APIs to be deprecated
// --------------------------

// Prevent the value and checked attributes from syncing
// with their related DOM properties
export const disableInputAttributeSyncing = false;

export const warnAboutStringRefs = false;

export const disableLegacyContext = false;

// Disables children for <textarea> elements
export const disableTextareaChildren = false;

export const disableModulePatternComponents = false;

// We should remove this flag once the above flag becomes enabled
export const warnUnstableRenderSubtreeIntoContainer = false;

// Support legacy Primer support on internal FB www
export const enableLegacyFBSupport = false;

// Updates that occur in the render phase are not officially supported. But when
// they do occur, we defer them to a subsequent render by picking a lane that's
// not currently rendering. We treat them the same as if they came from an
// interleaved event. Remove this flag once we have migrated to the
// new behavior.
export const deferRenderPhaseUpdateToNextBatch = true;

// Replacement for runWithPriority in React internals.
export const decoupleUpdatePriorityFromScheduler = false;

export const enableDiscreteEventFlushingChange = false;

// 启用根侦听器
export const enableEagerRootListeners = true;

export const enableDoubleInvokingEffects = false;
