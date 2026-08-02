export function createTaskQueue() {
  let queueTail = Promise.resolve();

  return function enqueue(task) {
    const taskResult = queueTail
      .catch(() => undefined)
      .then(() => task());

    queueTail = taskResult;
    return taskResult;
  };
}
