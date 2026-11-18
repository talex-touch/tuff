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
    worker_count: usize,
}

impl SearchPool {
    fn new(worker_count: usize) -> Self {
        Self {
            dispatch_lock: Mutex::new(()),
            shared: Mutex::new(PoolState {
                epoch: 0,
                job: std::ptr::null(),
                shutdown: false,
            }),
            wake_cvar: Condvar::new(),
            worker_count,
        }
    }

    pub(crate) fn init_global() -> &'static SearchPool {
        static POOL: OnceLock<SearchPool> = OnceLock::new();
        static WORKERS_STARTED: OnceLock<()> = OnceLock::new();
        let pool = POOL.get_or_init(|| {
            let total = std::thread::available_parallelism()
                .map(|n| n.get().clamp(2, 4))
                .unwrap_or(2);
            SearchPool::new(total.saturating_sub(1))
        });
        WORKERS_STARTED.get_or_init(|| {
            for _ in 0..pool.worker_count {
                std::thread::Builder::new()
                    .name("tuff-arena-search".into())
                    .spawn(move || pool_worker_loop(pool))
                    .ok();
            }
        });
        pool
    }

    /// Executes `task_fn(chunk_idx)` across `0..num_tasks` using persistent workers + caller.
    /// Falls back to sequential execution on the caller thread if another search holds `dispatch_lock`.
    pub(crate) fn scope_chunks<F>(&self, num_tasks: usize, task_fn: &F)
    where
        F: Fn(usize) + Sync,
    {
        if self.worker_count == 0 || num_tasks <= 1 {
            for i in 0..num_tasks {
                task_fn(i);
            }
            return;
        }

        let Ok(_dispatch_guard) = self.dispatch_lock.try_lock() else {
            for i in 0..num_tasks {
                task_fn(i);
            }
            return;
        };

        unsafe fn trampoline<F: Fn(usize) + Sync>(ptr: *const (), task_idx: usize) {
            let f = unsafe { &*(ptr as *const F) };
            f(task_idx);
        }

        let total_participants = self.worker_count + 1;
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
                    let mut guard = self.packet.done_lock.lock().unwrap();
                    while !*guard {
                        guard = self.packet.done_cvar.wait(guard).unwrap();
                    }
                }
                let mut state = self.pool.shared.lock().unwrap();
                state.job = std::ptr::null();
            }
        }

        {
            let mut state = self.shared.lock().unwrap();
            state.job = &packet as *const JobPacket;
            state.epoch = state.epoch.wrapping_add(1);
            self.wake_cvar.notify_all();
        }
        let _guard = PacketGuard {
            pool: self,
            packet: &packet,
        };

        run_packet_tasks(&packet);
        if packet.active_threads.fetch_sub(1, AtomicOrdering::AcqRel) == 1 {
            let mut done = packet.done_lock.lock().unwrap();
            *done = true;
            packet.done_cvar.notify_all();
        }
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
            let mut state = pool.shared.lock().unwrap();
            while state.epoch == seen_epoch || state.job.is_null() {
                if state.shutdown {
                    return;
                }
                state = pool.wake_cvar.wait(state).unwrap();
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
            let mut done = packet.done_lock.lock().unwrap();
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
}
