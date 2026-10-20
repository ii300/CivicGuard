const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Run only on a Mac with Xcode 26 and the iOS 26 simulator runtime installed.
// No signing identity or Apple account is needed. Screenshots come directly
// from XCTest's application captures; JPEG conversion removes alpha only.
const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'release', 'ios');

function run(command, args, options = {}) {
    const started = Date.now();
    const timeout = options.timeout ?? 60_000;
    console.log(`[${new Date().toISOString()}] START (limit ${timeout / 1000}s): ${command} ${args.join(' ')}`);
    try {
        return execFileSync(command, args, { cwd: root, stdio: 'inherit', timeout, killSignal: 'SIGKILL', ...options });
    } finally {
        console.log(`[${new Date().toISOString()}] END (${((Date.now() - started) / 1000).toFixed(1)}s): ${command} ${args.slice(0, 3).join(' ')}`);
    }
}
function capture(command, args, options = {}) {
    return run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}
function json(command, args) {
    return JSON.parse(capture(command, args));
}
function filesBelow(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? filesBelow(fullPath) : [fullPath];
    });
}

const runtime = json('xcrun', ['simctl', 'list', 'runtimes', '--json']).runtimes
    .filter((item) => item.isAvailable && item.identifier.includes('.iOS-26-'))
    .sort((a, b) => Number(b.identifier.includes('iOS-26-2')) - Number(a.identifier.includes('iOS-26-2')))[0];
if (!runtime) throw new Error('An available iOS 26 simulator runtime is required.');
const types = json('xcrun', ['simctl', 'list', 'devicetypes', '--json']).devicetypes;
const iphone = types.find((type) => type.name === 'iPhone 17 Pro');
const ipad = types.find((type) => type.name.startsWith('iPad Pro 13-inch (M4)'))
    || types.find((type) => type.name.startsWith('iPad Pro 13-inch'));
if (!iphone || !ipad) throw new Error('iPhone 17 Pro and iPad Pro 13-inch simulator device types are required.');

let failed = false;
for (const device of [
    { type: iphone, slug: 'iphone-17-pro', width: 1206, height: 2622 },
    { type: ipad, slug: 'ipad-pro-13-inch', width: 2064, height: 2752 },
]) {
    let udid;
    const resultBundle = path.join(root, 'dist', `ios-ui-${device.slug}.xcresult`);
    const evidence = path.join(root, 'dist', `ios-ui-${device.slug}-attachments`);
    const screenshots = path.join(outputRoot, 'screenshots', device.slug);
    // Each run uses new simulators so no old preferences or account state leak in.
    fs.rmSync(resultBundle, { recursive: true, force: true });
    fs.rmSync(evidence, { recursive: true, force: true });
    fs.rmSync(screenshots, { recursive: true, force: true });
    try {
        udid = capture('xcrun', ['simctl', 'create', `CivicGuard ${device.slug} CI`, device.type.identifier, runtime.identifier]).trim();
        run('xcrun', ['simctl', 'boot', udid], { timeout: 300_000 });
        run('xcrun', ['simctl', 'bootstatus', udid, '-b'], { timeout: 300_000 });
        try {
            // Cosmetic only; an unavailable status-bar override must not block app verification.
            run('xcrun', ['simctl', 'status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100'], { timeout: 120_000 });
        } catch (error) {
            console.warn(`Status-bar styling was unavailable for ${device.type.name}: ${error.message}`);
        }
        run('xcodebuild', [
            '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
            '-configuration', 'Release', '-sdk', 'iphonesimulator',
            '-destination', `platform=iOS Simulator,id=${udid}`, '-destination-timeout', '60',
            '-derivedDataPath', 'dist/ios-simulator',
            '-resultBundlePath', resultBundle,
            '-parallel-testing-enabled', 'NO', '-test-timeouts-enabled', 'YES',
            '-default-test-execution-time-allowance', '180',
            '-maximum-test-execution-time-allowance', '180',
            'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=NO', 'test',
        ], { timeout: 600_000 });
    } catch (error) {
        failed = true;
        console.error(`Native UI verification failed for ${device.type.name}: ${error.message}`);
    } finally {
        if (fs.existsSync(resultBundle)) {
            try {
                run('xcrun', ['xcresulttool', 'export', 'attachments', '--path', resultBundle, '--output-path', evidence], { timeout: 120_000 });
                fs.mkdirSync(screenshots, { recursive: true });
                const captures = filesBelow(evidence).filter((filename) => filename.toLowerCase().endsWith('.png')).sort();
                if (captures.length < 2) throw new Error('Native test did not produce the required app screenshots.');
                for (const [index, filename] of captures.entries()) {
                    const output = path.join(screenshots, `native-exercise-${String(index + 1).padStart(2, '0')}.jpg`);
                    run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', 'best', filename, '--out', output], { timeout: 30_000 });
                    const metadata = capture('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', output], { timeout: 30_000 });
                    if (!metadata.includes(`pixelWidth: ${device.width}`) || !metadata.includes(`pixelHeight: ${device.height}`) || !metadata.includes('hasAlpha: no')) {
                        throw new Error(`Screenshot dimensions or alpha channel are invalid: ${metadata}`);
                    }
                }
                const manifest = {
                    source: 'XCTest XCUIScreen.main.screenshot(), running the bundled Release iOS app',
                    device: device.type.name,
                    runtime: runtime.name,
                    width: device.width,
                    height: device.height,
                    conversion: 'JPEG encoding only; no resizing, compositing, or content replacement',
                    files: fs.readdirSync(screenshots).filter((filename) => filename.endsWith('.jpg')),
                };
                fs.writeFileSync(path.join(screenshots, 'capture-info.json'), `${JSON.stringify(manifest, null, 2)}\n`);
            } catch (error) {
                failed = true;
                console.error(`Screenshot extraction failed for ${device.type.name}: ${error.message}`);
            }
        }
        if (udid) {
            try { run('xcrun', ['simctl', 'shutdown', udid], { timeout: 30_000 }); } catch { /* It may already be shut down. */ }
            try { run('xcrun', ['simctl', 'delete', udid], { timeout: 30_000 }); } catch { /* Keep the original error. */ }
        }
    }
}
if (failed) process.exitCode = 1;
