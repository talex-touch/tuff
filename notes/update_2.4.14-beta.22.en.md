# Tuff v2.4.14-beta.22 Release Notes

## Summary Notes

- Linux release installs now resolve optional native runtime dependencies for both glibc and musl.
- The Linux musl LibSQL binary is included in the packaged runtime closure, preventing an official asset from missing its database runtime.
- Release gates remain fail-closed: a missing platform runtime still blocks publishing rather than producing an incomplete package.

## What's Changed

- Declared `libc: [current, musl]` under pnpm workspace `supportedArchitectures`, allowing a glibc CI runner to install musl optional dependencies.
- Retained the CoreApp `@libsql/linux-x64-musl` optional runtime declaration and will verify the complete runtime closure in the next official Linux build.
- Official macOS, Windows, and Linux N→N+1 OTA health-ack acceptance remains a required release condition.
