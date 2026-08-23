/**
 * Which build is answering.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A CONSTANT ─────────────────────────
 * It was a constant: `build: "2026-08-07-yardsign-material"`, hand-typed into
 * app/api/artwork-upload/route.ts. Its own comment explains why something
 * like it is needed — a fresh deployment can produce byte-identical minified
 * chunks, so "is my change actually live?" has no answer from the outside,
 * and once cost hours of chasing a broken-deploys theory that was never true.
 *
 * The constant then went two weeks and a dozen deployments without being
 * updated, which is the failure mode of every hand-maintained stamp: it does
 * not go missing, it goes STALE, and a stale stamp is worse than none because
 * it is believed. It reported a 7 August build on a deployment that was
 * minutes old, and a reader concluded from that plus an old commit message
 * that a feature was still switched off when it had been live for days.
 *
 * So the stamp is derived, never written. Vercel injects the commit into the
 * environment; nobody has to remember anything.
 *
 * ── AND IT SAYS SO WHEN IT DOES NOT KNOW ──────────────────────────────────
 * The system variables are exposed by a project setting that can be turned
 * off, and none of them exist in local dev. Reporting "unidentified" is the
 * whole point: the failure this replaces was a stamp that answered
 * confidently and wrongly. Nothing here ever invents a version.
 *
 * Names and ids only — no tokens, no secrets. This endpoint is public.
 */

export type BuildStamp = {
  /** Short commit sha. Null when nothing identifies this build. */
  commit: string | null;
  /** Vercel's own id for the deployment serving this request. */
  deploymentId: string | null;
  /** "production", "preview", "development", or null off-platform. */
  environment: string | null;
  /** One line, safe to show anywhere, honest when there is nothing to say. */
  label: string;
};

/** Vercel's sha is full length; a short one is what anybody actually compares. */
function shorten(sha: string) {
  return sha.trim().slice(0, 7);
}

export function describeBuild(
  env: Record<string, string | undefined> = process.env
): BuildStamp {
  const commit = shorten(String(env.VERCEL_GIT_COMMIT_SHA ?? ""));
  const deploymentId = String(env.VERCEL_DEPLOYMENT_ID ?? "").trim();
  const environment = String(env.VERCEL_ENV ?? "").trim();

  return {
    commit: commit || null,
    deploymentId: deploymentId || null,
    environment: environment || null,
    label: commit
      ? environment
        ? `${commit} (${environment})`
        : commit
      : deploymentId
      ? // No commit — a deployment id at least distinguishes one build from
        // another, which is the question being asked.
        `deployment ${deploymentId}`
      : "unidentified build — VERCEL_GIT_COMMIT_SHA is not exposed to this deployment",
  };
}
