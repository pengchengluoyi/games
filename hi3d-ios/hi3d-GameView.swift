import SwiftUI
import WebKit

struct GameView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let controller = configuration.userContentController
        controller.add(context.coordinator, name: "hi3dStorage")
        controller.addUserScript(WKUserScript(
            source: "window.__hi3dNativeSeed = \(LocalProgress.seedJSON());",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.965, green: 0.957, blue: 0.929, alpha: 1)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false

        if let page = Bundle.main.url(forResource: "hi3d-index", withExtension: "html", subdirectory: "hi3d-GameAssets") {
            view.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        } else {
            view.loadHTMLString("<html><body style='font:16px sans-serif;padding:2rem'>本地游戏资源缺失，请重新安装应用。</body></html>", baseURL: nil)
        }
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "hi3dStorage", let body = message.body as? [String: String], let key = body["key"] else { return }
            switch body["action"] {
            case "set":
                if let value = body["value"] { LocalProgress.set(value, for: key) }
            case "remove":
                LocalProgress.remove(key)
            default:
                break
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url, url.isFileURL else {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
