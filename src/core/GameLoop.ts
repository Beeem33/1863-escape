/**
 * requestAnimationFrame loop with a clamped delta time.
 * The clamp prevents a huge simulation step after a tab switch or a hitch,
 * which would otherwise tunnel the player through obstacles.
 */
export class GameLoop {
  private running = false;
  private last = 0;
  private rafId = 0;
  /** Smoothed frames per second (for the debug overlay). */
  fps = 60;

  constructor(
    private readonly update: (dt: number, time: number) => void,
    private readonly maxDelta = 1 / 20,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const raw = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    if (raw > 0) this.fps += (1 / raw - this.fps) * 0.05;
    this.update(Math.min(raw, this.maxDelta), now / 1000);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
