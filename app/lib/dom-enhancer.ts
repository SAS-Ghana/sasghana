/**
 * Shared plumbing for the DOM enhancers that decorate the dashboard shell from outside React.
 *
 * Ten enhancers each held their own MutationObserver on document.body with `subtree: true`, and
 * every one of them wrote back into that same subtree -- appending buttons, inserting a home link,
 * toggling `open` classes. Because the callbacks ran synchronously on each mutation batch, one
 * enhancer's write immediately re-entered every other enhancer, and any node React later reclaimed
 * during a re-render was re-injected, re-removed and re-injected again. The result was a synchronous
 * feedback loop between React's reconciler and the enhancers that pegged the main thread: the tab
 * stopped painting mid sign-in and sat on "Signing in..." forever, even though authentication had
 * already succeeded.
 *
 * observeBody() closes that loop three ways:
 *   1. the callback is coalesced into a single animation frame, so it can never run once per record;
 *   2. the observer is detached while the callback runs, so an enhancer's own writes cannot re-enter
 *      it -- which is what actually breaks the enhancer/React tug of war;
 *   3. a circuit breaker disconnects an enhancer that keeps firing anyway, so the worst case is one
 *      piece of chrome quietly stopping rather than the whole tab locking up.
 */

/** Frames within the sampling window before an enhancer is assumed to be in a feedback loop. */
const runBudgetPerWindow = 60;
const windowMs = 1000;

export type ObserveBodyOptions = {
  /** Enhancer name, used only in the circuit-breaker warning. */
  label: string;
  /** Attribute names to watch. Omit to watch structure only, which is much cheaper. */
  attributeFilter?: string[];
};

/**
 * Run `apply` against document.body now, and again (coalesced per frame) whenever the DOM changes.
 *
 * `apply` is free to mutate the DOM: the observer is detached for the duration of the call.
 * Returns a disposer suitable for returning straight out of a useEffect.
 */
export function observeBody(apply: () => void, options: ObserveBodyOptions): () => void {
  let frame = 0;
  let runsInWindow = 0;
  let windowStartedAt = performance.now();
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      ...(options.attributeFilter
        ? { attributes: true, attributeFilter: options.attributeFilter }
        : {}),
    });
  };

  const execute = () => {
    frame = 0;
    if (stopped) return;
    // Detach first so anything `apply` writes is not fed back to us as a fresh mutation.
    observer.disconnect();
    try {
      apply();
    } finally {
      connect();
    }
  };

  const schedule = () => {
    if (stopped || frame) return;

    const now = performance.now();
    if (now - windowStartedAt > windowMs) {
      windowStartedAt = now;
      runsInWindow = 0;
    }
    runsInWindow += 1;
    if (runsInWindow > runBudgetPerWindow) {
      stopped = true;
      observer.disconnect();
      console.warn(
        `[sas] ${options.label}: stopped after ${runBudgetPerWindow} passes in ${windowMs}ms -- ` +
          "the enhancer and React are likely fighting over the same nodes.",
      );
      return;
    }

    frame = requestAnimationFrame(execute);
  };

  const observer = new MutationObserver(schedule);
  connect();
  // Initial pass, with the observer detached for the same reason as above.
  execute();

  return () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
  };
}
