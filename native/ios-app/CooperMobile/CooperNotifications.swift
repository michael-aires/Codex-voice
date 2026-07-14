import UIKit
import UserNotifications

enum CooperNotificationAuthorization: String, Sendable {
    case unknown
    case notDetermined
    case authorized
    case denied

    var label: String {
        switch self {
        case .unknown: "Checking"
        case .notDetermined: "Not enabled"
        case .authorized: "Enabled"
        case .denied: "Blocked in Settings"
        }
    }
}

final class CooperNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = CooperNotificationDelegate()

    @MainActor private var routeHandler: ((URL) -> Void)?
    @MainActor private var deviceTokenHandler: ((String) -> Void)?
    @MainActor private var registrationErrorHandler: ((String) -> Void)?
    @MainActor private var backgroundRefreshHandler: (() async -> UIBackgroundFetchResult)?

    @MainActor
    func connect(
        routeHandler: @escaping (URL) -> Void,
        deviceTokenHandler: @escaping (String) -> Void,
        registrationErrorHandler: @escaping (String) -> Void,
        backgroundRefreshHandler: @escaping () async -> UIBackgroundFetchResult
    ) {
        self.routeHandler = routeHandler
        self.deviceTokenHandler = deviceTokenHandler
        self.registrationErrorHandler = registrationErrorHandler
        self.backgroundRefreshHandler = backgroundRefreshHandler
    }

    @MainActor
    func received(deviceToken: Data) {
        deviceTokenHandler?(deviceToken.map { String(format: "%02x", $0) }.joined())
    }

    @MainActor
    func failedRegistration(error: Error) {
        registrationErrorHandler?(error.localizedDescription)
    }

    @MainActor
    func refreshFromRemotePush() async -> UIBackgroundFetchResult {
        await backgroundRefreshHandler?() ?? .noData
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let value = response.notification.request.content.userInfo["cooperRoute"] as? String,
              let url = URL(string: value) else { return }
        await MainActor.run { routeHandler?(url) }
    }
}

@MainActor
final class CooperAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = CooperNotificationDelegate.shared
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        CooperNotificationDelegate.shared.received(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        CooperNotificationDelegate.shared.failedRegistration(error: error)
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        Task { @MainActor in
            completionHandler(await CooperNotificationDelegate.shared.refreshFromRemotePush())
        }
    }
}

enum CooperNotifications {
    static func schedule(
        identifier: String,
        title: String,
        body: String,
        route: CooperRoute,
        delay: TimeInterval = 0
    ) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = notificationThread(for: route)
        content.userInfo = ["cooperRoute": route.url.absoluteString]
        let trigger = delay > 0
            ? UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false)
            : nil
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    private static func notificationThread(for route: CooperRoute) -> String {
        switch route {
        case .operatorWorkspace, .operatorTask: "operator"
        case .artifact, .library: "artifacts"
        case .dailyBrief, .today: "today"
        case .session, .sessions: "sessions"
        default: "cooper"
        }
    }
}
