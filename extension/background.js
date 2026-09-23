// Only extension content scripts can request their top-level site's policy.
// No external messaging, network requests, browsing log, or cookie API.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "policy" || !sender.tab) return;
  let hostname;
  try {
    const url = new URL(sender.tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) return;
    hostname = url.hostname;
  } catch { return; }
  chrome.storage.local.get(["enabled", "rejectCookies", "hidePromotions", `paused:${hostname}`], settings => {
    reply({
      enabled: settings.enabled !== false && settings[`paused:${hostname}`] !== true,
      rejectCookies: settings.rejectCookies !== false,
      hidePromotions: settings.hidePromotions !== false
    });
  });
  return true;
});
