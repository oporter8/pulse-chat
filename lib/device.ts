export function getDeviceKey() {
  if (typeof window === "undefined") return "";
  const key = "pulse-device-key";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return value;
}

export function getDeviceName() {
  if (typeof navigator === "undefined") return "Browser";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux device";
  return "Browser";
}

export function forgetDeviceKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("pulse-device-key");
}
