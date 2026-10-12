# 拾光消消 · iPhone 离线闯关版

15 关 3D 消消乐，含关卡树、星级、5 颗生命和本机时间恢复。玩法和进度存储均不依赖网络。此仓库包含可直接在浏览器预览的网页源码、iOS SwiftUI + WKWebView 工程，以及已打包的本地网页资源。

## 项目结构

- `hi3d-web/`：可在本地 HTTP 服务中运行的原版网页游戏源文件，ES module 与 Three.js 均为本地文件。
- `hi3d-ios/hi3d-GemGarden.xcodeproj`：Xcode iPhone 应用工程。
- `hi3d-ios/hi3d-GameAssets/`：可由 Xcode 直接打进 App 的游戏文件；`hi3d-bundle.js` 已预先生成，无须在 Xcode 构建时联网。
- `hi3d-ios/hi3d-LocalProgress.swift`：在当前设备的 App UserDefaults 保存当前棋盘、各关星级、最高分和生命值。网页预览继续使用浏览器 localStorage；两种来源的存档不会自动迁移或同步。
- `scripts/hi3d-build-web.mjs`：源网页改变后，重新生成 iOS 使用的离线 JS bundle 和 HTML；需要 Node.js/npm，首次运行会获取固定版本 esbuild，仅开发阶段联网。
- `scripts/hi3d-create-icon.py`：重建图标的可选脚本，生成的 PNG 已提交，通常不用运行。

## 在 Xcode 中运行

1. 打开 `hi3d-ios/hi3d-GemGarden.xcodeproj`，选择 `GemGarden` target 的 **Signing & Capabilities**，在自己的 Mac 上选择 Team。项目已启用自动签名。`PRODUCT_BUNDLE_IDENTIFIER` 默认为 `com.pengchengluoyi.gemgarden`，若与已注册的 App ID 冲突，请改为你自己的唯一标识。
2. 在 Xcode 中选一台 iPhone 设备，点击运行；首次启用开发者模式和设备信任按 Xcode 提示操作。关闭网络检查仍能进入关卡、交换宝石并恢复本地进度。
3. 正式发布前在 iPhone 真机核对 WebGL 画面、触摸、横竖屏、安全区、后台/冷启动和离线存档。目前已完成 Xcode 无签名编译、iPhone 17 Pro 模拟器首页启动截图和浏览器端交互检查；尚未在真机或 TestFlight 验证。

## TestFlight

在 Xcode 中配置自己的 Apple 开发者签名，确保 Bundle ID 与 App Store Connect 的应用一致。发布新测试版时增加 Build Number（`CURRENT_PROJECT_VERSION`），选择真机或 `Any iOS Device`，执行 **Product → Archive → Distribute App → App Store Connect**。在 App Store Connect 的 TestFlight 页面添加测试者。上传和下载安装需要网络；安装后游戏没有运行时网络依赖。

请不要提交签名证书、配置描述文件或含账号信息的构建日志。`.gitignore` 已排除临时构建文件和常见签名文件。仓库默认没有发布脚本、密钥或自动上传流程。

## 修改网页并更新 App

先修改 `hi3d-web/`，再在仓库根目录运行：

```sh
node scripts/hi3d-build-web.mjs
```

将网页源码和更新后的 `hi3d-ios/hi3d-GameAssets/` 一同纳入版本。随后在 Xcode 构建；不用 Xcode 去请求 CDN 或 npm 仓库。网页本地 HTTP 预览例子：

```sh
cd hi3d-web
python3 -m http.server 8000 --bind 127.0.0.1
```

然后访问本机 `http://127.0.0.1:8000/hi3d-index.html`。网页预览所用的浏览器存档与 iOS App 存档互相独立。

## 当前验证

网页入口、浏览器事件、短屏手机布局、关卡树、生命和恢复规则已在本地 HTTP + 浏览器测试通过。打包后的 iOS 网页资源已通过无远程请求、模拟本地存档读写和恢复检查；Xcode Generic iOS Device 与 iOS Simulator 均已无签名编译成功，模拟器已显示关卡树首页。模拟器尚未完成触摸交互和原生存档持久性自动化验证；此结果不等于 TestFlight 上线或真机测试。许可证见 `hi3d-web/vendor/LICENSE`。
