!macro customInstall
  ; 确保输出目录存在
  CreateDirectory "$INSTDIR"
!macroend

!macro customUnInstall
  ; 清理安装目录
  RMDir /r "$INSTDIR"
!macroend
