use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Instant;

// Low-level `getattrlistbulk` (`FSOPT_NOFOLLOW`) and `readdir` directory readers live in `scanner_io`.
use crate::scanner_io::{
    ChildKind, DirScratch, build_child_path, is_linked_worktree_git_file, list_directory_fast,
    write_lowercase_into,
};

#[derive(Debug, Clone)]
pub struct ScanFilterConfig {
    pub exclude_names: HashSet<String>,
    pub context_dependent_names: HashSet<String>,
    pub project_markers: HashSet<String>,
    pub exclude_dir_suffixes: Vec<String>,
    pub exclude_hidden: bool,
    pub exclude_path_prefixes: Vec<String>,
    pub allow_path_prefixes: Vec<String>,
    pub max_depth: usize,
    pub include_dirs: bool,
    pub skip_linked_worktrees: bool,
}

impl Default for ScanFilterConfig {
    fn default() -> Self {
        Self {
            exclude_names: HashSet::new(),
            context_dependent_names: HashSet::new(),
            project_markers: HashSet::new(),
            exclude_dir_suffixes: Vec::new(),
            exclude_hidden: false,
            exclude_path_prefixes: Vec::new(),
            allow_path_prefixes: Vec::new(),
            max_depth: 24,
            include_dirs: true,
            skip_linked_worktrees: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RawScannedEntry {
    pub dir: String,
    pub name: String,
    pub is_dir: bool,
    pub mtime_sec: u32,
}

#[derive(Debug, Clone)]
pub struct ScannedGroupEntry {
    pub name: String,
    pub is_dir: bool,
    pub mtime_sec: u32,
}

#[derive(Debug, Clone)]
pub struct ScannedDirGroup {
    pub dir: String,
    pub entries: Vec<ScannedGroupEntry>,
}

#[derive(Debug, Clone)]
pub struct ScanOutcome {
    pub entries: Vec<RawScannedEntry>,
    pub file_count: usize,
    pub dir_count: usize,
    pub skipped_count: usize,
    pub error_count: usize,
    pub duration_ms: f64,
    pub backend: &'static str,
}

#[derive(Debug, Clone)]
pub struct ScanGroupedOutcome {
    pub groups: Vec<ScannedDirGroup>,
    pub file_count: usize,
    pub dir_count: usize,
    pub skipped_count: usize,
    pub error_count: usize,
    pub duration_ms: f64,
    pub backend: &'static str,
}

#[inline]
fn is_prefix_match(path: &str, prefix: &str) -> bool {
    if path == prefix {
        return true;
    }
    let prefix_clean = prefix.trim_end_matches(['/', '\\']);
    if prefix_clean.is_empty() {
        return path.starts_with('/');
    }
    if !path.starts_with(prefix_clean) {
        return false;
    }
    matches!(
        path.as_bytes().get(prefix_clean.len()),
        None | Some(b'/') | Some(b'\\')
    )
}

#[inline]
fn is_path_excluded_by_prefix(path: &str, config: &ScanFilterConfig) -> bool {
    if config.exclude_path_prefixes.is_empty() {
        return false;
    }
    if config
        .allow_path_prefixes
        .iter()
        .any(|allow| is_prefix_match(path, allow))
    {
        return false;
    }
    config
        .exclude_path_prefixes
        .iter()
        .any(|ex| is_prefix_match(path, ex))
}

#[derive(Clone)]
struct DirTask {
    path: String,
    depth: usize,
    inside_project: bool,
    is_root: bool,
}

#[derive(Default)]
struct WorkerAcc {
    groups: Vec<ScannedDirGroup>,
    file_count: usize,
    dir_count: usize,
    skipped_count: usize,
    error_count: usize,
}

fn process_dir_task(
    frame: DirTask,
    config: &ScanFilterConfig,
    scratch: &mut DirScratch,
    local_stack: &mut Vec<DirTask>,
    acc: &mut WorkerAcc,
) {
    if !frame.is_root && is_path_excluded_by_prefix(&frame.path, config) {
        acc.skipped_count += 1;
        return;
    }

    if list_directory_fast(&frame.path, scratch).is_err() {
        acc.error_count += 1;
        return;
    }

    let check_linked = config.skip_linked_worktrees && !frame.is_root;
    let check_markers = !config.project_markers.is_empty();
    let mut has_project_marker = false;
    let mut linked_worktree = false;

    if check_linked || check_markers {
        for i in 0..scratch.children.len() {
            let meta = scratch.children[i];
            let name = &scratch.child_names[meta.name_start as usize..meta.name_end as usize];
            if check_linked && meta.kind == ChildKind::File && name == ".git" {
                build_child_path(&frame.path, name, &mut scratch.child_path_buf);
                if is_linked_worktree_git_file(&scratch.child_path_buf) {
                    linked_worktree = true;
                    break;
                }
            }
            if check_markers && !has_project_marker {
                write_lowercase_into(name, &mut scratch.lower_buf);
                if config.project_markers.contains(scratch.lower_buf.as_str()) {
                    has_project_marker = true;
                }
            }
        }
    }

    if linked_worktree {
        acc.skipped_count += 1;
        return;
    }

    let child_inside_project = if frame.is_root {
        false
    } else {
        frame.inside_project || has_project_marker
    };

    let mut group_entries = Vec::new();
    let has_dir_suffixes = !config.exclude_dir_suffixes.is_empty();
    let has_prefix_rules = !config.exclude_path_prefixes.is_empty();

    for i in 0..scratch.children.len() {
        let meta = scratch.children[i];
        if meta.kind == ChildKind::Symlink || meta.kind == ChildKind::Other {
            acc.skipped_count += 1;
            continue;
        }

        let name = &scratch.child_names[meta.name_start as usize..meta.name_end as usize];
        if config.exclude_hidden && name.starts_with('.') {
            acc.skipped_count += 1;
            continue;
        }

        write_lowercase_into(name, &mut scratch.lower_buf);
        let lower_name = scratch.lower_buf.as_str();

        if meta.kind == ChildKind::Dir {
            if config.exclude_names.contains(lower_name) {
                acc.skipped_count += 1;
                continue;
            }
            if child_inside_project && config.context_dependent_names.contains(lower_name) {
                acc.skipped_count += 1;
                continue;
            }
            if has_dir_suffixes
                && config
                    .exclude_dir_suffixes
                    .iter()
                    .any(|suf| lower_name.ends_with(suf.as_str()))
            {
                acc.skipped_count += 1;
                continue;
            }

            let need_child_path = has_prefix_rules || frame.depth < config.max_depth;
            if need_child_path {
                build_child_path(&frame.path, name, &mut scratch.child_path_buf);
                if has_prefix_rules && is_path_excluded_by_prefix(&scratch.child_path_buf, config) {
                    acc.skipped_count += 1;
                    continue;
                }
            }

            if config.include_dirs {
                group_entries.push(ScannedGroupEntry {
                    name: name.to_owned(),
                    is_dir: true,
                    mtime_sec: meta.mtime_sec,
                });
                acc.dir_count += 1;
            }

            if frame.depth < config.max_depth {
                local_stack.push(DirTask {
                    path: scratch.child_path_buf.clone(),
                    depth: frame.depth + 1,
                    inside_project: child_inside_project,
                    is_root: false,
                });
            }
        } else if meta.kind == ChildKind::File {
            if config.exclude_names.contains(lower_name) {
                acc.skipped_count += 1;
                continue;
            }
            group_entries.push(ScannedGroupEntry {
                name: name.to_owned(),
                is_dir: false,
                mtime_sec: meta.mtime_sec,
            });
            acc.file_count += 1;
        }
    }

    if !group_entries.is_empty() {
        acc.groups.push(ScannedDirGroup {
            dir: frame.path,
            entries: group_entries,
        });
    }
}

struct SharedQueue {
    queue: VecDeque<DirTask>,
    active_workers: usize,
    done: bool,
}

pub fn scan_roots_bulk_grouped(
    roots: &[String],
    config: &ScanFilterConfig,
    cancel_flag: Option<&Arc<AtomicBool>>,
) -> ScanGroupedOutcome {
    let started = Instant::now();
    let mut visited_roots = HashSet::new();
    let mut initial_queue = VecDeque::new();
    let mut init_errors = 0usize;

    for raw_root in roots {
        let root_path = PathBuf::from(raw_root);
        let canonical = fs::canonicalize(&root_path).unwrap_or(root_path.clone());
        let ok_root = match fs::symlink_metadata(&root_path) {
            Ok(meta) => meta.is_dir() && !meta.file_type().is_symlink(),
            Err(_) => false,
        };
        if !ok_root {
            init_errors += 1;
            continue;
        }
        if !visited_roots.insert(canonical) {
            continue;
        }
        initial_queue.push_back(DirTask {
            path: raw_root.clone(),
            depth: 0,
            inside_project: false,
            is_root: true,
        });
    }

    if initial_queue.is_empty() {
        return ScanGroupedOutcome {
            groups: Vec::new(),
            file_count: 0,
            dir_count: 0,
            skipped_count: 0,
            error_count: init_errors,
            duration_ms: started.elapsed().as_secs_f64() * 1000.0,
            backend: if cfg!(target_os = "macos") {
                "getattrlistbulk"
            } else {
                "readdir"
            },
        };
    }

    let num_workers = std::thread::available_parallelism()
        .map(|n| n.get().clamp(2, 6))
        .unwrap_or(4);

    let shared = Mutex::new(SharedQueue {
        queue: initial_queue,
        active_workers: 0,
        done: false,
    });
    let cvar = Condvar::new();
    let waiting_workers = AtomicUsize::new(0);

    let worker_results: Vec<WorkerAcc> = std::thread::scope(|scope| {
        let mut handles = Vec::with_capacity(num_workers);
        for _ in 0..num_workers {
            handles.push(scope.spawn(|| {
                let mut scratch = DirScratch::new();
                let mut local_stack: Vec<DirTask> = Vec::with_capacity(64);
                let mut acc = WorkerAcc::default();
                let mut holding_active = false;

                loop {
                    if cancel_flag.is_some_and(|flag| flag.load(Ordering::Acquire)) {
                        if holding_active {
                            let mut g = shared.lock().unwrap();
                            g.active_workers = g.active_workers.saturating_sub(1);
                            g.done = true;
                            cvar.notify_all();
                        }
                        break;
                    }

                    let task = if let Some(t) = local_stack.pop() {
                        t
                    } else {
                        let mut g = shared.lock().unwrap();
                        if holding_active {
                            g.active_workers = g.active_workers.saturating_sub(1);
                        }
                        loop {
                            if cancel_flag.is_some_and(|flag| flag.load(Ordering::Acquire)) {
                                g.done = true;
                                cvar.notify_all();
                                return acc;
                            }
                            if let Some(t) = g.queue.pop_front() {
                                g.active_workers += 1;
                                holding_active = true;
                                break t;
                            }
                            if g.active_workers == 0 || g.done {
                                g.done = true;
                                cvar.notify_all();
                                return acc;
                            }
                            waiting_workers.fetch_add(1, Ordering::Release);
                            g = cvar.wait(g).unwrap();
                            waiting_workers.fetch_sub(1, Ordering::AcqRel);
                        }
                    };

                    process_dir_task(task, config, &mut scratch, &mut local_stack, &mut acc);

                    if local_stack.len() > 1 && waiting_workers.load(Ordering::Acquire) > 0 {
                        let split = local_stack.len() / 2;
                        let mut g = shared.lock().unwrap();
                        for t in local_stack.drain(..split) {
                            g.queue.push_back(t);
                        }
                        cvar.notify_all();
                    }
                }
                acc
            }));
        }

        let mut results = Vec::with_capacity(handles.len());
        for h in handles {
            if let Ok(acc) = h.join() {
                results.push(acc);
            }
        }
        results
    });

    let total_groups: usize = worker_results.iter().map(|r| r.groups.len()).sum();
    let mut groups = Vec::with_capacity(total_groups);
    let mut file_count = 0usize;
    let mut dir_count = 0usize;
    let mut skipped_count = 0usize;
    let mut error_count = init_errors;

    for r in worker_results {
        file_count += r.file_count;
        dir_count += r.dir_count;
        skipped_count += r.skipped_count;
        error_count += r.error_count;
        groups.extend(r.groups);
    }

    ScanGroupedOutcome {
        groups,
        file_count,
        dir_count,
        skipped_count,
        error_count,
        duration_ms: started.elapsed().as_secs_f64() * 1000.0,
        backend: if cfg!(target_os = "macos") {
            "getattrlistbulk"
        } else {
            "readdir"
        },
    }
}

pub fn scan_roots_bulk(
    roots: &[String],
    config: &ScanFilterConfig,
    cancel_flag: Option<&Arc<AtomicBool>>,
) -> ScanOutcome {
    let grouped = scan_roots_bulk_grouped(roots, config, cancel_flag);
    let mut entries = Vec::with_capacity(grouped.file_count + grouped.dir_count);
    for group in grouped.groups {
        for item in group.entries {
            entries.push(RawScannedEntry {
                dir: group.dir.clone(),
                name: item.name,
                is_dir: item.is_dir,
                mtime_sec: item.mtime_sec,
            });
        }
    }
    ScanOutcome {
        entries,
        file_count: grouped.file_count,
        dir_count: grouped.dir_count,
        skipped_count: grouped.skipped_count,
        error_count: grouped.error_count,
        duration_ms: grouped.duration_ms,
        backend: grouped.backend,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("tuff-scan-{label}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn enforces_case_insensitive_project_markers_worktrees_suffixes_hidden_and_prefixes() {
        let root = make_temp_dir("parity");
        let root_str = root.to_string_lossy().into_owned();

        let proj = root.join("rust-proj");
        fs::create_dir_all(proj.join("target")).unwrap();
        fs::create_dir_all(proj.join("src")).unwrap();
        fs::write(proj.join("Cargo.toml"), "[package]").unwrap();
        fs::write(proj.join("target/debug.bin"), "bin").unwrap();
        fs::write(proj.join("src/main.rs"), "fn main() {}").unwrap();

        let docs = root.join("Docs");
        fs::create_dir_all(docs.join("build")).unwrap();
        fs::write(docs.join("build/notes.md"), "# keep").unwrap();

        let wt = root.join("linked-wt");
        fs::create_dir_all(&wt).unwrap();
        fs::write(wt.join(".git"), "gitdir: /tmp/repo/.git/worktrees/wt1\n").unwrap();
        fs::write(wt.join("wt.ts"), "export {}").unwrap();

        let bundle = root.join("MyApp.app");
        fs::create_dir_all(bundle.join("Contents")).unwrap();
        fs::write(bundle.join("Contents/Info.plist"), "<plist/>").unwrap();
        fs::write(root.join(".hidden-secret"), "secret").unwrap();

        let lib_dir = root.join("Library");
        let allowed_sub = lib_dir.join("Mobile Documents");
        fs::create_dir_all(lib_dir.join("Caches")).unwrap();
        fs::create_dir_all(&allowed_sub).unwrap();
        fs::write(lib_dir.join("Caches/cache.db"), "x").unwrap();
        fs::write(allowed_sub.join("cloud.txt"), "ok").unwrap();

        let mut cfg = ScanFilterConfig::default();
        cfg.exclude_names.insert("node_modules".into());
        cfg.context_dependent_names.insert("target".into());
        cfg.context_dependent_names.insert("build".into());
        cfg.project_markers.insert("cargo.toml".into());
        cfg.exclude_dir_suffixes.push(".app".into());
        cfg.exclude_hidden = true;
        cfg.exclude_path_prefixes
            .push(lib_dir.to_string_lossy().into_owned());
        cfg.allow_path_prefixes
            .push(allowed_sub.to_string_lossy().into_owned());

        let outcome = scan_roots_bulk(&[root_str], &cfg, None);
        let names: HashSet<String> = outcome.entries.iter().map(|e| e.name.clone()).collect();

        assert!(names.contains("main.rs"));
        assert!(names.contains("Cargo.toml"));
        assert!(names.contains("notes.md"));
        assert!(
            outcome
                .entries
                .iter()
                .find(|e| e.name == "main.rs")
                .is_some_and(|e| e.mtime_sec > 0)
        );
        assert!(
            !names.contains("debug.bin"),
            "Cargo.toml project must exclude target/"
        );
        assert!(!names.contains("wt.ts"), "linked worktree must be skipped");
        assert!(
            !names.contains("Info.plist"),
            ".app bundle suffix must be skipped"
        );
        assert!(
            !names.contains(".hidden-secret"),
            "exclude_hidden must skip dotfiles"
        );
        assert!(
            !names.contains("cache.db"),
            "Library/Caches must be excluded"
        );

        let icloud_scan =
            scan_roots_bulk(&[allowed_sub.to_string_lossy().into_owned()], &cfg, None);
        assert!(icloud_scan.entries.iter().any(|e| e.name == "cloud.txt"));

        let _ = fs::remove_dir_all(&root);
    }
}
