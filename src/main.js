'use strict';

'use strict';

const r = require('fs'),
  o = require('path'),
  fsp2 = r.promises,
  i = [
    {
      key: 'check_sample',
      title: 'Check for missing Sample folder (with a video file)',
      default_value: !0,
      type: 'boolean',
    },
    {
      key: 'sample_video_extensions',
      title: 'Video file extensions that count as a valid Sample (comma-separated)',
      default_value: 'mkv,mp4,avi,wmv,flv',
      type: 'string',
      optional: true,
    },
    {
      key: 'check_proof',
      title: 'Check for missing Proof folder',
      default_value: !0,
      type: 'boolean',
    },
    {
      key: 'redownload',
      title: 'Automatically search for and fix incomplete releases',
      default_value: !0,
      type: 'boolean',
    },
    {
      key: 'log_events',
      title: 'Show messages in the system log',
      default_value: !0,
      type: 'boolean',
    },
    {
      key: 'excluded_groups',
      title: 'Excluded release groups (comma-separated)',
      help: 'Leave empty to check every group.',
      default_value: '',
      type: 'string',
      optional: true,
    },
    {
      key: 'scan_concurrency',
      title: 'Folders to scan at the same time during a full share/manual scan',
      help: 'How many folders can be scanned and read in parallel. Higher values finish a scan faster but increase disk/network load.',
      default_value: 4,
      type: 'number',
      min: 1,
      max: 32,
    },
    {
      key: 'retry_interval_minutes',
      title: 'Minutes between automatic Sample/Proof search retries',
      default_value: 60,
      type: 'number',
      min: 5,
      max: 1440,
    },
    {
      key: 'retry_max_hours',
      title: 'Maximum hours to keep retrying (0 = try once)',
      help: 'How long to try an automatic Sample/Proof search. 0 = only once, max 168.',
      default_value: 24,
      type: 'number',
      min: 0,
      max: 168,
    },
    {
      key: 'search_pause_seconds',
      title: 'Seconds to wait before reading search results',
      help: "Wait time after starting a search before reading results. Increase if you see \'Search queue overflow\' errors.",
      default_value: 20,
      type: 'number',
      min: 10,
      max: 120,
    },
    {
      key: 'overflow_backoff_seconds',
      title: 'Extra pause (seconds) after a search queue overflow',
      help: "Extra seconds to pause after a \'Search queue overflow\' error before the next search.",
      default_value: 60,
      type: 'number',
      min: 20,
      max: 600,
    },
    {
      key: 'sample_restrict_to_share_folder',
      title: 'Limit the Sample check to these share folders (comma-separated)',
      help:
        'For automatic and manual Sample checks. Can be the virtual folder name (e.g. FiLMS,Series) or the full ' +
        'real filesystem path (e.g. Z:\\__FiLMS). Leave empty to check the whole share.',
      default_value: '',
      type: 'string',
      optional: true,
    },
    {
      key: 'proof_restrict_to_share_folder',
      title: 'Limit the Proof check to these share folders (comma-separated)',
      help: 'Identical to the Sample restriction setting above, but for Proof checks.',
      default_value: '',
      type: 'string',
      optional: true,
    },
  ],
  s = require('airdcpp-extension-settings'),
  a = /\.(rar|r\d{2})$/i,
  sfvRe = /\.sfv$/i;
module.exports = function (e, t) {
  const u = s(e, {
      extensionName: t.name,
      configFile: t.configPath + 'config.json',
      configVersion: 1,
      definitions: i,
    }),
    l = new Map(),
    f = [],
    h = new Set();
  let p = !1;
  const retryState = new Map();
  const shareRootVirtualNameCache = { at: 0, roots: null };

  async function isWithinRestrictedShareFolder(realPath, settingKey) {
    const restrictRaw = (u.getValue(settingKey) || '').trim();
    if (!restrictRaw) return !0;
    const restrictList = restrictRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (restrictList.length === 0) return !0;
    // Accepts backslashes or forward slashes and a trailing separator, so a
    // real Windows path (e.g. "Z:\__FiLMS" or "Z:\__FiLMS\") normalizes the
    // same way regardless of how it was typed.
    const norm = (p) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    try {
      if (!shareRootVirtualNameCache.roots || Date.now() - shareRootVirtualNameCache.at > 60000) {
        shareRootVirtualNameCache.roots = await e.get('share_roots');
        shareRootVirtualNameCache.at = Date.now();
      }
      const target = norm(realPath);
      // Pick the most specific (longest real path) matching root, in case
      // share roots overlap (e.g. a root at "Z:\" plus a more specific one
      // at "Z:\__FiLMS\") -- `.find()` alone would just take whichever
      // happened to come first in the list.
      const matches = (shareRootVirtualNameCache.roots || [])
        .filter((root) => root.path && target.startsWith(norm(root.path)))
        .sort((a, b) => norm(b.path).length - norm(a.path).length);
      const match = matches[0];
      if (!match) {
        await d(
          `[Sample/Proof-check] Check skipped: could not determine the virtual share folder for ${realPath}`,
          'warning',
        );
        return !1;
      }
      const virtualName = (match.virtual_name || '').toLowerCase();
      const rootRealPath = norm(match.path);
      // Accepts, per comma-separated entry: the client's virtual folder name
      // (e.g. "FiLMS"), the full real filesystem path of the share root
      // (e.g. "Z:\__FiLMS"), or just the root folder's own name without a
      // drive letter (e.g. "__FiLMS") -- confirmed via diagnostic logging
      // that this last, most natural-looking form (what you get by glancing
      // at the folder name, without the drive letter the client happens to have
      // it mapped to) previously matched nothing at all, silently disabling
      // the restriction entirely rather than restricting to the intended
      // folder.
      const entryNorm = restrictList.map(norm);
      const decision = restrictList.some(
        (entry, idx) =>
          entry.toLowerCase() === virtualName ||
          entryNorm[idx] === rootRealPath ||
          (entryNorm[idx].length > 0 && rootRealPath.endsWith('/' + entryNorm[idx])),
      );
      return decision;
    } catch (err) {
      await d(
        `[Sample/Proof-check] Check skipped: could not check ${settingKey} (${err.message})`,
        'error',
      );
      return !1;
    }
  }
  async function scheduleRetry(releaseDir, subFolderName, silentIfNotFound, checkExists, immediateFirst) {
    const key = releaseDir.replace(/[\\/]+$/, '') + '::' + subFolderName.toLowerCase() + '::retry';
    const intervalMinutes = Math.max(1, u.getValue('retry_interval_minutes') || 60),
      maxHours = Math.max(0, u.getValue('retry_max_hours') || 0),
      maxAttempts = maxHours > 0 ? Math.max(1, Math.round((maxHours * 60) / intervalMinutes)) : 1,
      intervalMs = 60000 * intervalMinutes,
      attempt = async () => {
        const state = retryState.get(key);
        if (!state) return;

        let releaseDirExists = !0;
        try {
          await r.promises.access(releaseDir);
        } catch (e) {
          releaseDirExists = !1;
        }
        if (releaseDirExists) {
          state.everExisted = !0;
        } else if (state.everExisted) {
          // Only treat this as "the release was removed" once the folder
          // has actually been seen to exist before -- an early check
          // triggered right when a bundle is queued (before any of it has
          // downloaded yet) can legitimately run its very first attempt
          // before the download has created the folder at all, and that
          // is not the same thing as the release having been deleted.
          retryState.delete(key);
          return void (await d(
            `[Sample/Proof-check] Release folder no longer exists -- canceling ${subFolderName} redownload retry for: ${o.basename(releaseDir)}`,
            'info',
          ));
        }
        let exists = !1;
        try {
          exists = await checkExists();
        } catch (e) {
          exists = !1;
        }
        if (exists) return void retryState.delete(key);

        state.attempts++;
        m(releaseDir, subFolderName, silentIfNotFound);
        if (state.attempts >= maxAttempts) {
          retryState.delete(key);
          return void (await d(
            `[Sample/Proof-check] Gave up looking for ${subFolderName} after ${state.attempts} attempt(s) (~${maxHours}h) for: ${o.basename(releaseDir)}`,
            'warning',
          ));
        }
        state.timer = setTimeout(attempt, intervalMs);
      };

    const existing = retryState.get(key);
    if (existing) {
      if (!immediateFirst) return;

      // The shared search queue below (see "l"/"m") throttles repeat
      // searches for the same release+subfolder within a 5-minute window,
      // to avoid hammering the search infrastructure if this function gets
      // triggered more than once for the same folder in quick succession
      // (e.g. once right after the initial download completes, again once
      // a merged Sample/Proof redownload finishes the bundle a second
      // time). Without clearing that throttle here, this "search right
      // now" promise is silently absorbed with no search and no log line
      // at all -- the user just sees the next *scheduled* retry fire a
      // full retry_interval_minutes later instead, with no indication why.
      l.delete(releaseDir.replace(/[\\/]+$/, '') + '::' + subFolderName.toLowerCase());

      clearTimeout(existing.timer);
      existing.timer = setTimeout(attempt, 0);
      await d(
        `[Sample/Proof-check] A delayed ${subFolderName} search was already scheduled for: ${o.basename(releaseDir)} -- searching now instead.`,
        'info',
      );
      return;
    }

    const firstDelayMs = immediateFirst ? 0 : maxHours > 0 ? intervalMs : 0;
    retryState.set(key, {
      attempts: 0,
      everExisted: !1,
      timer: setTimeout(attempt, firstDelayMs),
    });
  }
  const d = async (t, n) => {
      if (u.getValue('log_events'))
        try {
          await e.post('events', {
            text: t,
            severity: n || 'info',
          });
        } catch (e) {
          console.error(`Could not send event message: ${e.message}`);
        }
    },
    sendStatus = async (type, entityId, t, n) => {
      if (!type || !entityId) return void (await d(t, n));
      try {
        await e.post(`${type}/${entityId}/status_message`, {
          text: t,
          severity: n || 'info',
        });
      } catch (err) {
        console.error(`Could not send status message: ${err.message}`);
      }
    },
    g = async (t, n, r) => {
      const i = o.basename(t);
      let s;
      await d(`[Sample/Proof-check] Searching for ${n} folder for: ${i}`, 'info');
      try {
        s = await e.post('search');
      } catch (e) {
        return void (await d(
          `[Sample/Proof-check] Could not start search for ${i}\\${n}: ${e.message}`,
          'error',
        ));
      }
      try {
        try {
          await e.post(`search/${s.id}/hub_search`, {
            query: {
              pattern: `${i} ${n}`,
              file_type: 'directory',
            },

            priority: 1,
          });
        } finally {
          await new Promise((e) => setTimeout(e, 1000 * u.getValue('search_pause_seconds')));
        }
        const a = ((await e.get(`search/${s.id}/results/0/10`)) || []).find(
          (e) => e.name && e.name.toLowerCase() === n.toLowerCase(),
        );
        if (!a)
          return void (
            r || (await d(`[Sample/Proof-check] No ${n} folder found for: ${i}`, 'warning'))
          );

        await e.post(`search/${s.id}/results/${a.id}/download`, {
          target_name: a.name,
          target_directory: t + o.sep,
        });

        await d(`[Sample/Proof-check] ${n} folder re-queued for: ${i}`, 'info');
      } catch (e) {
        await d(
          `[Sample/Proof-check] Search/download failed for ${i}\\${n}: ${e.message}`,
          'error',
        );
        if (e && e.message && /overflow/i.test(e.message)) {
          const backoffMs = 1000 * u.getValue('overflow_backoff_seconds');
          await d(
            `[Sample/Proof-check] Pausing ${Math.round(backoffMs / 1000)}s after a search queue overflow...`,
            'warning',
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      } finally {
        try {
          await e.delete(`search/${s.id}`);
        } catch (e) {}
      }
    },
    m = (e, t, n) => {
      const r = e.replace(/[\\/]+$/, ''),
        o = `${r}::${t.toLowerCase()}`,
        i = Date.now(),
        s = l.get(o);
      (s && i - s < 3e5) ||
        h.has(o) ||
        (h.add(o),
        f.push({
          key: o,
          releaseDir: r,
          subFolderName: t,
          silentIfNotFound: n,
        }),
        (async () => {
          if (!p) {
            for (p = !0; f.length > 0;) {
              const e = f.shift();
              h.delete(e.key);
              l.set(e.key, Date.now());
              try {
                await g(e.releaseDir, e.subFolderName, e.silentIfNotFound);
              } catch (t) {
                await d(
                  `[Sample/Proof-check] Unexpected error processing queue item ${e.key}: ${t && t.message ? t.message : t}`,
                  'error',
                );
              }
            }
            p = !1;
          }
        })());
    },
    hasSfv = async (e) => {
      let t;
      try {
        t = await r.promises.readdir(e, {
          withFileTypes: !0,
        });
      } catch (e) {
        return !1;
      }
      return t.some((e) => e.isFile() && sfvRe.test(e.name));
    },
    v = async (e, t) => {
      let n;
      try {
        n = await r.promises.readdir(e, {
          withFileTypes: !0,
        });
      } catch (e) {
        return null;
      }
      for (const r of n)
        if (r.isDirectory() && r.name.toLowerCase() === t) return o.join(e, r.name);
      return null;
    },
    getSampleVideoRegex = () => {
      const raw = (u.getValue('sample_video_extensions') || '').trim();
      const exts = (raw || 'mkv,mp4,avi,wmv,flv')
        .split(',')
        .map((x) => x.trim().replace(/^\.+/, '').toLowerCase())
        .filter(Boolean);
      if (!exts.length) return /\.mkv$/i;
      const escaped = exts.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return new RegExp('\\.(' + escaped.join('|') + ')$', 'i');
    },
    hasSampleVideo = async (dir, extRe) => {
      let entries;
      try {
        entries = await r.promises.readdir(dir, {
          withFileTypes: !0,
        });
      } catch (e) {
        return !1;
      }
      for (const entry of entries) {
        const full = o.join(dir, entry.name);
        if (entry.isFile() && extRe.test(entry.name)) return !0;
        if (entry.isDirectory() && (await hasSampleVideo(full, extRe))) return !0;
      }
      return !1;
    },
    y = async (e) => hasSampleVideo(e, getSampleVideoRegex()),
    b = async (e) => {
      const bn0 = o.basename(e).toLowerCase();
      if ('sample' === bn0 || 'proof' === bn0) {
        return;
      }
      const sfvPresent = await hasSfv(e);
      if (!sfvPresent) return;
      const isSubsFolder = (() => {
        const t = o.basename(e).toLowerCase();
        return 'subs' === t || 'sub' === t || t.includes('subpack');
      })();
      const excludedGroupMatch = (() => {
        const t = (u.getValue('excluded_groups') || '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        if (0 === t.length) return !1;
        const n = o.basename(e).match(/-([A-Za-z0-9]+)$/);
        return !!n && t.includes(n[1].toLowerCase());
      })();
      if (isSubsFolder || excludedGroupMatch) return;
      const checkSampleSetting = u.getValue('check_sample');
      const sampleUnrestricted = await isWithinRestrictedShareFolder(e, 'sample_restrict_to_share_folder');
      if (checkSampleSetting && sampleUnrestricted) {
        const t = await v(e, 'sample');
        const validSample = t && (await y(t));
        validSample ||
          (await d(
            `[Sample/Proof-check] Sample folder missing or contains no recognized video file: ${e}`,
            'warning',
          ),
          u.getValue('redownload') &&
            scheduleRetry(
              e,
              'Sample',
              !1,
              async () => {
                const t = await v(e, 'sample');
                return !(!t || !(await y(t)));
              },
              !0,
            ));
      }
      const checkProofSetting = u.getValue('check_proof');
      const proofUnrestricted = await isWithinRestrictedShareFolder(e, 'proof_restrict_to_share_folder');
      if (checkProofSetting && proofUnrestricted) {
        const hasProof = await v(e, 'proof');
        hasProof ||
          (u.getValue('redownload') &&
            scheduleRetry(
              e,
              'Proof',
              !0,
              async () => !!(await v(e, 'proof')),
              !0,
            ));
      }
    },
    getScanConcurrency = () => Math.max(1, Number(u.getValue('scan_concurrency')) || 4),
    scanOneLevel = async (dirPath) => {
      let entries;
      try {
        entries = await r.promises.readdir(dirPath, {
          withFileTypes: !0,
        });
      } catch (e) {
        return [];
      }
      if (entries.some((entry) => entry.isFile() && (a.test(entry.name) || sfvRe.test(entry.name)))) {
        try {
          await b(dirPath);
        } catch (err) {
          await d(
            `[Sample/Proof-check] Unexpected error checking ${dirPath}: ${err && err.message ? err.message : err}`,
            'error',
          );
        }
      }
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => o.join(dirPath, entry.name));
    },
    // Bounded worker-pool style traversal: a fixed number of "workers"
    // (scan_concurrency) keep pulling the next pending directory off a
    // shared queue, which grows as each directory's subfolders are
    // discovered -- so sibling folders at every level of the tree (not
    // just the initial root paths) get scanned in parallel, up to the
    // configured limit, instead of one readdir at a time depth-first.
    scanPathsConcurrent = async (rootPaths, concurrency) => {
      const size = Math.max(1, concurrency | 0);
      const queue = rootPaths.slice();
      let active = 0;
      await new Promise((resolve) => {
        const pump = () => {
          if (active === 0 && queue.length === 0) return void resolve();
          while (active < size && queue.length > 0) {
            const dirPath = queue.shift();
            active++;
            scanOneLevel(dirPath)
              .then((children) => {
                if (children && children.length) queue.push(...children);
              })
              .catch(() => {})
              .finally(() => {
                active--;
                pump();
              });
          }
        };
        pump();
      });
    },
    w = async (pathOrPaths) => {
      const roots = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
      await scanPathsConcurrent(roots, getScanConcurrency());
    },
    _ = async (bundle, accept) => {
      accept();
      const rawTarget = bundle && bundle.target;
      if (!rawTarget) {
        await d(
          `[Sample/Proof-check] Completed-download hook fired but the bundle has no usable "target" field (raw bundle: ${JSON.stringify(bundle)}).`,
          'warning',
        );
        return;
      }
      const target = rawTarget.replace(/[\\/]+$/, '');
      b(target);
    },
    // Runs right when a release is queued for download, instead of waiting
    // for it to finish -- so a genuinely missing Sample/Proof (missing from
    // the queued file list itself, not just "not downloaded yet") starts
    // being searched for immediately, in parallel with the main download,
    // rather than only after it. Uses the queued bundle's own file list
    // (available from the moment the bundle is created, even before any of
    // it has been downloaded) instead of reading the folder on disk, since
    // the folder may not exist yet at this point. The check after a
    // completed download (see "_" above) still runs as a safety net for
    // anything this early check misses (e.g. it couldn't read the file
    // list, or a Sample/Proof got added to the release after it was
    // queued).
    checkQueuedBundleEarly = async (bundle) => {
      if (!bundle || !bundle.target) {
        await d(
          `[Sample/Proof-check] queue_bundle_added fired but the bundle has no usable "target" field (raw bundle: ${JSON.stringify(bundle)}).`,
          'warning',
        );
        return;
      }
      const target = bundle.target.replace(/[\\/]+$/, '');
      const bn0 = o.basename(target).toLowerCase();
      if ('sample' === bn0 || 'proof' === bn0) return;

      let files;
      try {
        // A bundle's own file list is available immediately, listing every
        // file it will download (name/relative path) even before any of
        // them exist on disk -- 2000 is far more than any real release
        // needs, so this is a single request rather than paging through it.
        files = await e.get(`queue/bundles/${bundle.id}/files/0/2000`);
      } catch (err) {
        return;
      }
      if (!Array.isArray(files) || !files.length) return;

      const norm = (p) => (p || '').replace(/\\/g, '/');
      const topLevelFolder = (relPath) => {
        const parts = norm(relPath).split('/').filter(Boolean);
        return parts.length > 1 ? parts[0].toLowerCase() : null;
      };

      const sfvPresent = files.some((file) => sfvRe.test(o.basename(norm(file.name || ''))));
      if (!sfvPresent) return;

      const isSubsFolder = 'subs' === bn0 || 'sub' === bn0 || bn0.includes('subpack');
      const excludedGroupMatch = (() => {
        const groups = (u.getValue('excluded_groups') || '')
          .split(',')
          .map((group) => group.trim().toLowerCase())
          .filter(Boolean);
        if (0 === groups.length) return !1;
        const match = bn0.match(/-([A-Za-z0-9]+)$/);
        return !!match && groups.includes(match[1].toLowerCase());
      })();
      if (isSubsFolder || excludedGroupMatch) return;

      const sampleExtRe = getSampleVideoRegex();
      const plannedSample = files.some(
        (file) => topLevelFolder(file.name) === 'sample' && sampleExtRe.test(o.basename(norm(file.name || ''))),
      );
      const plannedProof = files.some((file) => topLevelFolder(file.name) === 'proof');

      if (u.getValue('check_sample') && !plannedSample && u.getValue('redownload')) {
        const sampleUnrestricted = await isWithinRestrictedShareFolder(target, 'sample_restrict_to_share_folder');
        if (sampleUnrestricted) {
          await d(
            `[Sample/Proof-check] Release queued without a Sample among its files -- searching now: ${target}`,
            'info',
          );
          scheduleRetry(
            target,
            'Sample',
            !1,
            async () => {
              const t = await v(target, 'sample');
              return !(!t || !(await y(t)));
            },
            !0,
          );
        }
      }

      if (u.getValue('check_proof') && !plannedProof && u.getValue('redownload')) {
        const proofUnrestricted = await isWithinRestrictedShareFolder(target, 'proof_restrict_to_share_folder');
        if (proofUnrestricted) {
          scheduleRetry(target, 'Proof', !0, async () => !!(await v(target, 'proof')), !0);
        }
      }
    };

  function checkMenuAccess(menuItem, permissions) {
    if (!menuItem.access) return !0;
    return permissions.indexOf('admin') !== -1 || permissions.indexOf(menuItem.access) !== -1;
  }
  const MENU_URLS_SUPPORT = 'urls',
    MENU_FORM_SUPPORT = 'form';

  function menuHasSupport(support, supports) {
    return !!supports && supports.indexOf(support) !== -1;
  }
  async function validateMenuItem(menuItem, data) {
    const {
      selected_ids: selected_ids,
      entity_id: entity_id,
      permissions: permissions,
      supports: supports,
    } = data;
    if (menuItem.urls && !menuHasSupport(MENU_URLS_SUPPORT, supports)) return !1;
    if (menuItem.filter) {
      const filterResult = await menuItem.filter(selected_ids, entity_id, permissions, supports);
      if (!filterResult) return !1;
    }
    return checkMenuAccess(menuItem, permissions);
  }
  async function parseMenuItemCallbackData(item, data) {
    const {
      selected_ids: selected_ids,
      entity_id: entity_id,
      permissions: permissions,
      supports: supports,
    } = data;
    if (item.urls && item.urls.length) {
      const urls =
        'function' == typeof item.urls
          ? await item.urls(selected_ids, entity_id, permissions, supports)
          : item.urls;
      return {
        urls: urls,
      };
    }
    if (item.formDefinitions && menuHasSupport(MENU_FORM_SUPPORT, supports)) {
      const form_definitions =
        'function' == typeof item.formDefinitions
          ? await item.formDefinitions(selected_ids, entity_id, permissions, supports)
          : item.formDefinitions;
      return {
        form_definitions: form_definitions,
      };
    }
    return {};
  }
  async function resolveRealPaths(socket, virtualPath) {
    if (!virtualPath) return [];
    const segments = virtualPath.split('/').filter(Boolean);
    if (segments.length <= 1) return [];
    const relative = segments.slice(1).join(o.sep);
    let roots;
    try {
      roots = await socket.get('share_roots');
    } catch (e) {
      return [];
    }
    const seen = new Set(),
      candidates = [];
    for (const root of roots || []) {
      if (!root || !root.path) continue;
      const base =
          root.path.endsWith(o.sep) || root.path.endsWith('/') ? root.path : root.path + o.sep,
        candidate = base + relative;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        try {
          const st = await fsp2.stat(candidate);
          st.isDirectory() && candidates.push(candidate);
        } catch (e) {}
      }
    }
    return candidates;
  }

  async function resolveBundleTarget(socket, token) {
    let bundle;
    try {
      bundle = await socket.get(`queue/bundles/${token}`);
    } catch (err) {
      const status = err && (err.status || err.code);
      return {
        target: null,
        error: `GET queue/bundles/${token} failed${status ? ` (${status})` : ''}: ${err && err.message}`,
      };
    }
    const rawTarget = bundle && bundle.target;
    if (!rawTarget) {
      return {
        target: null,
        error: `bundle ${token} has no usable "target" field (raw value: ${JSON.stringify(
          rawTarget,
        )}; bundle keys: ${bundle ? Object.keys(bundle).join(', ') : 'n/a'})`,
      };
    }
    const target = rawTarget.replace(/[\\/]+$/, '');
    try {
      const st = await fsp2.stat(target);
      if (!st.isDirectory()) {
        return { target: null, error: `target "${target}" exists but is not a directory` };
      }
      return { target, error: null };
    } catch (err) {
      return { target: null, error: `could not stat target "${target}": ${err.message}` };
    }
  }
  async function registerContextMenuItems(socket, menuItems, menuId, subscriberInfo) {
    const removeListener = await socket.addListener(
        'menus',
        `${menuId}_menuitem_selected`,
        async (data) => {
          if (data.hook_id !== subscriberInfo.id) return;
          const menuItem = menuItems.find((i) => data.menuitem_id === i.id);
          if (!menuItem) return;
          const isValid = await validateMenuItem(menuItem, data);
          if (isValid && menuItem.onClick) {
            const {
              selected_ids: selected_ids,
              entity_id: entity_id,
              permissions: permissions,
              supports: supports,
              form_values: form_values,
            } = data;
            menuItem.onClick(selected_ids, entity_id, permissions, supports, form_values);
          }
        },
      ),
      removeHook = await socket.addHook(
        'menus',
        `${menuId}_list_menuitems`,
        async (data, accept, reject) => {
          const validItems = [];
          for (const item of menuItems) {
            const isValid = await validateMenuItem(item, data);
            if (!isValid) continue;
            const parsedCallbackData = await parseMenuItemCallbackData(item, data),
              { onClick: onClick, id: id, title: title, icon: icon } = item;
            (onClick || (parsedCallbackData.urls && parsedCallbackData.urls.length)) &&
              validItems.push(
                Object.assign(
                  {
                    id: id,
                    title: title,
                    icon: icon,
                  },
                  parsedCallbackData,
                ),
              );
          }
          accept({
            menuitems: validItems,
          });
        },
        subscriberInfo,
      );
    return () => {
      removeHook();
      removeListener();
    };
  }

  t.onStart = async (r) => {
    await u.load();
    try {
      await e.addHook('queue', 'queue_bundle_finished_hook', _, {
        id: 'sample_proof_bundle_finished',
        name: 'Sample/Proof check on completed download',
      });
      await d('[Sample/Proof-check] Automatic check after a completed download is active.', 'info');
    } catch (err) {
      await d(
        `[Sample/Proof-check] Could not register the completed-download hook, automatic checks are disabled: ${err.message}`,
        'error',
      );
      console.error(`Could not register hook: ${err.message}`);
    }
    try {
      await e.addListener('queue', 'queue_bundle_added', (bundle) => {
        checkQueuedBundleEarly(bundle).catch((err) => {
          console.error(`Could not run the early Sample/Proof check: ${err.message}`);
        });
      });
      await d(
        '[Sample/Proof-check] Early check for a Sample/Proof missing from a newly queued release is active.',
        'info',
      );
    } catch (err) {
      await d(
        `[Sample/Proof-check] Could not register the queue_bundle_added listener, the early check is disabled (the check after a completed download still works): ${err.message}`,
        'error',
      );
      console.error(`Could not register queue_bundle_added listener: ${err.message}`);
    }
    const sampleProofHelpText = `
Sample/Proof-check commands

/sampleproofcheck - Scan the entire share
/sampleproofcheck <path> - Scan only that folder (real disk path, not the share name)`;
    const handleChatCommand = async (type, data, entityId) => {
      const command = (data.command || '').toLowerCase(),
        args = data.args || [];
      if ('sampleproofcheck' === command) {
        const targetPath = args.join(' ').trim();

        if (targetPath.toLowerCase() === 'help')
          await sendStatus(type, entityId, sampleProofHelpText, 'info');
        else if (targetPath)
          (await d(`[Sample/Proof-check] Scan started for folder: ${targetPath}`, 'info'),
            await w(targetPath),
            await d(`[Sample/Proof-check] Scan of "${targetPath}" complete.`, 'info'));
        else {
          await d('[Sample/Proof-check] Scan started...', 'info');
          let roots;
          try {
            roots = await e.get('share_roots');
          } catch (err) {
            return void (await d(
              `[Sample/Proof-check] Could not retrieve share folders: ${err.message}`,
              'error',
            ));
          }
          await w(roots.map((root) => root.path));
          await d('[Sample/Proof-check] Scan complete.', 'info');
        }
      } else
        'sampleproofcheckhelp' === command &&
          (await sendStatus(type, entityId, sampleProofHelpText, 'info'));
    };
    try {
      (await e.addListener('hubs', 'hub_text_command', (data, entityId) =>
        handleChatCommand('hubs', data, entityId),
      ),
        await e.addListener('private_chat', 'private_chat_text_command', (data, entityId) =>
          handleChatCommand('private_chat', data, entityId),
        ));
    } catch (err) {
      console.error(`Could not register command listener: ${err.message}`);
    }
    r.system_info.api_feature_level >= 4 &&
      (await registerContextMenuItems(
        e,
        [
          {
            id: 'scan_sample_proof',
            title: 'Scan share for missing Sample/Proof folders',
            icon: {
              semantic: 'yellow search',
            },
            onClick: () => {
              (async () => {
                let t;
                await d('[Sample/Proof-check] Scan started...', 'info');
                try {
                  t = await e.get('share_roots');
                } catch (e) {
                  return void (await d(
                    `[Sample/Proof-check] Could not retrieve share folders: ${e.message}`,
                    'error',
                  ));
                }
                await w(t.map((root) => root.path));
                await d('[Sample/Proof-check] Scan complete.', 'info');
              })();
            },
            access: 'settings_edit',
            filter: (e) => -1 !== e.indexOf(t.name),
          },
        ],
        'extension',
        {
          id: t.name,
          name: 'Sample/Proof-check',
        },
      ));
    if (r && r.system_info && r.system_info.api_feature_level >= 8)
      try {
        (await registerContextMenuItems(
          e,
          [
            {
              id: 'sample_proof_check_folder',
              title: 'Check Sample/Proof for this folder',
              icon: {
                semantic: 'yellow search',
              },
              filter: (selectedIds, entityId) => entityId === r.system_info.cid,
              access: 'settings_edit',
              onClick: async (selectedIds, entityId) => {
                for (const itemId of selectedIds) {
                  let item;
                  try {
                    item = await e.get(`filelists/${entityId}/items/${itemId}`);
                  } catch (err) {
                    continue;
                  }
                  if (!item || 'directory' !== item.type.id) continue;
                  let targets = [];
                  try {
                    targets = await resolveRealPaths(e, item.path || '');
                  } catch (err) {
                    targets = [];
                  }
                  if (
                    (0 === targets.length &&
                      item.dupe &&
                      item.dupe.paths &&
                      item.dupe.paths.length &&
                      (targets = item.dupe.paths),
                    0 === targets.length)
                  ) {
                    await d(
                      `[Sample/Proof-check] Context menu: could not resolve a real disk path for "${item.name}" (virtual path: ${item.path}).`,
                      'warning',
                    );
                    continue;
                  }
                  for (const p of targets) {
                    (await d(`[Sample/Proof-check] Scan started for folder: ${p}`, 'info'),
                      await w(p),
                      await d(`[Sample/Proof-check] Scan of "${p}" complete.`, 'info'));
                  }
                }
              },
            },
          ],
          'filelist_item',
          {
            id: t.name,
            name: t.name,
          },
        ),
          await d(
            '[Sample/Proof-check] Context menu item "Check Sample/Proof for this folder" registered for Own filelist.',
            'info',
          ));
      } catch (e) {
        (await d(
          `[Sample/Proof-check] Could not register context menu item: ${e.message}`,
          'error',
        ),
          console.error(`Could not register context menu item: ${e.message}`));
      }
    else
      await d(
        `[Sample/Proof-check] Context menu item skipped: api_feature_level is ${r && r.system_info ? r.system_info.api_feature_level : 'unknown'} (needs >= 8).`,
        'warning',
      );

    if (r && r.system_info && r.system_info.api_feature_level >= 8)
      try {
        (await registerContextMenuItems(
          e,
          [
            {
              id: 'sample_proof_check_bundle',
              title: 'Check Sample/Proof for this folder',
              icon: {
                semantic: 'yellow search',
              },
              access: 'settings_edit',
              onClick: async (selectedIds) => {
                for (const token of selectedIds) {
                  const resolved = await resolveBundleTarget(e, token);
                  if (!resolved.target) {
                    await d(
                      `[Sample/Proof-check] Context menu: could not resolve a real disk folder for queue item ${token} (may be a single-file download, or already removed). Detail: ${resolved.error}`,
                      'warning',
                    );
                    continue;
                  }
                  (await d(`[Sample/Proof-check] Scan started for folder: ${resolved.target}`, 'info'),
                    await w(resolved.target),
                    await d(`[Sample/Proof-check] Scan of "${resolved.target}" complete.`, 'info'));
                }
              },
            },
          ],
          'queue_bundle',
          {
            id: t.name,
            name: t.name,
          },
        ),
          await d(
            '[Sample/Proof-check] Context menu item "Check Sample/Proof for this folder" registered for the Download Queue.',
            'info',
          ));
      } catch (e) {
        (await d(
          `[Sample/Proof-check] Could not register queue context menu item: ${e.message}`,
          'error',
        ),
          console.error(`Could not register queue context menu item: ${e.message}`));
      }
    else
      await d(
        `[Sample/Proof-check] Queue context menu item skipped: api_feature_level is ${r && r.system_info ? r.system_info.api_feature_level : 'unknown'} (needs >= 8).`,
        'warning',
      );
    await d(
      '[Sample/Proof-check] Extension started, command /sampleproofcheck [path] is active. Type /sampleproofcheckhelp for help.',
      'info',
    );
  };

  t.onStop = () => {};
};
