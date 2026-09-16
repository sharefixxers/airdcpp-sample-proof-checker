# airdcpp-sample-proof-checker

Checks release folders for a missing Sample (with a recognized video
file present) or Proof subfolder, and searches for and redownloads just
that subfolder when needed -- not the whole release.

## Detects

Via a manual scan (context menu), `/sampleproofcheck [path]`, and
automatically on every completed download:

- Release folders split into `.rar`/`.r00`-style files, but only if the
  folder also contains at least one `.sfv` file (a release with no SFV
  at all -- DIRFIX, PROOFFIX and similar repacks typically have neither
  -- is skipped entirely rather than flagged for a missing Sample/Proof,
  since those legitimately ship without one; see "Notes (1.2.3-beta)"
  below).
- Within those: is the Sample folder missing, or does it contain no
  recognized video file (`.mkv` by default -- see "Settings" below to
  add or change extensions, e.g. `.mp4`, `.wmv`, `.flv`)?
- Within those: is the Proof folder missing?

## Takes action on

- Sample missing/empty -> searches specifically for `<release name>
  Sample`, and if a match is found, downloads only that subfolder into
  the existing release folder.
- Proof missing -> same approach, searches specifically for `<release
  name> Proof`.
- Both present -> nothing to do, moves straight on to the next folder.

## Retry behavior

Every check -- the automatic one right after a completed download, and
a manual one via `/sampleproofcheck`, a context menu item, or a
whole-share scan -- now uses the same retry loop if a Sample/Proof
search doesn't find anything on the first try. The only difference is
timing of that first attempt:

- The automatic (post-download) check waits one full
  `retry_interval_minutes` before its first search, same as before --
  giving other users a little time to have the release (with its
  Sample/Proof) available before searching for it.
- A manual check (`/sampleproofcheck`, context menu, whole-share scan)
  still searches immediately, for the instant feedback you'd expect
  from running a command yourself. If that first search comes up empty,
  it now falls back to the exact same retry loop as the automatic
  check, instead of silently giving up after one try -- see
  "Notes (1.2.12-beta)" below.

- `retry_interval_minutes` (default 60) -- minutes between retries
  (and, for the automatic check only, before its first search too).
- `retry_max_hours` (default 24, 0-168) -- how long to keep retrying
  before giving up. 0 = try exactly once, no retries.
- `search_pause_seconds` (default 20) -- wait after starting a search
  before reading results.
- `overflow_backoff_seconds` (default 60) -- extra pause automatically
  applied after a "Search queue overflow" error.
- `sample_restrict_to_share_folder` -- only run the Sample check
  within these virtual share folders (comma-separated, e.g.
  `FiLMS,Series`). Applies to both the automatic (post-download) check
  and manual checks (`/sampleproofcheck`, context menu, scan). Leave
  empty to check the whole share.
- `proof_restrict_to_share_folder` -- same as above, but for the Proof
  check. Independent from the Sample setting -- each can list different
  virtual folders, or be left empty while the other is restricted.
- Retries cancel themselves as soon as the release folder itself is gone
  (user removed the download), rather than continuing to search for a
  Sample/Proof folder that no longer matters -- see "Notes (1.2.4-beta)"
  below.

## Smart features

- Background searches use the lowest search priority (1), so manual
  searches/downloads always get sent to the hub first.
- One-at-a-time queue -- prevents overloading/hanging AirDC++.
- A Sample/Proof folder is never itself treated as a release folder, so
  it can't trigger a search for its own Sample/Proof.
- Subs/Sub/SUBPACK folders are skipped.
- Excluded release groups configurable (empty by default -- every group is checked unless you add one).
- Right-click "Check Sample/Proof for this folder" on your own filelist,
  resolving to the exact real disk subfolder even when several real
  folders are merged under one virtual share name.
- Right-click "Check Sample/Proof for this folder" on a bundle in the
  Download Queue screen too -- no detour via Own filelist needed for
  something you just downloaded. The Queue already reports a bundle's
  real disk path directly, so this skips the virtual-path resolution the
  filelist version needs. A single-file download (nothing to check) or
  an already-removed queue item logs a warning instead of doing nothing
  silently.
- Logs to the system log at startup whether each context menu item
  registered.

## What is new in each version
[Changelog](https://github.com/sharefixxers/airdcpp-sample-proof-checker/blob/master/CHANGELOG.md)

## Troubleshooting
Enable extension debug mode from application settings and check the extension error logs
`(Settings\Extensions\airdcpp-sample-proof-checker\logs)` for additional information.
