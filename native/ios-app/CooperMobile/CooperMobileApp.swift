import SwiftUI

@main
struct CooperMobileApp: App {
    @UIApplicationDelegateAdaptor(CooperAppDelegate.self) private var appDelegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(model)
                .task {
                    CooperNotificationDelegate.shared.connect(
                        routeHandler: { url in model.open(url) },
                        deviceTokenHandler: { token in
                            Task { await model.registerRemotePushDevice(token: token) }
                        },
                        registrationErrorHandler: { message in
                            model.remotePushRegistrationFailed(message)
                        },
                        backgroundRefreshHandler: {
                            await model.refreshFromRemoteNotification()
                        }
                    )
                    await model.start()
                }
                .onOpenURL { url in
                    model.open(url)
                }
        }
    }
}
