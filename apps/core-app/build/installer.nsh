!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
!macroend

!macro customInstall
  ; 确保输出目录存在并设置正确权限
  CreateDirectory "$INSTDIR"
  ; 验证目录创建成功
  IfFileExists "$INSTDIR" +3 0
    MessageBox MB_OK "无法创建安装目录: $INSTDIR"
    Abort
!macroend

!macro customUnInstall
  ; 清理安装目录
  RMDir /r "$INSTDIR"
!macroend

!macro customHeader
  ; 设置输出文件路径，避免特殊字符问题
  OutFile "dist\${PRODUCT_NAME}-${VERSION}-setup.exe"
!macroend
