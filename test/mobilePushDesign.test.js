import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [serverSource, appSource, delegateSource, modelSource, infoSource, entitlementsSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/CooperMobileApp.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/CooperNotifications.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/AppModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/Info.plist", import.meta.url), "utf8"),
  readFile(new URL("../native/ios-app/CooperMobile/CooperMobile.entitlements", import.meta.url), "utf8")
]);

test("Cooper host persists registration and transition-driven push outbox state", () => {
  assert.match(serverSource, /app\.get\("\/api\/mobile-push\/status"/);
  assert.match(serverSource, /app\.post\("\/api\/mobile-push\/devices"/);
  assert.match(serverSource, /app\.post\("\/api\/mobile-push\/devices\/unregister"/);
  assert.match(serverSource, /mobilePushSnapshot\(db\)/);
  assert.match(serverSource, /enqueueMobilePushEvents/);
  assert.match(serverSource, /processMobilePushOutbox/);
  assert.match(serverSource, /mobilePushDevices: Array\.isArray/);
  assert.match(serverSource, /mobilePushEvents: Array\.isArray/);
});

test("iOS registers every launch and reconciles host state after remote delivery", () => {
  assert.match(appSource, /deviceTokenHandler/);
  assert.match(appSource, /backgroundRefreshHandler/);
  assert.match(delegateSource, /didRegisterForRemoteNotificationsWithDeviceToken/);
  assert.match(delegateSource, /didFailToRegisterForRemoteNotificationsWithError/);
  assert.match(delegateSource, /didReceiveRemoteNotification/);
  assert.match(modelSource, /registerForRemoteNotifications\(\)/);
  assert.match(modelSource, /refreshFromRemoteNotification/);
  assert.match(modelSource, /!isRemotePushRegistered/);
  assert.match(infoSource, /<string>remote-notification<\/string>/);
  assert.match(entitlementsSource, /<key>aps-environment<\/key>/);
});

test("universal-link host contract is configuration-gated", () => {
  assert.match(serverSource, /apple-app-site-association/);
  assert.match(serverSource, /COOPER_IOS_ASSOCIATED_APP_ID/);
  assert.match(serverSource, /components: \[\{ "\/": "\/open\/\*"/);
  assert.match(serverSource, /app\.get\("\/open\/\*"/);
  assert.match(modelSource, /CooperRoute\(universalURL: url\)/);
});
