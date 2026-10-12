import SwiftUI

@main
struct GemGardenApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .background(Color(red: 0.965, green: 0.957, blue: 0.929))
                .preferredColorScheme(.light)
                .ignoresSafeArea()
        }
    }
}
