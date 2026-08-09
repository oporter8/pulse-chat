const CACHE_NAME = "pulse-shell-v8";
const SHELL = ["/", "/icons/pulse-192.png", "/icons/pulse-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API traffic, Next build assets, auth URLs, or chat pages that can
  // contain user-specific state. The shell fallback is intentionally tiny.
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/chat") ||
    url.pathname.startsWith("/reset-password")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match("/");
      }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Tiger Chat",
    body: "New message",
    url: "/chat",
    tag: "pulse-message",
  };

  if (event.data) {
    try {
      const incoming = event.data.json();
      payload = {
        title: typeof incoming.title === "string" && incoming.title ? incoming.title : payload.title,
        body: typeof incoming.body === "string" && incoming.body ? incoming.body : payload.body,
        url: typeof incoming.url === "string" && incoming.url.startsWith("/") ? incoming.url : payload.url,
        tag: typeof incoming.tag === "string" && incoming.tag ? incoming.tag : payload.tag,
      };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text.slice(0, 180);
    }
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some((client) => client.focused)) return;

    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/pulse-192.png",
      badge: "/icons/pulse-192.png",
      tag: payload.tag,
      data: { url: payload.url },
      renotify: false,
    });
    // Installed browsers that support the Badging API get an immediate unread
    // indicator in the background. The open app replaces this with the exact
    // unread total after it syncs conversations.
    try { await self.navigator?.setAppBadge?.(1); } catch { /* unsupported */ }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const relativeUrl =
    typeof event.notification.data?.url === "string" && event.notification.data.url.startsWith("/")
      ? event.notification.data.url
      : "/chat";
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const sameOrigin = clients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (sameOrigin) {
        if ("navigate" in sameOrigin && sameOrigin.url !== targetUrl) {
          try {
            await sameOrigin.navigate(targetUrl);
          } catch {
            // If navigation fails, focusing the existing Pulse window is still useful.
          }
        }
        return sameOrigin.focus();
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
