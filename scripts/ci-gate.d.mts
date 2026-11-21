export const CI_WORKFLOW: string;
export function runnerOf(jobName: string): string;
export function ciGate(
  sha: string,
  run: { status: string; conclusion: string | null; jobs?: Array<{ name: string; conclusion: string | null }> } | undefined,
): { ok: boolean; message: string };
