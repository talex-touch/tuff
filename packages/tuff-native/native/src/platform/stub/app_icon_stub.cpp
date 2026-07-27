#include "common/app_icon_types.h"

namespace tuff::native {

bool WriteDarwinAppIconBlocking(const DarwinAppIconWriteOptions &,
                                DarwinAppIconWriteResult &,
                                DarwinAppIconWriteError &error) {
  error.code = "ERR_DARWIN_APP_ICON_UNSUPPORTED";
  error.message =
      "Darwin application icon extraction is unavailable on this platform";
  return false;
}

} // namespace tuff::native
