use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
use std::sync::{Condvar, Mutex, OnceLock};

struct JobPacket {
    func: *const (),
    call: unsafe fn(*const (), usize),
    num_tasks: usize,
    next_task: AtomicUsize,
    active_threads: AtomicUsize,
    done_lock: Mutex<bool>,
    done_cvar: Condvar,
}

unsafe impl Send for JobPacket {}
unsafe impl Sync for JobPacket {}

struct PoolState {
    epoch: u64,
    job: *const JobPacket,
    shutdown: bool,
}

unsafe impl Send for PoolState {}

/// Persistent worker pool for parallel arena search chunks, avoiding per-query
/// `pthread_create` overhead on keystroke hot paths.
pub(crate) struct SearchPool {
    dispatch_lock: Mutex<()>,
    shared: Mutex<PoolState>,
    wake_cvar: Condvar,
    worker_count: AtomicUsize,
}

impl SearchPool {
    fn new() -> Self {
        Self {
            dispatch_lock: Mutex::new(()),
            shared: Mutex::new(PoolState {
                epoch: 0,
                job: std::ptr::null(),
                shutdown: false,
            }),
            wake_cvar: Condvar::new(),
            worker_count: AtomicUsize::new(0),
        }
    }

    pub(crate) fn init_global() -> &'static SearchPool {
        static POOL: OnceLock<SearchPool> = OnceLock::new();
        static WORKERS_STARTED: OnceLock<()> = OnceLock::new();
        let pool = POOL.get_or_init(SearchPool::new);
        WORKERS_STARTED.get_or_init(|| {
            let total = std::thread::available_parallelism()
                .map(|n| n.get().clamp(2, 4))
                .unwrap_or(2);
            let desired = total.saturating_sub(1);
            let mut spawned = 0usize;
            for _ in 0..desired {
                if std::thread::Builder::new()
                    .name("tuff-arena-search".into())
                    .spawn(move || pool_worker_loop(pool))
                    .is_ok()
                {
                    spawned += 1;
                }
            }
            pool.worker_count.store(spawned, AtomicOrdering::Release);
        });
        pool
    }

    /// Executes `task_fn(chunk_idx)` across `0..num_tasks` using persistent workers + caller.
    /// Falls back to sequential execution on the caller thread if another search holds `dispatch_lock`.
    pub(crate) fn scope_chunks<F>(&self, num_tasks: usize, task_fn: &F)
    where
        F: Fn(usize) + Sync,
    {
        let workers = self.worker_count.load(AtomicOrdering::Acquire);
        if workers == 0 || num_tasks <= 1 {
            for i in 0..num_tasks {
                task_fn(i);
            }
            return;
        }

        let _dispatch_guard = match self.dispatch_lock.try_lock() {
            Ok(guard) => guard,
            Err(std::sync::TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
            Err(std::sync::TryLockError::WouldBlock) => {
                for i in 0..num_tasks {
                    task_fn(i);
                }
                return;
            }
        };

        unsafe fn trampoline<F: Fn(usize) + Sync>(ptr: *const (), task_idx: usize) {
            let f = unsafe { &*(ptr as *const F) };
            f(task_idx);
        }

        let total_participants = workers + 1;
        let packet = JobPacket {
            func: (task_fn as *const F).cast::<()>(),
            call: trampoline::<F>,
            num_tasks,
            next_task: AtomicUsize::new(0),
            active_threads: AtomicUsize::new(total_participants),
            done_lock: Mutex::new(false),
            done_cvar: Condvar::new(),
        };

        struct PacketGuard<'a> {
            pool: &'a SearchPool,
            packet: &'a JobPacket,
        }

        impl Drop for PacketGuard<'_> {
            fn drop(&mut self) {
                {
                    let mut guard = self
                        .packet
                        .done_lock
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    while !*guard {
                        guard = self
                            .packet
                            .done_cvar
                            .wait(guard)
                            .unwrap_or_else(|e| e.into_inner());
                    }
                }
                let mut state = self.pool.shared.lock().unwrap_or_else(|e| e.into_inner());
                state.job = std::ptr::null();
            }
        }

        struct CallerParticipantGuard<'a> {
            packet: &'a JobPacket,
        }

        impl Drop for CallerParticipantGuard<'_> {
            fn drop(&mut self) {
                if self.packet.active_threads.fetch_sub(1, AtomicOrdering::AcqRel) == 1 {
                    let mut done = self
                        .packet
                        .done_lock
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    *done = true;
                    self.packet.done_cvar.notify_all();
                }
            }
        }

        {
            let mut state = self.shared.lock().unwrap_or_else(|e| e.into_inner());
            state.job = &packet as *const JobPacket;
            state.epoch = state.epoch.wrapping_add(1);
            self.wake_cvar.notify_all();
        }
        // Drop order is LIFO: `_caller_guard` drops BEFORE `_packet_guard`, so even if
        // `run_packet_tasks` unwinds on the caller thread, `active_threads` is decremented
        // and `done_cvar` is notified before `PacketGuard::drop` waits for workers to finish.
        let _packet_guard = PacketGuard {
            pool: self,
            packet: &packet,
        };
        let _caller_guard = CallerParticipantGuard { packet: &packet };

        run_packet_tasks(&packet);
    }
}

#[inline]
fn run_packet_tasks(packet: &JobPacket) {
    loop {
        let task_idx = packet.next_task.fetch_add(1, AtomicOrdering::AcqRel);
        if task_idx >= packet.num_tasks {
            break;
        }
        unsafe {
            (packet.call)(packet.func, task_idx);
        }
    }
}

fn pool_worker_loop(pool: &'static SearchPool) {
    let mut seen_epoch = 0u64;
    loop {
        let job_ptr: *const JobPacket = {
            let mut state = pool.shared.lock().unwrap_or_else(|e| e.into_inner());
            while state.epoch == seen_epoch || state.job.is_null() {
                if state.shutdown {
                    return;
                }
                state = pool
                    .wake_cvar
                    .wait(state)
                    .unwrap_or_else(|e| e.into_inner());
            }
            seen_epoch = state.epoch;
            state.job
        };

        if job_ptr.is_null() {
            continue;
        }
        // SAFETY: `PacketGuard` blocks caller exit until `active_threads` reaches 0.
        let packet = unsafe { &*job_ptr };
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_packet_tasks(packet);
        }));
        if packet.active_threads.fetch_sub(1, AtomicOrdering::AcqRel) == 1 {
            let mut done = packet.done_lock.lock().unwrap_or_else(|e| e.into_inner());
            *done = true;
            packet.done_cvar.notify_all();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executes_all_chunks_exactly_once_across_calls() {
        let pool = SearchPool::init_global();
        let visited = (0..8).map(|_| AtomicUsize::new(0)).collect::<Vec<_>>();
        pool.scope_chunks(8, &|idx| {
            visited[idx].fetch_add(1, AtomicOrdering::SeqCst);
        });
        for slot in &visited {
            assert_eq!(slot.load(AtomicOrdering::SeqCst), 1);
        }
    }

    #[test]
    fn caller_panic_does_not_deadlock_pool_or_break_subsequent_calls() {
        let pool: &'static SearchPool = Box::leak(Box::new(SearchPool {
            dispatch_lock: Mutex::new(()),
            shared: Mutex::new(PoolState {
                epoch: 0,
                job: std::ptr::null(),
                shutdown: false,
            }),
            wake_cvar: Condvar::new(),
            worker_count: AtomicUsize::new(0),
        }));
        let worker_handle = std::thread::Builder::new()
            .name("tuff-arena-search-test".into())
            .spawn(move || pool_worker_loop(pool))
            .expect("spawn test worker");
        pool.worker_count.store(1, AtomicOrdering::Release);

        let panic_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            pool.scope_chunks(4, &|_idx| {
                panic!("simulated chunk panic");
            });
        }));
        assert!(panic_result.is_err());
        // The caller panic poisoned dispatch_lock; recovery must still dispatch in parallel.
        assert!(pool.dispatch_lock.is_poisoned());

        let caller_tid = std::thread::current().id();
        let barrier = std::sync::Barrier::new(2);
        let used_worker = AtomicUsize::new(0);
        let visited = (0..2).map(|_| AtomicUsize::new(0)).collect::<Vec<_>>();
        pool.scope_chunks(2, &|idx| {
            visited[idx].fetch_add(1, AtomicOrdering::SeqCst);
            if std::thread::current().id() != caller_tid {
                used_worker.fetch_add(1, AtomicOrdering::SeqCst);
            }
            barrier.wait();
        });
        for slot in &visited {
            assert_eq!(slot.load(AtomicOrdering::SeqCst), 1);
        }
        assert_eq!(used_worker.load(AtomicOrdering::SeqCst), 1);

        {
            let mut state = pool.shared.lock().unwrap_or_else(|e| e.into_inner());
            state.shutdown = true;
            pool.wake_cvar.notify_all();
        }
        worker_handle.join().expect("join test worker");
    }
}
