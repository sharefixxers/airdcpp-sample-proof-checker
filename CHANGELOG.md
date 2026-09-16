## Notes (1.2.32-beta)

Cosmetic-only pass, requested directly: every user-facing/prose mention of
the "AirDC++" product name (in settings help text, log messages, code
comments and the README files) is now generic "the client" instead,
since this extension family targets both AirDC++ and FulDC++. Technical
identifiers that have to keep the literal name -- the npm dependency
names (`airdcpp-extension`, `airdcpp-extension-settings`), this
package's own name/keywords/repository fields (required to start with
`airdcpp-` for the settings-registration API to work, see "Notes
(1.2.6-beta)" below), and the `airdcpp` block in `package.json` -- are
untouched. No functional change.

## Notes (1.2.31-beta)

Cosmetic-only pass over the Settings screen text, requested directly:
shortened/reworded several titles and help texts for clarity (e.g. "Automatically
search for and fix incomplete releases" instead of "...redownload incomplete
release folders", trimmed help texts on the scan-concurrency, retry-interval,
retry-max-hours, overflow-backoff and share-restriction settings). No
functional/behavioral change -- all keys, defaults, min/max values and the
actual matching logic (including the share-restriction setting still
accepting a virtual name, a full path, or a bare share-root folder name) are
unchanged.

## Notes (1.2.30-beta)

A full share scan, a whole-folder `/sampleproofcheck <path>` (or the
context menu equivalents), used to walk the directory tree completely
sequentially -- one `readdir` at a time, depth-first, waiting for each
folder to finish before starting the next, even though sibling folders
have nothing to do with each other. On a large share this made a
whole-share scan take roughly as long as (number of folders) x (disk
read time per folder), with the disk sitting mostly idle between reads
rather than being kept busy.

The recursive walk is now a bounded worker-pool: a fixed number of
folders (the new `scan_concurrency` setting, default 4) are read from
disk at the same time, drawn from a shared queue that grows as each
folder's subfolders are discovered -- so sibling folders at every level
of the tree get scanned in parallel, not just the top-level share
roots, and a whole-share scan (which previously looped over each share
root one at a time, each fully sequential) now feeds every share root
into that same shared pool at once too. Modeled on
airdcpp-release-fixxer's `Scanner.ts`, which already parallelizes its
own scan the same way, and on airdcpp-sfv-folder-checker's
`runPool`/`concurrency` setting (same default of a small worker count
rather than unbounded parallelism, to avoid hammering the disk or a
network share on a very large library). Every call site that scans a
folder tree (`/sampleproofcheck`, the whole-share scan, both context
menu items) goes through this same pool, so all of them benefit
automatically. The redownload search queue itself (see "Smart
features" above) is unaffected and still strictly one-at-a-time, since
that's about not overloading the hub's search queue, a separate
concern from reading the local disk. Verified standalone against a
synthetic directory tree: every folder is still visited exactly once
regardless of concurrency, the configured limit is never exceeded, and
a concurrency of 4 is measurably faster than the old one-at-a-time
behavior.

## Notes (1.2.29-beta)

Real bug found via the 1.2.28-beta diagnostic log: the value he'd set, 
`__FiLMS` (the share folder's own name, no drive letter -- the natural thing 
to type after seeing it in Windows Explorer, and what "z:\__FiLMS" had since 
been simplified to), matched neither accepted form (virtual name "FiLMS", or 
the full real path "Z:\__FiLMS") -- so the restriction matched nothing at all 
and every folder was silently allowed through, not just the intended one. The 
diagnostic log correctly showed every Series folder as "SKIPPED" only because 
*nothing* matched, which would have also skipped the intended FiLMS folders. 
Fixed by accepting this bare-folder-name form too (matched against the end of 
the real path on a proper folder-name boundary, so "__FiLMS" can't 
accidentally match a differently-named root like "__FiLMS2"). Verified against 
his exact reported values (virtual name "SERiE", path "Z:\__SERiE\") plus the 
previously-working full-path and virtual-name forms. Also removed the 
1.2.28-beta per-check diagnostic log line -- it logged one line for every 
release folder checked, which is far too much output during a full-share scan 
with a large library (flagged as contributing to a near-freeze). 

## Notes (1.2.28-beta)

Diagnostic addition: reported that "Limit the Proof check to these share 
folders" set to `z:\__FiLMS` still lets Proof checks run in `z:\__SERiES`, 
even after the 1.2.25-beta fix that made this setting match either the virtual 
folder name or the real path. Re-checked the matching logic in isolation with 
realistic share-root data and it resolves correctly there, so the actual cause 
needs real data from a real setup rather than another guess. Every restriction 
check (for both `sample_restrict_to_share_folder` and 
`proof_restrict_to_share_folder`) now logs one line showing exactly which 
share root the client resolved the folder to (its virtual name and real path) 
and whether it was allowed or skipped against the configured restriction -- 
respects the existing "Show messages in the system log" setting like 
everything else. Next report with this log line included should show exactly 
where the mismatch is. 

## Notes (1.2.27-beta)

Reverts the 1.2.26-beta experiment: the trailing "." added there also breaks 
the click-to-search behavior in the native client. Confirmed (by testing) that 
the click only works when the text ends exactly in "-GROUPNAME" with nothing 
else after it -- any trailing character, full stop included, breaks it. The 
"Searching for Sample/Proof folder for: ..." and "Scan started for folder: 
..." log lines are back to ending right after the release/folder name with no 
trailing punctuation at all, same as 1.2.24-beta/1.2.25-beta. This should 
restore the click-to-search link while keeping the truncation-looking "..." 
gone for good. 

## Notes (1.2.26-beta)

Experimental fix: after 1.2.24-beta removed the trailing "..." from the 
"Searching for Sample/Proof folder for: ..." and "Scan started for folder: 
..." log lines, clicking the release/folder name in the native client's system 
log (to open a search for it) stopped working. The client's Web UI's own 
link/URL detection doesn't touch release names at all (only URLs, magnet links 
and hub addresses), so this is native-client text-recognition behavior with no 
public source to check -- most likely it needs a non-alphanumeric character 
right after the name to know where it ends. These two messages now end with a 
single "." instead of nothing (or the old "...") -- grammatically a normal 
full stop, not a truncation-looking ellipsis, but still a boundary character 
for whatever the client's parser needs. Needs confirmation that this actually 
restores the click-to-search behavior. 

## Notes (1.2.25-beta)

Real bug fix: "Limit the Sample/Proof check to these virtual folders" only 
ever matched against the client's virtual share name (e.g. "FiLMS") -- typing 
the real filesystem path of that share root (e.g. `Z:\__FiLMS`, the natural 
thing to type since that's what you see in Windows Explorer) silently never 
matched anything, so the restriction had no effect and every share folder was 
still checked. Fixed: each comma-separated entry now matches on either the 
virtual name or the real path (any slash direction, with or without a trailing 
slash). Also hardened the underlying share-root lookup to pick the most 
specific (longest) matching root instead of just the first one found, in case 
of overlapping share roots. 

## Notes (1.2.24-beta)

Same cosmetic bug, missed spot: the "Searching for Sample/Proof folder for: 
..." log line also had a literal trailing "..." hardcoded right after the 
release name. Removed. Checked the rest of the file (and the other extensions) 
for the same pattern -- no other instances left where a dynamic value is 
directly followed by a hardcoded "...". 

## Notes (1.2.23-beta)

Cosmetic fix: the "Scan started for folder: ..." log line had a literal 
trailing "..." hardcoded after the folder path, regardless of the actual path. 

## Notes (1.2.20-beta)

Real bug fix, found while investigating the 1.2.19-beta diagnostics: when a 
bundle finishes downloading, the automatic Sample/Proof check schedules its 
first search attempt with a deliberate delay (by design, see 1.2.12-beta -- 
with default settings, a full retry interval, 60 minutes). If you then 
manually ran "Check Sample/Proof for this folder" (Download Queue, filelist, 
share-wide scan, or /sampleproofcheck) for that same release shortly after, 
the manual check would log "Sample folder missing" and complete -- but 
silently do nothing else, because the retry scheduler only tracks one pending 
attempt per release and a delayed one was already registered. Your "search 
now" click was swallowed until the original 60-minute timer eventually fired. 
Fixed: a manual check now cancels the pending delayed timer and searches 
immediately instead, with a log line explaining what happened. Automatic 
checks are unaffected -- they still de-duplicate and respect the configured 
delay. Verified with a new test that reproduces the exact sequence (automatic 
hook schedules a delayed retry, then a manual check on the same release must 
search right away). 

## Notes (1.2.19-beta)

Diagnostics only, no behavior change for the happy path. "Check Sample/Proof 
for this folder" in the Download Queue's right-click menu could report "could 
not resolve a real disk folder" without saying why. Traced the whole path 
against the actual AirDC++/FulDC++ web API source (GET queue/bundles/:token, 
the "target" field, extension session permissions, and the GUI's own 
menu-registration code) and everything checked out in theory -- so this 
release makes the warning itself useful instead of guessing further: it now 
includes the real HTTP status/error from the API call, or the actual field 
names the bundle response DID have if "target" was missing, or why a path that 
does resolve isn't a directory. Verified with a new smoke test covering a 
valid bundle, a removed/404 bundle, a single-file bundle, and a bundle 
response missing the expected field. Next time this happens, the log line will 
say exactly why instead of just "could not resolve". 

## Notes (1.2.18-beta)

Split `restrict_to_share_folder` into two independent settings,
`sample_restrict_to_share_folder` and `proof_restrict_to_share_folder`
-- each is its own comma-separated list of virtual share folders, so
Sample and Proof checks can be scoped to different folders (or one
restricted while the other isn't). Also widened where the restriction
applies: it previously only affected the automatic (post-download)
check; it now applies to manual checks too (`/sampleproofcheck`,
context menu, whole-share scan). Existing installs that had
`restrict_to_share_folder` set will need to re-enter that value into
the new Sample and/or Proof setting(s), since the old key is gone.
Leaving both new settings empty (the default) checks the whole share
for both, matching the old default behavior.

## Notes (1.2.17-beta)

Removed the hardcoded default for "Excluded release groups"
(excluded_groups was previously pre-filled with `CyTSuNee,SHiTSoNy`).
The setting itself is unchanged and still fully configurable -- it now
simply starts empty, so every release group is checked unless you
explicitly add one. Existing installs that never touched this setting
will keep behaving as before only if they already had a value saved;
a fresh install now checks every group by default. No other functional
change.

## Notes (1.2.16-beta)

Version bump only, requested directly (jumping from 1.2.14-beta to
1.2.16-beta, skipping 1.2.15). No functional or source code change.

## Notes (1.2.14-beta)

Removed the help text under the "Video file extensions that count as a
valid Sample" setting in Settings -- it repeated the same information
already in the setting's title and the README, and was cluttering the
Settings screen. The setting itself (`sample_video_extensions`) is
unchanged: still comma-separated, case-insensitive, defaulting to
mkv,mp4,avi,wmv,flv. No functional change.

## Notes (1.2.13-beta)

Fixed a leftover from the 1.2.11-beta change: `package.json`'s own
`description` field (the text AirDC++ shows at the top of this
extension's Settings screen) still said "missing Sample (with mkv)"
even though the actual check had already become configurable in
1.2.11-beta. Updated to "missing Sample (with a recognized video
file)" to match the README, the Notes below, and the checkbox title in
Settings itself. No functional change -- description text only.

## Notes (1.2.12-beta)

A manual check -- `/sampleproofcheck [path]`, a right-click context menu
item, or a whole-share scan -- used to search for a missing Sample/Proof
folder exactly once and then give up silently if nothing was found on
that first try (Proof failures specifically were never even logged).
Only the automatic check right after a completed download had real
retry logic (searching again every `retry_interval_minutes`, up to
`retry_max_hours`).

In practice this meant a manual check could easily "miss" a Sample or
Proof that genuinely existed elsewhere in the hub, simply because no
source happened to be indexed at that exact second -- with no further
attempt and no indication anything had even been tried, short of trying
the same manual check again yourself later and hoping for better timing.

Manual checks now fall back to the same retry loop as the automatic
check when their first search comes up empty, instead of giving up
after that one attempt. The first search itself still happens right
away, same as before -- only a *failed* first attempt now leads to
follow-up retries, on the same `retry_interval_minutes` /
`retry_max_hours` schedule already used for automatic checks. No change
to the automatic (post-download) check's own behavior.

## Notes (1.2.11-beta)

The Sample-folder check used to only ever accept a `.mkv` file as proof
a Sample was present -- anything else in there (a real, plain `.mp4`,
`.wmv`, or `.flv` sample, which do turn up on some sources) was treated
as if the Sample was missing entirely, triggering a pointless redownload
search for a folder that was already fine.

Added a new setting, **Video file extensions that count as a valid
Sample (comma-separated)** (`sample_video_extensions`), default
`mkv,mp4,avi,wmv,flv` -- case-insensitive, no leading dot needed. A
Sample folder containing at least one file matching any of these
extensions now counts as present; `avi` was added to the default list
alongside the requested `mp4`/`wmv`/`flv` since it's another common
Sample format, but the list is fully yours to trim or extend in this
extension's Settings tab, and takes effect immediately, no restart
needed. Existing installs keep behaving exactly as before (`.mkv` still
works) unless this setting is changed.

No change to the Proof check, which only ever required the folder to
exist and never looked at file extensions.

## Notes (1.2.10-beta)

Two changes, both purely to how help text is shown -- no scan/check
logic changed (confirmed by comparing the built extension bundle
before and after: byte-for-byte identical apart from the help-related
lines):

- `/sampleproofcheck help` and `/sampleproofcheckhelp` now reply in the
  same hub or private-chat window the command was typed in, instead of
  the general system log -- matching how `/rvalidator help` already
  behaved in airdcpp-release-fixxer.
- The help text itself is now a short list of commands, one per line,
  instead of a single long sentence.

Also: the source code for this extension has been reformatted for
readability (statements one per line instead of comma-chained), with
no functional change -- verified by comparing the built bundle before
and after the reformat.

## Notes (1.2.9-beta)

Fixed a bug where `/sampleproofcheck help` was silently treated as a
literal folder path (`help`) to scan, instead of showing usage -- since
there's essentially never a real share folder actually named "help",
this just failed quietly rather than doing anything useful. The
separate `/sampleproofcheckhelp` command already worked correctly and
is unchanged; this just also catches the more natural `<command> help`
typing pattern (only when "help" is the entire argument -- a real path
is still free to contain the word). Same class of bug found and fixed
at the same time in airdcpp-sfv-folder-checker and airdcpp-share-backup.

## Notes (1.2.7-beta)

Reverted the 1.2.6-beta rename: back to `airdcpp-sample-proof-checker`.
Turns out the official "name must start with airdcpp-" requirement is
real after all, just narrower than a quick test had suggested -- a
minimal test extension with no settings (`dce-hello-fixxer`) loaded,
ran, and handled chat commands fine under a non-`airdcpp-`-prefixed
name, which looked like proof the whole requirement was obsolete. But
every real extension in this family uses settings, and AirDC++ rejects
the settings-registration API call (`POST extensions/<name>/settings/
definitions`) for a non-`airdcpp-`-prefixed name -- confirmed with an
isolated one-line diff (only `name`/`version` changed, nothing else)
that reproduced a clean crash: a 400 on that endpoint, silently
swallowed by the settings library, followed by a hard crash the moment
any setting was read. Confirmed consistent even after a full AirDC++
restart, so not a one-time registration race either. Back to
`airdcpp-` for good. No functional change otherwise.

## Notes (1.2.6-beta)

Renamed the package from `airdcpp-sample-proof-checker` to
`airdcpp-sample-proof-checker`. AirDC++'s official extension spec says a
package name "must start with airdcpp-", but that turned out to only
apply to extensions published through npm's own registry and picked up
via AirDC++'s in-app update checker -- a locally-installed or
FulDC++-catalogue extension with a non-`airdcpp-`-prefixed name loads
and runs identically (confirmed with a small purpose-built test
extension, installed manually and via `dce-tiny-fileserver`'s
auto-install, in real AirDC++ 4.30). Since this whole family is only
ever installed that way, `dce-` (Direct Connect Extension) reads better
than a name implying it only works with one specific client. No
functional change otherwise.

## Notes (1.2.5-beta)

Added `repository` and `bugs` fields to `package.json` (placeholder
GitHub URL -- replace `YOUR-USERNAME-HERE` with the real account/repo
before actually running `npm publish`), and flipped `private` from
`true` back to `false` in preparation for an eventual real npm publish.
Until that publish actually happens, this brings back the npmjs.org
update-check 404 that `private: true` had deliberately silenced --
harmless, just a log line, and easy to re-suppress by setting `private`
back to `true` for anyone installing from source/zip rather than a real
npm publish. Also added this file -- earlier releases shipped without an
`EXTENSION_README.md`, unlike the other extensions in this family.

## Notes (1.2.4-beta)

Fixed a bug where the automatic retry loop kept searching for a missing
Sample/Proof folder on schedule even after the user deleted the entire
release folder from disk -- the retry only checked whether the
Sample/Proof *sub*folder existed (naturally always false once the parent
is gone), never whether the release folder itself still existed, so it
kept trying until `retry_max_hours` ran out regardless. Each retry
attempt now checks the release folder's own existence first; if it's
gone, the retry is canceled immediately and a system log line explains
why.

## Notes (1.2.3-beta)

A release folder with no `.sfv` file at all (DIRFIX, PROOFFIX and
similar repack folders typically have neither) is now skipped entirely
instead of being flagged for a missing Sample/Proof. Fixed after a real
DIRFIX folder triggered a false "Sample folder missing" warning
immediately after being added to share -- these repacks legitimately
ship without a Sample or Proof of their own (a PROOFFIX folder is often
effectively the proof), so there was nothing to search for in the first
place.

## Notes (1.2.2-beta)

Added the "Check Sample/Proof for this folder" context menu item to the
Download Queue screen, alongside the existing Own filelist item -- no
detour via Own filelist needed for something you just downloaded.

## A note on variable names

This project was originally developed directly against the minified
webpack bundle (edited in place across many sessions before a readable
source tree existed), so `src/main.js` still uses short/single-letter
local variable names in places rather than fully descriptive ones.
Renaming them all safely would need an AST-aware refactoring tool to
avoid mixing up variables that reuse the same letter in different,
unrelated scopes, so they were deliberately left as-is. The file's own
top-of-file comment includes a map of what each short name does --
follow the comments and structure rather than the variable names.
