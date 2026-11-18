//! A local logout/background/disable invalidates work already waiting on I/O.
use hm_runtime::platform::{
    CloudIdentity, DriverError, DriverResult, HostDriver, ReplicaIdentity, SyncDriver, SyncHead,
    SyncSession, SyncSupport,
};
use std::{
    io::{self, Read},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
#[derive(Clone, Default)]
pub struct SyncEpoch(Arc<AtomicU64>);
impl SyncEpoch {
    pub fn current(&self) -> u64 {
        self.0.load(Ordering::Acquire)
    }
    pub fn invalidate(&self) {
        self.0.fetch_add(1, Ordering::AcqRel);
    }
    pub fn check(&self, expected: u64) -> DriverResult<()> {
        if self.current() == expected {
            Ok(())
        } else {
            Err(DriverError::invalid_state("sync_interrupted"))
        }
    }
    pub fn guard(&self, driver: Arc<dyn SyncDriver>) -> Box<dyn SyncDriver> {
        Box::new(GuardedDriver {
            driver,
            lease: Lease {
                epoch: self.clone(),
                expected: self.current(),
                activity: None,
            },
        })
    }
}
/// Common lifecycle policy; only the host driver knows platform APIs. Refresh
/// outside business locks: a native probe may need the UI thread to answer.
#[derive(Clone)]
pub struct SyncActivity {
    epoch: SyncEpoch,
    foreground: Arc<AtomicBool>,
    host: Arc<dyn HostDriver>,
    probe: Arc<Mutex<()>>,
}
impl SyncActivity {
    pub fn new(host: Arc<dyn HostDriver>) -> Self {
        Self {
            epoch: SyncEpoch::default(),
            foreground: Arc::new(AtomicBool::new(true)),
            host,
            probe: Arc::new(Mutex::new(())),
        }
    }
    pub fn current(&self) -> u64 {
        self.epoch.current()
    }
    pub fn invalidate(&self) {
        self.epoch.invalidate();
    }
    pub fn refresh(&self, hint: Option<bool>) -> DriverResult<bool> {
        let _probe = self
            .probe
            .lock()
            .map_err(|_| DriverError::invalid_state("host_state_failed"))?;
        let foreground = self
            .host
            .foreground()?
            .or(hint)
            .unwrap_or_else(|| self.foreground.load(Ordering::Acquire));
        if self.foreground.swap(foreground, Ordering::AcqRel) && !foreground {
            self.invalidate();
        }
        Ok(foreground)
    }
    /// Cached check is safe while holding a business/preferences lock.
    pub fn check(&self, expected: u64) -> DriverResult<()> {
        self.epoch.check(expected)?;
        if !self.foreground.load(Ordering::Acquire) {
            return Err(DriverError::invalid_state("sync_interrupted"));
        }
        Ok(())
    }
    pub fn guard(&self, driver: Arc<dyn SyncDriver>, expected: u64) -> Box<dyn SyncDriver> {
        Box::new(GuardedDriver {
            driver,
            lease: Lease {
                epoch: self.epoch.clone(),
                expected,
                activity: Some(self.clone()),
            },
        })
    }
}
#[derive(Clone)]
struct Lease {
    epoch: SyncEpoch,
    expected: u64,
    activity: Option<SyncActivity>,
}
impl Lease {
    fn check(&self) -> DriverResult<()> {
        self.epoch.check(self.expected)?;
        if let Some(activity) = &self.activity {
            activity.refresh(None)?;
            activity.check(self.expected)?;
        }
        Ok(())
    }
}
struct GuardedDriver {
    driver: Arc<dyn SyncDriver>,
    lease: Lease,
}
impl SyncDriver for GuardedDriver {
    fn provider(&self) -> Option<&'static str> {
        self.driver.provider()
    }
    fn support(&self) -> DriverResult<SyncSupport> {
        self.driver.support()
    }
    fn storage_account(&self) -> DriverResult<CloudIdentity> {
        self.lease.check()?;
        let account = self.driver.storage_account()?;
        self.lease.check()?;
        Ok(account)
    }
    fn open(&self, identity: &ReplicaIdentity) -> DriverResult<Box<dyn SyncSession>> {
        self.lease.check()?;
        let session = self.driver.open(identity)?;
        self.lease.check()?;
        Ok(Box::new(GuardedSession {
            session,
            lease: self.lease.clone(),
        }))
    }
}
struct GuardedReader<T> {
    source: T,
    lease: Lease,
}
impl<T: Read> Read for GuardedReader<T> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        // `copy` and `read_to_end` retry Interrupted. Cancellation is terminal.
        if self.lease.epoch.current() != self.lease.expected {
            return Err(io::Error::new(
                io::ErrorKind::ConnectionAborted,
                "sync_interrupted",
            ));
        }
        self.source.read(buf)
    }
}
struct GuardedSession {
    session: Box<dyn SyncSession>,
    lease: Lease,
}
impl SyncSession for GuardedSession {
    fn identity(&self) -> &ReplicaIdentity {
        self.session.identity()
    }
    fn head(&mut self) -> DriverResult<Option<SyncHead>> {
        self.lease.check()?;
        let result = self.session.head()?;
        self.lease.check()?;
        Ok(result)
    }
    fn has_blob(&mut self, digest: &str) -> DriverResult<bool> {
        self.lease.check()?;
        let result = self.session.has_blob(digest)?;
        self.lease.check()?;
        Ok(result)
    }
    fn put_blob(&mut self, digest: &str, source: &mut dyn Read) -> DriverResult<u64> {
        self.lease.check()?;
        let result = self.session.put_blob(
            digest,
            &mut GuardedReader {
                source,
                lease: self.lease.clone(),
            },
        )?;
        self.lease.check()?;
        Ok(result)
    }
    fn get_blob(&mut self, digest: &str) -> DriverResult<Box<dyn Read>> {
        self.lease.check()?;
        let source = self.session.get_blob(digest)?;
        self.lease.check()?;
        Ok(Box::new(GuardedReader {
            source,
            lease: self.lease.clone(),
        }))
    }
    fn publish(
        &mut self,
        expected: Option<&SyncHead>,
        revision: &str,
    ) -> DriverResult<Option<SyncHead>> {
        self.lease.check()?;
        let result = self.session.publish(expected, revision)?;
        self.lease.check()?;
        Ok(result)
    }
}
