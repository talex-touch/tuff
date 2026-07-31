use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::Notify;

use crate::error::ProtocolError;
use crate::model::CancelReason;
use crate::{CancellationToken, MAX_SAFE_SEQUENCE};

#[derive(Debug)]
struct CreditInner {
    effective_window: u64,
    last_published_sequence: u64,
    last_ack_sequence: u64,
    terminal: bool,
    fault: Option<ProtocolError>,
}

#[derive(Debug, Clone)]
pub struct StreamCreditState {
    inner: Arc<Mutex<CreditInner>>,
    notify: Arc<Notify>,
    cancellation: CancellationToken,
}

impl StreamCreditState {
    pub fn new(effective_window: u32) -> Result<Self, ProtocolError> {
        if effective_window == 0 || effective_window > crate::HARD_MAX_STREAM_WINDOW {
            return Err(ProtocolError::invalid_argument());
        }
        Ok(Self {
            inner: Arc::new(Mutex::new(CreditInner {
                effective_window: u64::from(effective_window),
                last_published_sequence: 0,
                last_ack_sequence: 0,
                terminal: false,
                fault: None,
            })),
            notify: Arc::new(Notify::new()),
            cancellation: CancellationToken::new(),
        })
    }

    pub fn effective_window(&self) -> u32 {
        lock(&self.inner).effective_window as u32
    }

    pub fn cancellation(&self) -> CancellationToken {
        self.cancellation.clone()
    }

    pub async fn reserve_data_sequence(&self) -> Result<u64, ProtocolError> {
        loop {
            let notified = self.notify.notified();
            {
                let mut inner = lock(&self.inner);
                if let Some(error) = &inner.fault {
                    return Err(error.clone());
                }
                if inner.terminal {
                    return Err(ProtocolError::protocol_violation());
                }
                if let Some(reason) = self.cancellation.reason() {
                    return Err(error_for_cancel(reason));
                }
                let in_flight = inner
                    .last_published_sequence
                    .checked_sub(inner.last_ack_sequence)
                    .ok_or_else(ProtocolError::protocol_violation)?;
                if in_flight < inner.effective_window {
                    let next = inner
                        .last_published_sequence
                        .checked_add(1)
                        .filter(|sequence| *sequence < MAX_SAFE_SEQUENCE)
                        .ok_or_else(ProtocolError::resource_exhausted)?;
                    inner.last_published_sequence = next;
                    return Ok(next);
                }
            }
            notified.await;
        }
    }

    pub fn acknowledge(&self, ack_sequence: u64) -> Result<u64, ProtocolError> {
        let mut inner = lock(&self.inner);
        if let Some(error) = &inner.fault {
            return Err(error.clone());
        }
        if ack_sequence == inner.last_ack_sequence {
            return Ok(0);
        }
        if ack_sequence < inner.last_ack_sequence
            || ack_sequence > inner.last_published_sequence
            || ack_sequence > MAX_SAFE_SEQUENCE
        {
            return Err(ProtocolError::protocol_violation());
        }
        let delta = ack_sequence
            .checked_sub(inner.last_ack_sequence)
            .ok_or_else(ProtocolError::protocol_violation)?;
        inner.last_ack_sequence = ack_sequence;
        let in_flight = inner
            .last_published_sequence
            .checked_sub(inner.last_ack_sequence)
            .ok_or_else(ProtocolError::protocol_violation)?;
        if in_flight > inner.effective_window {
            return Err(ProtocolError::protocol_violation());
        }
        drop(inner);
        self.notify.notify_waiters();
        Ok(delta)
    }

    pub fn reserve_terminal_sequence(&self) -> Result<u64, ProtocolError> {
        let mut inner = lock(&self.inner);
        if let Some(error) = &inner.fault {
            return Err(error.clone());
        }
        if inner.terminal {
            return Err(ProtocolError::protocol_violation());
        }
        let sequence = inner
            .last_published_sequence
            .checked_add(1)
            .filter(|sequence| *sequence <= MAX_SAFE_SEQUENCE)
            .ok_or_else(ProtocolError::resource_exhausted)?;
        inner.terminal = true;
        drop(inner);
        self.notify.notify_waiters();
        Ok(sequence)
    }

    pub fn cancel(&self, reason: CancelReason) -> bool {
        let cancelled = self.cancellation.cancel(reason);
        if cancelled {
            self.notify.notify_waiters();
        }
        cancelled
    }

    pub fn mark_backpressure_fault(&self) -> bool {
        let mut inner = lock(&self.inner);
        if inner.fault.is_some() || inner.terminal {
            return false;
        }
        inner.fault = Some(ProtocolError::backpressure_broken());
        drop(inner);
        self.cancellation.cancel(CancelReason::Caller);
        self.notify.notify_waiters();
        true
    }

    pub fn fault(&self) -> Option<ProtocolError> {
        lock(&self.inner).fault.clone()
    }

    pub fn snapshot(&self) -> StreamCreditSnapshot {
        let inner = lock(&self.inner);
        StreamCreditSnapshot {
            effective_window: inner.effective_window,
            last_published_sequence: inner.last_published_sequence,
            last_ack_sequence: inner.last_ack_sequence,
            terminal: inner.terminal,
            faulted: inner.fault.is_some(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamCreditSnapshot {
    pub effective_window: u64,
    pub last_published_sequence: u64,
    pub last_ack_sequence: u64,
    pub terminal: bool,
    pub faulted: bool,
}

fn error_for_cancel(reason: CancelReason) -> ProtocolError {
    match reason {
        CancelReason::Deadline => ProtocolError::deadline_exceeded(),
        CancelReason::Caller | CancelReason::ConsumerClosed | CancelReason::Dispose => {
            ProtocolError::cancelled()
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    #[tokio::test]
    async fn producer_stalls_at_window_and_ack_wakes_it() {
        let state = StreamCreditState::new(2).expect("state");
        assert_eq!(state.reserve_data_sequence().await.expect("first"), 1);
        assert_eq!(state.reserve_data_sequence().await.expect("second"), 2);

        let blocked = state.clone();
        let task = tokio::spawn(async move { blocked.reserve_data_sequence().await });
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!task.is_finished());

        assert_eq!(state.acknowledge(1).expect("ack"), 1);
        assert_eq!(task.await.expect("task").expect("third"), 3);
        assert_eq!(
            state.snapshot(),
            StreamCreditSnapshot {
                effective_window: 2,
                last_published_sequence: 3,
                last_ack_sequence: 1,
                terminal: false,
                faulted: false,
            },
        );
    }

    #[tokio::test]
    async fn duplicate_ack_is_idempotent_and_invalid_ack_fails() {
        let state = StreamCreditState::new(1).expect("state");
        state.reserve_data_sequence().await.expect("first");
        assert_eq!(state.acknowledge(1).expect("ack"), 1);
        assert_eq!(state.acknowledge(1).expect("duplicate"), 0);
        assert_eq!(
            state.acknowledge(0).expect_err("regression").code,
            "NATIVE_PROTOCOL_VIOLATION",
        );
        assert_eq!(
            state.acknowledge(2).expect_err("ahead").code,
            "NATIVE_PROTOCOL_VIOLATION",
        );
    }

    #[tokio::test]
    async fn cancel_wakes_a_zero_credit_producer() {
        let state = StreamCreditState::new(1).expect("state");
        state.reserve_data_sequence().await.expect("first");
        let blocked = state.clone();
        let task = tokio::spawn(async move { blocked.reserve_data_sequence().await });
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(state.cancel(CancelReason::Deadline));
        assert_eq!(
            task.await.expect("task").expect_err("cancelled").code,
            "DEADLINE_EXCEEDED",
        );
    }

    #[tokio::test]
    async fn backpressure_fault_is_sticky_and_never_publishes_again() {
        let state = StreamCreditState::new(1).expect("state");
        assert!(state.mark_backpressure_fault());
        assert!(!state.mark_backpressure_fault());
        assert_eq!(
            state.reserve_data_sequence().await.expect_err("fault").code,
            "NATIVE_BACKPRESSURE_BROKEN",
        );
        assert_eq!(
            state.acknowledge(0).expect_err("ack sees fault").code,
            "NATIVE_BACKPRESSURE_BROKEN",
        );
    }

    #[tokio::test]
    async fn terminal_sequence_is_single_and_follows_last_data() {
        let state = StreamCreditState::new(2).expect("state");
        state.reserve_data_sequence().await.expect("first");
        assert_eq!(state.reserve_terminal_sequence().expect("terminal"), 2);
        assert_eq!(
            state
                .reserve_terminal_sequence()
                .expect_err("single terminal")
                .code,
            "NATIVE_PROTOCOL_VIOLATION",
        );
    }
}
