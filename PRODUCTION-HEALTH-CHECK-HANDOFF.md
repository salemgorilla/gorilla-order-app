# The real file is `v2/PRODUCTION-HEALTH-CHECK-HANDOFF.md`

**→ Read [`v2/PRODUCTION-HEALTH-CHECK-HANDOFF.md`](v2/PRODUCTION-HEALTH-CHECK-HANDOFF.md).**

This pointer exists because the scheduled production health check's stored
prompt tells its agent the handoff is "at the root of the repo". It is not:
the app lives in `v2/`, and so do `AGENTS.md`, `HANDOFF.md` and the handoff
itself. The repo root holds a dead v1 static site.

An agent that could not find the file at the path it was given might have run
the check from memory, or from its own baked-in prompt, which is precisely
what the handoff is there to override.

**Deliberately a pointer and not a copy.** Two files with the same substance
drift, and the one nobody edits is the one that gets read — that failure has
already cost this repo a stale "Live right now" heading and a verification
skill that claimed a script did not exist. There is nothing to keep in sync
here because there is nothing here.
