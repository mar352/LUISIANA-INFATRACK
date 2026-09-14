/**
 * terms-consent.ts
 * Manages Terms & Conditions and Cookie consent for INFA-TRACK applications.
 * Uses both document.cookie and localStorage to persist citizen consent across sessions.
 */

export const APP_TERMS_COOKIE_KEY = "infatrack_app_terms_accepted";
export const GENERAL_COOKIE_KEY = "infatrack_cookie_consent";

/**
 * Reads a cookie value by name from document.cookie.
 */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const pattern = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`);
    const match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Sets a cookie with standard expiration and security flags.
 */
export function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === "undefined") return;
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie write errors (e.g., in strict iframe sandboxes)
  }
}

/**
 * Removes a cookie by expiring it immediately.
 */
export function removeCookie(name: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch {
    // Ignore error
  }
}

/**
 * Checks whether the user has already accepted the application Terms & Conditions and cookies.
 * Returns true if accepted in either localStorage or browser cookie.
 */
export function isAppTermsAccepted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const fromLocal = window.localStorage.getItem(APP_TERMS_COOKIE_KEY);
    if (fromLocal === "accepted" || fromLocal === "true") return true;

    const fromCookie = getCookie(APP_TERMS_COOKIE_KEY);
    if (fromCookie === "accepted" || fromCookie === "true") return true;
  } catch {
    // Ignore storage quota/permission errors
  }
  return false;
}

let cachedClientIp: string | null = null;

/**
 * Fetches the user's real public internet IP address directly from browser via reliable public IP discovery services.
 * Results are cached in memory and sessionStorage to prevent redundant network requests.
 */
export async function fetchClientPublicIp(): Promise<string> {
  if (cachedClientIp) return cachedClientIp;

  if (typeof window !== "undefined") {
    try {
      const fromSession = window.sessionStorage.getItem("infatrack_client_public_ip");
      if (fromSession && fromSession.trim()) {
        cachedClientIp = fromSession.trim();
        return cachedClientIp;
      }
    } catch {
      // ignore
    }
  }

  const endpoints = [
    "https://api.ipify.org?format=json",
    "https://api64.ipify.org?format=json",
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const ip = typeof data?.ip === "string" ? data.ip.trim() : "";
        if (ip) {
          cachedClientIp = ip;
          try {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem("infatrack_client_public_ip", ip);
            }
          } catch {
            // ignore
          }
          return ip;
        }
      }
    } catch {
      // try next
    }
  }

  return "";
}

/**
 * Sends a persistent record of the user's Terms & Conditions and cookie acceptance
 * to the backend database (PostgreSQL table user_terms_consents & JSON log).
 */
export async function saveTermsConsentToDatabase(data?: {
  applicantName?: string;
  source?: string;
  ipAddress?: string;
}): Promise<void> {
  try {
    const baseUrl =
      (typeof window !== "undefined" && (window as any).__INFA_BACKEND_URL__) ||
      "http://localhost:4000";

    // Obtain real public IP from browser or provided data
    const publicIp = data?.ipAddress || (await fetchClientPublicIp());

    await fetch(`${baseUrl}/api/terms-consent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ipAddress: publicIp || undefined,
        termsVersion: "2026.1",
        agreedTerms: true,
        agreedPrivacy: true,
        agreedCookies: true,
        consentSource: data?.source || "new_application_page",
        applicantName: data?.applicantName || "",
        acceptedAt: new Date().toISOString(),
      }),
    });
  } catch (err) {
    // Non-blocking: if network/database is offline, browser cookie still preserves consent
    console.warn("[terms-consent] failed to sync consent to database:", err);
  }
}

/**
 * Records the user's acceptance or refusal of the Terms & Conditions and cookies.
 * When accepted, saves both to localStorage and document.cookie for 365 days,
 * and asynchronously persists the consent in the backend database with real public IP.
 */
export function setAppTermsAccepted(
  accepted: boolean,
  options?: { applicantName?: string; source?: string; ipAddress?: string }
): void {
  if (typeof window === "undefined") return;
  const val = accepted ? "accepted" : "declined";

  try {
    if (accepted) {
      window.localStorage.setItem(APP_TERMS_COOKIE_KEY, val);
      setCookie(APP_TERMS_COOKIE_KEY, val, 365);

      // Also mark the general platform cookie consent as accepted so user doesn't get duplicate prompts
      window.localStorage.setItem(GENERAL_COOKIE_KEY, "accepted");
      setCookie(GENERAL_COOKIE_KEY, "accepted", 365);

      // Sync to database with real public IP
      void saveTermsConsentToDatabase(options);
    } else {
      window.localStorage.removeItem(APP_TERMS_COOKIE_KEY);
      removeCookie(APP_TERMS_COOKIE_KEY);
    }
  } catch {
    // Ignore storage quota/permission errors
  }
}
