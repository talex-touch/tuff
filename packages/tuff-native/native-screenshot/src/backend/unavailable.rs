use crate::backend::{BackendPlatform, BackendSupport, ScreenshotBackend};

pub struct UnavailableBackend {
    support: BackendSupport,
}

impl UnavailableBackend {
    pub fn current() -> Self {
        let platform = current_platform();
        let support = if std::env::var_os("TUFF_DISABLE_NATIVE_SCREENSHOT").as_deref()
            == Some(std::ffi::OsStr::new("1"))
        {
            BackendSupport::disabled(platform)
        } else {
            match platform {
                BackendPlatform::Macos => BackendSupport::unavailable(
                    BackendPlatform::Macos,
                    Some("screen-capture-kit"),
                    "backend-not-built",
                ),
                BackendPlatform::Windows => BackendSupport::unavailable(
                    BackendPlatform::Windows,
                    Some("xcap"),
                    "backend-not-built",
                ),
                BackendPlatform::Linux => BackendSupport::unavailable(
                    BackendPlatform::Linux,
                    Some("xcap"),
                    "backend-not-built",
                ),
                BackendPlatform::Other(platform) => BackendSupport::unsupported(platform),
            }
        };
        Self { support }
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    pub fn xcap_initialization_failed(platform: BackendPlatform, reason: &'static str) -> Self {
        Self {
            support: BackendSupport::unavailable(platform, Some("xcap"), reason),
        }
    }

    #[cfg(target_os = "macos")]
    pub fn macos_initialization_failed() -> Self {
        Self {
            support: BackendSupport::unavailable(
                BackendPlatform::Macos,
                Some("screen-capture-kit"),
                "backend-initialization-failed",
            ),
        }
    }
}

impl ScreenshotBackend for UnavailableBackend {
    fn support(&self) -> BackendSupport {
        self.support.clone()
    }
}

fn current_platform() -> BackendPlatform {
    match std::env::consts::OS {
        "macos" => BackendPlatform::Macos,
        "windows" => BackendPlatform::Windows,
        "linux" => BackendPlatform::Linux,
        platform => BackendPlatform::Other(platform.to_string()),
    }
}
