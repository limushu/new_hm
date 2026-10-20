use std::{
    io,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

/// Coalesces overlapping native and WebView resume events without queuing work.
#[derive(Default)]
pub struct ActivityGate(Arc<AtomicBool>);

pub struct ActivityPermit(Arc<AtomicBool>);

impl ActivityGate {
    pub fn try_enter(&self) -> Option<ActivityPermit> {
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| ActivityPermit(Arc::clone(&self.0)))
    }
}

impl Drop for ActivityPermit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Default)]
struct StopSignal {
    stopped: Mutex<bool>,
    changed: Condvar,
}

impl StopSignal {
    fn wait(&self, delay: Duration) -> bool {
        let stopped = self.stopped.lock().unwrap_or_else(|e| e.into_inner());
        let (stopped, _) = self
            .changed
            .wait_timeout_while(stopped, delay, |stopped| !*stopped)
            .unwrap_or_else(|e| e.into_inner());
        !*stopped
    }
}

/// Owns periodic workers for one application lifetime. Shutdown wakes waiting workers;
/// an action already in progress may finish. The UI thread never waits for network I/O.
#[derive(Default)]
pub struct WorkerScope {
    signal: Arc<StopSignal>,
}

impl WorkerScope {
    pub fn spawn_periodic(
        &self,
        initial_delay: Duration,
        interval: Duration,
        mut action: impl FnMut() + Send + 'static,
    ) -> io::Result<JoinHandle<()>> {
        if interval.is_zero() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "periodic interval must be positive",
            ));
        }
        let signal = Arc::clone(&self.signal);
        thread::Builder::new()
            .name("hm-subsystem".into())
            .spawn(move || {
                if !signal.wait(initial_delay) {
                    return;
                }
                loop {
                    action();
                    if !signal.wait(interval) {
                        return;
                    }
                }
            })
    }

    pub fn stop(&self) {
        *self
            .signal
            .stopped
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = true;
        self.signal.changed.notify_all();
    }
}

impl Drop for WorkerScope {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn overlapping_resume_events_are_coalesced_and_next_resume_can_retry() {
        let gate = ActivityGate::default();
        let first = gate.try_enter().unwrap();
        assert!(gate.try_enter().is_none());
        drop(first);
        let retry = gate.try_enter().unwrap();
        assert!(gate.try_enter().is_none());
        drop(retry);
        assert!(gate.try_enter().is_some());
    }

    #[test]
    fn stop_cancels_initial_delay_and_drop_is_idempotent() {
        let scope = WorkerScope::default();
        let worker = scope
            .spawn_periodic(Duration::from_secs(3600), Duration::from_secs(3600), || {
                panic!("a stopped subsystem must not start")
            })
            .unwrap();
        scope.stop();
        scope.stop();
        drop(scope);
        worker.join().unwrap();
    }

    #[test]
    fn stop_allows_inflight_work_to_finish_without_starting_another_tick() {
        let scope = WorkerScope::default();
        let (started, received) = mpsc::channel();
        let (release, wait) = mpsc::channel();
        let worker = scope
            .spawn_periodic(Duration::ZERO, Duration::from_secs(3600), move || {
                started.send(()).unwrap();
                wait.recv().unwrap();
            })
            .unwrap();
        received.recv_timeout(Duration::from_secs(5)).unwrap();
        scope.stop();
        release.send(()).unwrap();
        worker.join().unwrap();
        assert!(received.try_recv().is_err());
    }

    #[test]
    fn dropping_scope_stops_waiting_workers() {
        let scope = WorkerScope::default();
        let worker = scope
            .spawn_periodic(Duration::from_secs(3600), Duration::from_secs(60), || {
                panic!("dropped owner must cancel work")
            })
            .unwrap();
        drop(scope);
        worker.join().unwrap();
    }

    #[test]
    fn zero_interval_is_rejected_instead_of_busy_looping() {
        let scope = WorkerScope::default();
        assert!(scope
            .spawn_periodic(Duration::ZERO, Duration::ZERO, || {})
            .is_err());
    }
}
