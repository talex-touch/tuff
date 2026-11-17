use std::env;
use std::path::PathBuf;

fn main() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing"));
    let native_src = manifest_dir.join("..").join("native").join("src");
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    let common_header = native_src.join("common").join("ocr_types.h");
    let c_api_header = native_src.join("common").join("ocr_c_api.h");
    let c_api_src = native_src.join("common").join("ocr_c_api.cpp");

    println!("cargo:rerun-if-changed={}", common_header.display());
    println!("cargo:rerun-if-changed={}", c_api_header.display());
    println!("cargo:rerun-if-changed={}", c_api_src.display());

    let platform_src = match target_os.as_str() {
        "macos" => native_src
            .join("platform")
            .join("macos")
            .join("vision_ocr.mm"),
        "windows" => native_src
            .join("platform")
            .join("windows")
            .join("winrt_ocr.cpp"),
        _ => native_src
            .join("platform")
            .join("stub")
            .join("ocr_stub.cpp"),
    };
    println!("cargo:rerun-if-changed={}", platform_src.display());

    let mut build = cc::Build::new();
    build.cpp(true).include(&native_src).file(&c_api_src);

    match target_os.as_str() {
        "macos" => {
            build.flag("-std=c++17");
            build.compile("tuff_native_ocr_capi");

            let mut mm_build = cc::Build::new();
            mm_build
                .cpp(true)
                .include(&native_src)
                .file(&platform_src)
                .flag("-std=c++17")
                .flag("-fobjc-arc")
                .flag("-ObjC++");
            mm_build.compile("tuff_native_ocr_platform");

            for framework in ["Foundation", "Vision", "AppKit", "ImageIO", "CoreGraphics"] {
                println!("cargo:rustc-link-lib=framework={framework}");
            }
        }
        "windows" => {
            build
                .file(&platform_src)
                .flag("/std:c++20")
                .flag("/EHsc")
                .flag("/permissive-")
                .define("WIN32_LEAN_AND_MEAN", None)
                .define("NOMINMAX", None)
                .define("_WIN32_WINNT", "0x0A00")
                .define("WINVER", "0x0A00");
            build.compile("tuff_native_ocr_native");
            println!("cargo:rustc-link-lib=windowsapp");
        }
        _ => {
            build.file(&platform_src).flag("-std=c++17");
            build.compile("tuff_native_ocr_native");
        }
    }
}
