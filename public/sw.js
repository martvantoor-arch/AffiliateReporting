/*
 * Service worker voor Kasboek.
 *
 * Bewust minimaal: geen offline-cache, geen onderschepping van verzoeken. Het
 * enige doel is pushberichten kunnen ontvangen — op iOS is een geregistreerde
 * service worker daarvoor een harde eis. Alles cachen zou hier alleen maar oude
 * cijfers opleveren.
 */

self.addEventListener("install", () => {
  // Meteen de nieuwe versie gebruiken in plaats van op een herstart wachten.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Kasboek";
  const options = {
    body: data.body || "Er is een nieuwe transactie binnengekomen.",
    icon: "/icon-192.png",
    badge: "/badge.png",
    // Meldingen met dezelfde tag vervangen elkaar; geen stapel op je scherm.
    tag: data.tag || "kasboek",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Staat de app al open, dan die naar voren halen in plaats van een
        // tweede venster te openen.
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
