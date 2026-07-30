use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

use tokio::sync::Notify;

use crate::model::CancelReason;

const REASON_NONE: u8 = 0;
const REASON_CALLER: u8 = 1;
const REASON_CONSUMER_CLOSED: u8 = 2;
const REASON_DEADLINE: u8 = 3;
const REASON_DISPOSE: u8 = 4;

#[derive(Debug)]
struct CancellationState {
    cancelled: AtomicBool,
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
                cancelled: AtomicBool::new(false),
                reason: AtomicU8::new(REASON_NONE),
                notify: Notify::new(),
            }),
        }
    }

    pub fn cancel(&self, reason: CancelReason) -> bool {
        if self
            .state
            .cancelled
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return false;
        }
        self.state
            .reason
            .store(reason_to_u8(reason), Ordering::Release);
        self.state.notify.notify_waiters();
        true
    }

    pub fn is_cancelled(&self) -> bool {
        self.state.cancelled.load(Ordering::Acquire)
    }

    pub fn reason(&self) -> Option<CancelReason> {
        if !self.is_cancelled() {
            return None;
        }
        u8_to_reason(self.state.reason.load(Ordering::Acquire))
    }

    pub async fn cancelled(&self) -> CancelReason {
        loop {
            if let Some(reason) = self.reason() {
                return reason;
            }
            self.state.notify.notified().await;
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
}
