use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};

use tokio::sync::Notify;

use crate::model::CancelReason;

const REASON_NONE: u8 = 0;
const REASON_CALLER: u8 = 1;
const REASON_CONSUMER_CLOSED: u8 = 2;
const REASON_DEADLINE: u8 = 3;
const REASON_DISPOSE: u8 = 4;

/// `reason` doubles as the cancelled flag: `REASON_NONE` means live. Keeping them in
/// one atomic is what makes "cancelled" and "which reason" indivisible -- with a
/// separate bool, a reader could see the flag set while the reason was still
/// `REASON_NONE` and report `None` from an already-cancelled token.
#[derive(Debug)]
struct CancellationState {
    reason: AtomicU8,
    notify: Notify,
}

#[derive(Debug, Clone)]
pub struct CancellationToken {
    state: Arc<CancellationState>,
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::new()
    }
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            state: Arc::new(CancellationState {
                reason: AtomicU8::new(REASON_NONE),
                notify: Notify::new(),
            }),
        }
    }

    pub fn cancel(&self, reason: CancelReason) -> bool {
        // One compare-exchange publishes the reason and the cancelled state together,
        // so no reader can land between them.
        if self
            .state
            .reason
            .compare_exchange(
                REASON_NONE,
                reason_to_u8(reason),
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_err()
        {
            return false;
        }
        self.state.notify.notify_waiters();
        true
    }

    pub fn is_cancelled(&self) -> bool {
        self.state.reason.load(Ordering::Acquire) != REASON_NONE
    }

    pub fn reason(&self) -> Option<CancelReason> {
        u8_to_reason(self.state.reason.load(Ordering::Acquire))
    }

    pub async fn cancelled(&self) -> CancelReason {
        loop {
            // Built before the state is read, not after. `Notified` snapshots the
            // notify_waiters counter when it is constructed, and `cancel` notifies
            // exactly once -- so a cancel landing between the read and the await is
            // accounted for by this future rather than lost, and it resolves instead
            // of parking forever. Same shape as stream.rs and runtime.rs.
            let notified = self.state.notify.notified();
            if let Some(reason) = self.reason() {
                return reason;
            }
            notified.await;
        }
    }
}

fn reason_to_u8(reason: CancelReason) -> u8 {
    match reason {
        CancelReason::Caller => REASON_CALLER,
        CancelReason::ConsumerClosed => REASON_CONSUMER_CLOSED,
        CancelReason::Deadline => REASON_DEADLINE,
        CancelReason::Dispose => REASON_DISPOSE,
    }
}

fn u8_to_reason(reason: u8) -> Option<CancelReason> {
    match reason {
        REASON_CALLER => Some(CancelReason::Caller),
        REASON_CONSUMER_CLOSED => Some(CancelReason::ConsumerClosed),
        REASON_DEADLINE => Some(CancelReason::Deadline),
        REASON_DISPOSE => Some(CancelReason::Dispose),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    #[tokio::test]
    async fn first_cancel_reason_wins_and_wakes_waiters() {
        let token = CancellationToken::new();
        let waiter = token.clone();
        let task = tokio::spawn(async move { waiter.cancelled().await });

        assert!(token.cancel(CancelReason::Deadline));
        assert!(!token.cancel(CancelReason::Caller));
        assert_eq!(
            task.await.expect("waiter completes"),
            CancelReason::Deadline
        );
        assert_eq!(token.reason(), Some(CancelReason::Deadline));
    }

    /// #840: the wait loop read the state first and only then built its `Notified`.
    /// tokio snapshots the notify_waiters counter at construction and `cancel` notifies
    /// exactly once, so a cancel landing in that window was already accounted for and
    /// the waiter parked with no wakeup left to come. `cancelled()` is awaited in
    /// `tokio::select!` arms across the screenshot backend, so a lost cancel there
    /// strands the stream entry in NativeRuntime::streams until dispose times out.
    ///
    /// The window is a few instructions wide, so this hammers it: a barrier releases
    /// eight waiters and the canceller together so they all race the same cancel, and the
    /// timeout turns a parked waiter into a failure rather than a hung suite. Calibrated
    /// against the defect deliberately restored: 6 of 6 runs caught it, latest at
    /// iteration 4268, so the 20k bound carries roughly a 5x margin. One waiter per
    /// iteration was measurably worse -- it missed on one run in six.
    #[tokio::test(flavor = "multi_thread", worker_threads = 8)]
    async fn a_cancel_racing_the_state_read_is_not_lost() {
        const WAITERS: usize = 8;
        for iteration in 0..20_000u32 {
            let token = CancellationToken::new();
            let barrier = Arc::new(std::sync::Barrier::new(WAITERS + 1));
            let tasks = (0..WAITERS)
                .map(|_| {
                    let waiter = token.clone();
                    let released = barrier.clone();
                    tokio::spawn(async move {
                        released.wait();
                        waiter.cancelled().await
                    })
                })
                .collect::<Vec<_>>();

            barrier.wait();
            token.cancel(CancelReason::Dispose);

            for task in tasks {
                let reason = tokio::time::timeout(Duration::from_secs(5), task)
                    .await
                    .unwrap_or_else(|_| panic!("cancelled() parked at iteration {iteration}"))
                    .expect("the waiter task must not panic");
                assert_eq!(reason, CancelReason::Dispose);
            }
        }
    }

    /// The control for the test above: it only requires that `cancelled()` *resolves*, and
    /// a "return immediately" implementation satisfies that too. A live token has to keep
    /// it pending, or the race test would be measuring nothing.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cancelled_stays_pending_while_the_token_is_live() {
        let token = CancellationToken::new();
        let waiter = token.clone();

        assert!(
            tokio::time::timeout(Duration::from_millis(250), waiter.cancelled())
                .await
                .is_err(),
            "cancelled() resolved on a token that was never cancelled"
        );

        token.cancel(CancelReason::Caller);
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(5), token.cancelled())
                .await
                .expect("cancelled() must resolve once the token is cancelled"),
            CancelReason::Caller
        );
    }

    // #840's second half -- `cancel` flipping a separate `cancelled` bool before storing
    // the reason, so a reader could see a cancelled token reporting `None` -- has no test
    // here on purpose. The window is two adjacent stores; a tight-spin observer on its own
    // thread (2,000 rounds x 200,000 loads, against the defect deliberately restored)
    // never landed inside it. The single atomic removes the state rather than narrowing
    // it, which is a construction-level guarantee, not an observable one.
}
