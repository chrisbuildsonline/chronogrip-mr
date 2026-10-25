/** Runs the XR launch; if it throws or rejects, shows the reason in the note instead of leaving an unhandled rejection. */
export async function startSession(launch: () => unknown, note: { hidden: boolean | string; textContent: string | null }): Promise<void> {
  try {
    await launch();
  } catch (e) {
    note.textContent = `Could not start mixed reality: ${e instanceof Error ? e.message : String(e)}`;
    note.hidden = false;
  }
}
