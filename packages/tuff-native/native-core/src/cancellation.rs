use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};

use tokio::sync::Notify;

use crate::model::CancelReason;

const REASON_NONE: u8 = 0;
const REASON_CALLER: u8 = 1;
const REASON_CONSUMER_CLOSED: u8 = 2;
const REASON_DEADLINE: u8 = 3;
const REASON_DISPOSE: u8 = 4;

/// State and reason in one atomic.
///
/// They used to be an `AtomicBool` plus an `AtomicU8`, set in that order, so a reader could observe
/// `cancelled == true` while `reason` was still `REASON_NONE` — and `reason()` maps that to `None`,
/// which reads as "not cancelled". One cell cannot be half-written (#840).
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

    /// Elects one winner and publishes its reason in the same store.
    pub fn cancel(&self, reason: CancelReason) -> bool {
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

    /// Resolves once cancelled, including when the cancel lands mid-registration.
    ///
    /// The `Notified` is created and `enable()`d *before* the state is read. `notify_waiters()`
    /// only wakes futures already registered, and `cancel()` fires exactly once, so the previous
    /// order — read, then register — dropped any cancel landing in that window and parked the
    /// waiter forever. An idle `frames` stream torn down by `begin_dispose` never terminated, and
    /// `finish_dispose` returned NATIVE_DISPOSE_TIMEOUT with the entry left in the runtime (#840).
    pub async fn cancelled(&self) -> CancelReason {
        loop {
            let notified = self.state.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();

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

    /// A cancel delivered to an already-waiting task completes it.
    ///
    /// The ordinary path, kept as a cheap control alongside the hammered race test below.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn cancel_wakes_a_task_already_waiting() {
        for _ in 0..256 {
            let token = CancellationToken::new();
            let waiter = token.clone();
            let task = tokio::spawn(async move { waiter.cancelled().await });
            tokio::task::yield_now().await;
            token.cancel(CancelReason::Dispose);

            let reason = tokio::time::timeout(std::time::Duration::from_secs(5), task)
                .await
                .expect("waiter must not park after a cancel")
                .expect("waiter completes");
            assert_eq!(reason, CancelReason::Dispose);
        }
    }

    /// A cancelled token always reports a reason.
    ///
    /// `cancelled` and `reason` used to be two atomics written in that order, so a reader could
    /// catch `is_cancelled() == true` with `reason == REASON_NONE` — which `reason()` maps to
    /// `None`, i.e. indistinguishable from "not cancelled". They are one cell now, so the pair
    /// cannot be observed half-written.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn cancelled_state_and_reason_are_never_observed_apart() {
        for _ in 0..2_000 {
            let token = CancellationToken::new();
            let reader = token.clone();
            let observer = tokio::spawn(async move {
                loop {
                    if reader.is_cancelled() {
                        return reader.reason();
                    }
                    tokio::task::yield_now().await;
                }
            });

            token.cancel(CancelReason::Caller);
            assert_eq!(
                observer.await.expect("observer completes"),
                Some(CancelReason::Caller),
                "is_cancelled() was true while reason() said None",
            );
        }
    }

    #[tokio::test]
    async fn a_waiter_starting_after_cancel_returns_immediately() {
        // Positive control for the two races above: they are also satisfied by a token that
        // resolves `cancelled()` unconditionally.
        let token = CancellationToken::new();
        assert!(token.cancel(CancelReason::ConsumerClosed));

        assert_eq!(token.cancelled().await, CancelReason::ConsumerClosed);
        assert!(token.is_cancelled());
    }

    /// A cancel racing a waiter's registration must not be lost.
    ///
    /// The defect (#840): `cancelled()` read the state and only then built the `Notified`.
    /// `notify_waiters()` reaches only already-registered futures and `cancel()` fires exactly
    /// once, so a cancel landing in that window was dropped and the waiter parked forever.
    ///
    /// Reaching a window a few instructions wide needs the load. Measured against the defect
    /// deliberately restored: eight waiters per iteration over 20k iterations detects it on every
    /// run; **one** waiter per iteration misses roughly one run in six. The eight-way concurrency
    /// is load-bearing, not decorative — my first attempt at this test used a single waiter and
    /// 2,000 iterations and never failed, which is how a guard ends up unable to catch its own
    /// defect.
    ///
    /// The barrier is what lines the two sides up: waiters and canceller are released together,
    /// so the cancel lands while the waiters are registering rather than long before or after.
    /// The timeout turns a parked waiter into a failure instead of a hung suite.
    #[tokio::test(flavor = "multi_thread", worker_threads = 8)]
    async fn a_cancel_racing_registration_is_never_lost() {
        const WAITERS: usize = 8;
        const ITERATIONS: usize = 60_000;

        for _ in 0..ITERATIONS {
            let token = CancellationToken::new();
            let gate = Arc::new(tokio::sync::Barrier::new(WAITERS + 1));

            let waiters = (0..WAITERS)
                .map(|_| {
                    let token = token.clone();
                    let gate = Arc::clone(&gate);
                    tokio::spawn(async move {
                        gate.wait().await;
                        token.cancelled().await
                    })
                })
                .collect::<Vec<_>>();

            let canceller = {
                let token = token.clone();
                let gate = Arc::clone(&gate);
                tokio::spawn(async move {
                    gate.wait().await;
                    token.cancel(CancelReason::Dispose);
                })
            };
            canceller.await.expect("canceller completes");

            for waiter in waiters {
                let reason = tokio::time::timeout(std::time::Duration::from_secs(5), waiter)
                    .await
                    .expect("a waiter parked after the cancel")
                    .expect("waiter completes");
                assert_eq!(reason, CancelReason::Dispose);
            }
        }
    }

    #[tokio::test]
    async fn an_uncancelled_token_does_not_resolve() {
        // The other half of that control: `cancelled()` must actually wait.
        let token = CancellationToken::new();
        let waiter = token.clone();
        let task = tokio::spawn(async move { waiter.cancelled().await });

        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), task)
                .await
                .is_err(),
            "cancelled() resolved without a cancel",
        );
    }

    /// #1541: the tests above cover the paths around the #840 window -- an already-parked
    /// waiter, a waiter starting after the cancel, an uncancelled token, the reason/flag
    /// pair -- but none of them races a cancel against a waiter's registration, which is
    /// the defect itself. Restoring the pre-fix ordering left all five green on 3 of 3
    /// runs.
    ///
    /// This hammers the window: a barrier releases eight waiters and the canceller
    /// together so they all race the same cancel, and the timeout turns a parked waiter
    /// into a failure rather than a hung suite. Calibrated against the defect deliberately
    /// restored: 6 of 6 runs caught it, latest at iteration 4268, so the 20k bound carries
    /// roughly a 5x margin. One waiter per iteration missed on one run in six, so the
    /// eight-way concurrency is load-bearing rather than decorative.
    #[tokio::test(flavor = "multi_thread", worker_threads = 8)]
    async fn a_cancel_racing_a_waiters_registration_is_not_lost() {
        const WAITERS: usize = 8;

        for iteration in 0..20_000u32 {
            let token = CancellationToken::new();
            let barrier = Arc::new(std::sync::Barrier::new(WAITERS + 1));
            let tasks = (0..WAITERS)
                .map(|_| {
                    let waiter = token.clone();
                    let released = Arc::clone(&barrier);
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
}
