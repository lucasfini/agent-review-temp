export function scheduleBackgroundTask(task: Promise<unknown>) {
  const maybeWaitUntil = (globalThis as any).waitUntil;
  if (typeof maybeWaitUntil === 'function') {
    maybeWaitUntil(task);
    return;
  }

  void task.catch((error) => {
    console.error('[BACKGROUND TASK] Unhandled background task failure:', error);
  });
}
