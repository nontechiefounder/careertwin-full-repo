import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import TypewriterEffect from "@/components/marketing/TypewriterEffect";

const WORDS = ["ab", "cd"];
const SPEED = 100;
const PAUSE = 500;

describe("TypewriterEffect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances display during the typing phase", async () => {
    const { container } = render(
      <TypewriterEffect words={WORDS} speed={SPEED} pause={PAUSE} />
    );

    expect(container.textContent).toBe("");

    // Tick 1 (100ms): charIdx 0 -> 1
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    expect(container.textContent).toBe("");

    // Tick 2 (100ms): charIdx 1 -> 2
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    expect(container.textContent).toBe("a");

    // Tick 3 (100ms): charIdx 2 -> 3
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    expect(container.textContent).toBe("ab");
  });

  it("pauses at the completed word before deleting", async () => {
    const { container } = render(
      <TypewriterEffect words={WORDS} speed={SPEED} pause={PAUSE} />
    );

    // Type "ab" step by step
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    expect(container.textContent).toBe("ab");

    // Pause phase
    await act(async () => { vi.advanceTimersByTime(PAUSE / 2); });
    expect(container.textContent).toBe("ab");
  });

  it("deletes characters after the pause", async () => {
    const { container } = render(
      <TypewriterEffect words={WORDS} speed={SPEED} pause={PAUSE} />
    );

    // Type "ab" step by step
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    expect(container.textContent).toBe("ab");

    // Complete pause
    await act(async () => { vi.advanceTimersByTime(PAUSE); });

    // Delete tick 1 (charIdx 3 -> 2, display "ab")
    await act(async () => { vi.advanceTimersByTime(SPEED / 2); });
    expect(container.textContent).toBe("ab");

    // Delete tick 2 (charIdx 2 -> 1, display "a")
    await act(async () => { vi.advanceTimersByTime(SPEED / 2); });
    expect(container.textContent).toBe("a");
  });

  it("transitions to the next word when deletion reaches index 0", async () => {
    const { container } = render(
      <TypewriterEffect words={WORDS} speed={SPEED} pause={PAUSE} />
    );

    // Type "ab"
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    await act(async () => { vi.advanceTimersByTime(SPEED); });

    // Pause
    await act(async () => { vi.advanceTimersByTime(PAUSE); });

    // Delete tick 1 (3 -> 2)
    await act(async () => { vi.advanceTimersByTime(SPEED / 2); });
    // Delete tick 2 (2 -> 1)
    await act(async () => { vi.advanceTimersByTime(SPEED / 2); });
    // Delete tick 3 (1 -> 0, transition to word 2 "cd")
    await act(async () => { vi.advanceTimersByTime(SPEED / 2); });
    expect(container.textContent).toBe("");

    // Word 2 tick 1
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    // Word 2 tick 2 -> "c"
    await act(async () => { vi.advanceTimersByTime(SPEED); });
    expect(container.textContent).toBe("c");
  });

  it("cleans up timers when the component unmounts", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(
      <TypewriterEffect words={WORDS} speed={SPEED} pause={PAUSE} />
    );

    await act(async () => { vi.advanceTimersByTime(SPEED); });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
