use std::sync::{Arc, OnceLock};

use napi::bindgen_prelude::{Buffer, Function, PromiseRaw};
use napi::{Env, Result};
use napi_derive::napi;
use tuff_native_core::{CapabilityRegistry, NativeRuntime, ProtocolLimits, RuntimeDescriptor};
use tuff_native_napi::{NapiPacket, NapiRuntimeAdapter};

#[cfg(feature = "protocol-test-backend")]
use crate::backend::test_backend::DeterministicBackend;
use crate::capability::ScreenshotCapability;

pub mod backend;
pub mod capability;
pub mod compose;
pub mod error;
pub mod geometry;
pub mod limits;
pub mod model;
pub mod region_plan;
pub mod window_candidates;

#[cfg(test)]
mod backend_contract_tests;
#[cfg(test)]
mod capability_contract_tests;
#[cfg(test)]
mod geometry_contract_tests;
#[cfg(all(test, target_os = "macos"))]
mod macos_contract_tests;
#[cfg(test)]
mod region_plan_contract_tests;
#[cfg(test)]
mod stream_contract_tests;
#[cfg(test)]
mod test_fixtures;
#[cfg(test)]
mod window_candidates_contract_tests;

static ADAPTER: OnceLock<NapiRuntimeAdapter> = OnceLock::new();

fn adapter() -> &'static NapiRuntimeAdapter {
    ADAPTER.get_or_init(|| {
        let runtime = NativeRuntime::new(protocol_registry(), ProtocolLimits::default());
        NapiRuntimeAdapter::new(
            runtime,
            RuntimeDescriptor {
                addon_id: "tuff-native-screenshot".to_string(),
                addon_version: env!("CARGO_PKG_VERSION").to_string(),
                target: format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
                platform: std::env::consts::OS.to_string(),
                arch: std::env::consts::ARCH.to_string(),
                build_profile: if cfg!(debug_assertions) {
                    "debug".to_string()
                } else {
                    "release".to_string()
                },
            },
        )
    })
}

fn protocol_registry() -> CapabilityRegistry {
    let limits = crate::limits::ScreenshotLimits::default();
    #[cfg(feature = "protocol-test-backend")]
    let backend: Arc<dyn crate::backend::ScreenshotBackend> = Arc::new(DeterministicBackend::new());
    #[cfg(not(feature = "protocol-test-backend"))]
    let backend = crate::backend::platform_backend(limits);
    let capability = Arc::new(ScreenshotCapability::new(backend, limits));
    let mut registry = CapabilityRegistry::new();
    capability
        .register_handlers(&mut registry)
        .expect("screenshot capability must register");
    registry
}

#[napi(js_name = "nativeProtocolV1Handshake")]
pub fn native_protocol_v1_handshake(env: Env, control: String) -> Result<String> {
    adapter().handshake(&env, control)
}

#[napi(js_name = "nativeProtocolV1Invoke")]
pub fn native_protocol_v1_invoke<'env>(
    env: &'env Env,
    control: String,
    attachments: Vec<Buffer>,
) -> Result<PromiseRaw<'env, NapiPacket>> {
    adapter().invoke(env, control, attachments)
}

#[napi(js_name = "nativeProtocolV1OpenStream")]
pub fn native_protocol_v1_open_stream(
    env: Env,
    control: String,
    attachments: Vec<Buffer>,
    on_frame: Function<'_, NapiPacket, ()>,
) -> Result<NapiPacket> {
    adapter().open_stream(&env, control, attachments, on_frame)
}

#[napi(js_name = "nativeProtocolV1Ack")]
pub fn native_protocol_v1_ack(env: Env, control: String) -> Result<()> {
    adapter().acknowledge(&env, control)
}

#[napi(js_name = "nativeProtocolV1Cancel")]
pub fn native_protocol_v1_cancel(env: Env, control: String) -> Result<()> {
    adapter().cancel(&env, control)
}

#[napi(js_name = "nativeProtocolV1Dispose")]
pub fn native_protocol_v1_dispose<'env>(env: &'env Env) -> Result<PromiseRaw<'env, ()>> {
    adapter().dispose(env)
}

#[cfg(test)]
#[unsafe(no_mangle)]
extern "C" fn napi_delete_reference(
    _env: napi::sys::napi_env,
    _ref: napi::sys::napi_ref,
) -> napi::sys::napi_status {
    napi::Status::Ok as napi::sys::napi_status
}

#[cfg(test)]
#[unsafe(no_mangle)]
extern "C" fn napi_reference_unref(
    _env: napi::sys::napi_env,
    _ref: napi::sys::napi_ref,
    result: *mut u32,
) -> napi::sys::napi_status {
    if !result.is_null() {
        unsafe {
            *result = 0;
        }
    }
    napi::Status::Ok as napi::sys::napi_status
}
