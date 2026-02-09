{
  "targets": [
    {
      "target_name": "tuff_native_ocr",
      "sources": [
        "native/src/addon.cc",
        "native/src/platform/stub/ocr_stub.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/src"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_CPP_EXCEPTIONS"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "cflags_cc": [
        "-std=c++17"
      ],
      "conditions": [
        [
          "OS==\"mac\"",
          {
            "sources!": [
              "native/src/platform/stub/ocr_stub.cpp"
            ],
            "sources+": [
              "native/src/platform/macos/vision_ocr.mm"
            ],
            "xcode_settings": {
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "OTHER_CFLAGS": [
                "-fobjc-arc"
              ],
              "OTHER_LDFLAGS": [
                "-framework",
                "Foundation",
                "-framework",
                "Vision",
                "-framework",
                "AppKit",
                "-framework",
                "ImageIO",
                "-framework",
                "CoreGraphics"
              ]
            }
          }
        ],
        [
          "OS==\"win\"",
          {
            "sources!": [
              "native/src/platform/stub/ocr_stub.cpp"
            ],
            "sources+": [
              "native/src/platform/windows/winrt_ocr.cpp"
            ],
            "defines": [
              "WIN32_LEAN_AND_MEAN",
              "NOMINMAX",
              "_WIN32_WINNT=0x0A00",
              "WINVER=0x0A00"
            ],
            "libraries": [
              "windowsapp.lib"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": [
                  "/std:c++20",
                  "/EHsc",
                  "/permissive-"
                ],
                "AdditionalIncludeDirectories": [
                  "$(WindowsSdkDir)Include\\$(WindowsTargetPlatformVersion)\\cppwinrt"
                ]
              }
            }
          }
        ]
      ]
    },
    {
      "target_name": "tuff_native_everything",
      "sources": [
        "native/src/everything/addon.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/src"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_CPP_EXCEPTIONS"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "cflags_cc": [
        "-std=c++17"
      ],
      "conditions": [
        [
          "OS==\"mac\"",
          {
            "xcode_settings": {
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
            }
          }
        ],
        [
          "OS==\"win\"",
          {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": [
                  "/std:c++20",
                  "/EHsc",
                  "/permissive-"
                ]
              }
            }
          }
        ]
      ]
    }
  ]
}
