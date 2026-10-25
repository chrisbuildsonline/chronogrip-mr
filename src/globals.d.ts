/** Read-only hook for tests, set once the scene is built. */
interface ChronoHook {
  readonly levelId: string;
  readonly gearCount: number;
  readonly axleCount: number;
  readonly ready: true;
  /** Live: true while an XR session is running. */
  readonly xrPresenting: boolean;
}

interface Window {
  __chrono?: ChronoHook;
}
