type Handler = () => boolean | void | Promise<boolean | void>;

/** One back action at a time; overlay lifetimes determine the active stack. */
export class BackNavigation {
  private entries: Array<{ priority: number; handler: Handler }> = [];
  private pending: Promise<boolean> | null = null;

  register(handler: Handler, priority = 0) {
    const entry = { handler, priority };
    this.entries.push(entry);
    return () => {
      this.entries = this.entries.filter((current) => current !== entry);
    };
  }

  request(): Promise<boolean> {
    if (this.pending) return this.pending;
    const entries = [...this.entries].reverse().sort((a, b) => b.priority - a.priority);
    const action = (async () => {
      for (const entry of entries) {
        if (!this.entries.includes(entry)) continue;
        if ((await entry.handler()) !== false) return true;
      }
      return false;
    })();
    this.pending = action;
    void action
      .finally(() => {
        if (this.pending === action) this.pending = null;
      })
      .catch(() => {});
    return action;
  }
}

export const backNavigation = new BackNavigation();
