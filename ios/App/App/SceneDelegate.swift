import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ExerciseViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Keep the WebView inside UIKit's safe area, including its first rendered frame.
/// WKWebView's CSS safe-area values can arrive after the initial page layout.
private final class ExerciseViewController: UIViewController {
    private let bridgeViewController = CAPBridgeViewController()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 246 / 255.0, green: 244 / 255.0, blue: 239 / 255.0, alpha: 1)
        addChild(bridgeViewController)
        let content = bridgeViewController.view!
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)
        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: safeArea.topAnchor),
            content.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
        ])
        bridgeViewController.didMove(toParent: self)
    }

    override var childForStatusBarStyle: UIViewController? { bridgeViewController }
    override var childForStatusBarHidden: UIViewController? { bridgeViewController }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        bridgeViewController.supportedInterfaceOrientations
    }
}
