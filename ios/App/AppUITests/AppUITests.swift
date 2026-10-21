import XCTest

/// Exercises the shipped WebView and Capacitor plugins through public UI only.
final class AppUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "io.github.ii300.civicguard")

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        XCUIDevice.shared.orientation = .portrait
    }

    override func tearDownWithError() throws {
        if app.state != .notRunning { app.terminate() }
    }

    func testOfflineExerciseDraftRecoveryAndNativeSharing() {
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30), "The bundled app must launch without a server.")
        XCTAssertTrue(app.staticTexts["Offline exercise map"].waitForExistence(timeout: 30))
        waitUntilVisible(app.staticTexts["Palisades Fire Simulation"].firstMatch)
        attachScreenshot("store-01-exercise")

        let mapLink = app.links["Map"].firstMatch
        if mapLink.exists && mapLink.isHittable {
            mapLink.tap()
            waitUntilVisible(app.staticTexts["Offline exercise map"].firstMatch)
            attachScreenshot("store-02-map")
        }

        let editor = app.webViews.textViews["Alert text"].firstMatch
        revealDraft(editor)
        XCTAssertTrue(editor.waitForExistence(timeout: 20))
        let enabled = NSPredicate(format: "enabled == true")
        expectation(for: enabled, evaluatedWith: editor)
        waitForExpectations(timeout: 20)
        attachScreenshot("store-03-message")

        let marker = " Native device exercise saved for practice."
        editor.tap()
        editor.typeText(marker)
        XCTAssertTrue(app.staticTexts["Saved on this device."].waitForExistence(timeout: 20), "This must exercise the native Preferences plugin.")

        // Interrupt editing with the keyboard still open, as when someone closes
        // the app mid-exercise. This also avoids iPad simulator keyboard-hide
        // animations that never signal XCTest's idle detector on iOS 26.2.
        restartAndVerifyDraft(editor, marker: marker)

        let approve = app.buttons["Approve Simulation"].firstMatch
        reveal(approve)
        approve.tap()
        XCTAssertTrue(app.staticTexts["Approved in simulation"].waitForExistence(timeout: 10))

        restartAndVerifyDraft(editor, marker: marker)
        XCTAssertTrue(app.staticTexts["Pending simulation review"].exists, "A previous approval must never survive a restart.")
        XCTAssertFalse(app.staticTexts["Approved in simulation"].exists)

        let share = app.buttons["Share exercise summary"].firstMatch
        reveal(share)
        share.tap()
        // iOS may expose activity actions as cells or static text rather than buttons.
        // A visible system activity action proves sharing opened; no recipient is selected.
        let copy = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Copy")).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 15), "The iOS system share sheet must open. Accessibility tree: \(app.debugDescription)")
        attachScreenshot("native-share-sheet")
        copy.tap()
        XCTAssertTrue(app.staticTexts["Exercise summary shared using your chosen app."].waitForExistence(timeout: 15), "Copying the exercise must finish the native share operation.")
    }

    private func revealDraft(_ editor: XCUIElement) {
        let draftLink = app.links["Draft"].firstMatch
        if draftLink.exists && draftLink.isHittable {
            draftLink.tap()
        }
        reveal(editor)
    }

    private func reveal(_ element: XCUIElement) {
        for _ in 0..<10 {
            if element.exists && element.isHittable { return }
            // The left edge avoids dragging the interactive map in the iPad layout.
            let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.78))
            let to = app.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.25))
            from.press(forDuration: 0.05, thenDragTo: to)
        }
        XCTAssertTrue(element.exists && element.isHittable, "The exercise control must be reachable.")
    }

    private func restartAndVerifyDraft(_ editor: XCUIElement, marker: String) {
        app.terminate()
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        revealDraft(editor)
        XCTAssertTrue(editor.waitForExistence(timeout: 20))
        let restored = NSPredicate(format: "value CONTAINS %@", marker)
        expectation(for: restored, evaluatedWith: editor)
        waitForExpectations(timeout: 20)
    }

    private func waitUntilVisible(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 20))
        expectation(for: NSPredicate(format: "hittable == true"), evaluatedWith: element)
        waitForExpectations(timeout: 10)
    }

    private func attachScreenshot(_ name: String) {
        // Anchor jumps can precede WKWebView's offscreen compositing pass.
        // Capture the real rendered screen after a short bounded settling period.
        Thread.sleep(forTimeInterval: 1)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
