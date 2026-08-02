import { describe, expect, it } from "vitest";

import { createTaskQueue } from "../src/task-queue.js";

describe("createTaskQueue", () => {
  it("runs overlapping asynchronous tasks one at a time in arrival order", async () => {
    const queue = createTaskQueue();
    const events = [];

    const firstTask = queue(async () => {
      events.push("first:start");
      await Promise.resolve();
      events.push("first:end");
      return "first result";
    });

    const secondTask = queue(async () => {
      events.push("second:start");
      events.push("second:end");
      return "second result";
    });

    await expect(firstTask).resolves.toBe("first result");
    await expect(secondTask).resolves.toBe("second result");
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("continues processing after a queued task fails", async () => {
    const queue = createTaskQueue();
    const failedTask = queue(async () => {
      throw new Error("Expected failure");
    });
    const recoveryTask = queue(async () => "recovered");

    await expect(failedTask).rejects.toThrow("Expected failure");
    await expect(recoveryTask).resolves.toBe("recovered");
  });
});
