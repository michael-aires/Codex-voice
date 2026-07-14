import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [server, models, client, appModel, settings, readinessView, info, components] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Models.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/CooperAPIClient.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/SettingsView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/DeviceReadinessView.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Info.plist", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Components.swift", import.meta.url), "utf8")
]);

test("authenticated mobile readiness contract exposes configuration without secrets", () => {
  assert.match(server, /app\.get\("\/api\/mobile-readiness"/);
  assert.match(server, /openAIConfigured: Boolean\(process\.env\.OPENAI_API_KEY\)/);
  assert.match(server, /apns: publicMobilePushStatus\(db\)/);
  assert.match(server, /hostAssociationConfigured: Boolean\(iosAssociatedAppId\)/);
  assert.match(server, /webZoomSDKConfigured: Boolean\(zoomSdkKey && zoomSdkSecret\)/);
  assert.match(server, /nativeEmbeddedSDKConfigured: false/);
  const readinessRoute = server.match(/app\.get\("\/api\/mobile-readiness"[\s\S]*?\n\}\);/u)?.[0] || "";
  assert.doesNotMatch(readinessRoute, /sdkKey|privateKey|zoomSdkSecret/);
});

test("native readiness keeps implemented behavior separate from external device gates", () => {
  assert.match(models, /struct MobileDeviceReadiness: Decodable, Hashable, Sendable/);
  assert.match(client, /func mobileDeviceReadiness\(\) async throws/);
  assert.match(appModel, /deviceReadiness = readiness/);
  assert.match(appModel, /isRemotePushRegistered = true/);
  assert.doesNotMatch(appModel, /isRemotePushRegistered = response\.mobilePush\.configured/);
  assert.match(settings, /DeviceReadinessView\(\)/);
  assert.match(readinessView, /AVAudioApplication\.shared\.recordPermission/);
  assert.match(readinessView, /Physical device required/);
  assert.match(readinessView, /Signed app domain entitlement/);
  assert.match(info, /<key>CooperAssociatedDomainsConfigured<\/key>\s*<false\/>/);
});

test("readiness and shared status components scale with Dynamic Type and expose named controls", () => {
  assert.match(readinessView, /dynamicTypeSize\.isAccessibilitySize/);
  assert.match(readinessView, /accessibilityLabel\("\\\(title\)\. \\\(value\)\. \\\(detail\)"\)/);
  assert.match(readinessView, /accessibilityIdentifier\("refresh-device-readiness"\)/);
  assert.doesNotMatch(readinessView, /\.font\(\.system\(size:/);
  assert.match(components, /\.font\(\.caption2\.weight\(\.bold\)\.monospaced\(\)\)/);
});
