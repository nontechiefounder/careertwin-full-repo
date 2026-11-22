import { sanitizeRedirectUrl } from "@/lib/safeRedirect";

export const MIN_SUPPORTED_VIEWPORT_WIDTH = 768;

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "token_hash",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "invite",
  "password",
  "secret",
  "api_key",
  "apikey",
  "key",
  "auth",
  "session",
  "onboarding",
]);

const PHONE_UA_PATTERN =
  /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile|Mobile Safari/i;

/**
 * Strip sensitive credential/token query parameters before storing or displaying
 * an intended workspace destination link.
 */
export function stripSensitiveQueryParams(search = "") {
  if (!search || typeof search !== "string") return "";
  const cleaned = search.startsWith("?") ? search.slice(1) : search;
  if (!cleaned) return "";

  const params = new URLSearchParams(cleaned);
  const safeParams = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    if (!SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      safeParams.append(key, value);
    }
  }

  const serialized = safeParams.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * Build a validated relative destination URL stripped of credentials/tokens.
 */
export function buildSafeDestination(
  pathname = "/",
  search = "",
  defaultFallback = "/employer"
) {
  const safePath = typeof pathname === "string" && pathname.startsWith("/") ? pathname : "/";
  const safeSearch = stripSensitiveQueryParams(search);
  return sanitizeRedirectUrl(`${safePath}${safeSearch}`, defaultFallback);
}

/**
 * Evaluate whether the current client browser/viewport is permitted to render
 * workspace features under the device-support policy:
 * - Supported: Desktops, laptops, Macs, and iPads with viewport width >= 768 CSS px.
 * - Unsupported: Phones (portrait or landscape) and narrow viewports < 768 CSS px.
 *
 * Known client-side detection limitations:
 * 1. A phone browser set to "Request Desktop Website" that forces a >= 768px layout
 *    viewport while suppressing touch metrics (maxTouchPoints / coarse pointer) cannot
 *    be reliably distinguished from a small desktop/iPad window in client JavaScript.
 * 2. iPadOS 13+ Safari sends a "Macintosh" User-Agent string; detection relies on
 *    maxTouchPoints > 1 combined with screen dimensions >= 768 CSS px.
 * 3. Viewport gating executes after client mount/resize rather than at the HTTP edge
 *    because HTTP headers do not carry layout viewport or iPad Split View width.
 */
export function evaluateDeviceSupport(env = null) {
  const source =
    env ||
    (typeof window !== "undefined"
      ? {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          screenWidth: window.screen?.width || 0,
          screenHeight: window.screen?.height || 0,
          userAgent: window.navigator?.userAgent || "",
          platform: window.navigator?.platform || "",
          maxTouchPoints: window.navigator?.maxTouchPoints || 0,
          coarsePointer: Boolean(
            window.matchMedia?.("(pointer: coarse)")?.matches
          ),
          anyFinePointer: Boolean(
            window.matchMedia?.("(any-pointer: fine)")?.matches
          ),
        }
      : null);

  if (!source) {
    return {
      supported: null,
      reason: "pending",
      isPhone: false,
      isIpad: false,
      deviceType: "unknown",
      viewportWidth: 0,
      viewportHeight: 0,
      minWidth: MIN_SUPPORTED_VIEWPORT_WIDTH,
    };
  }

  const viewportWidth = Number(source.viewportWidth) || 0;
  const viewportHeight = Number(source.viewportHeight) || 0;
  const screenWidth = Number(source.screenWidth) || 0;
  const screenHeight = Number(source.screenHeight) || 0;
  const ua = String(source.userAgent || "");
  const platform = String(source.platform || "");
  const maxTouchPoints = Number(source.maxTouchPoints) || 0;
  const coarsePointer = Boolean(source.coarsePointer);

  const minScreenDim =
    screenWidth > 0 && screenHeight > 0
      ? Math.min(screenWidth, screenHeight)
      : 0;
  const maxScreenDim =
    screenWidth > 0 && screenHeight > 0
      ? Math.max(screenWidth, screenHeight)
      : 0;

  const isPhoneUA = PHONE_UA_PATTERN.test(ua);
  const isIPadUA = /iPad/i.test(ua);
  const isIPadDesktopUA =
    (/Macintosh/i.test(ua) || /MacIntel/i.test(platform)) &&
    maxTouchPoints > 1 &&
    (maxScreenDim === 0 || maxScreenDim >= MIN_SUPPORTED_VIEWPORT_WIDTH);

  const isIpad = !isPhoneUA && (isIPadUA || isIPadDesktopUA);

  // Touch phone heuristic catches Android/mobile UAs or Playwright touch phones
  // whose shortest physical/screen axis is under 600px.
  const isTouchPhoneMetrics =
    !isIpad &&
    (coarsePointer || maxTouchPoints > 0) &&
    minScreenDim > 0 &&
    minScreenDim < 600 &&
    Math.min(viewportWidth, viewportHeight) < 600;

  // Landscape phone detection:
  // Blocks wide phone viewports (e.g. 667x375, 844x390, 932x430) while keeping
  // standard desktop windows (e.g. 1280x450 or 1024x768) and iPads allowed.
  const isLandscapePhone =
    !isIpad &&
    viewportHeight > 0 &&
    viewportHeight <= 460 &&
    viewportWidth <= 960 &&
    (isPhoneUA ||
      isTouchPhoneMetrics ||
      coarsePointer ||
      maxTouchPoints > 0 ||
      viewportWidth > viewportHeight);

  const isPhone = isPhoneUA || isTouchPhoneMetrics || isLandscapePhone;

  if (isPhone) {
    return {
      supported: false,
      reason: "phone",
      isPhone: true,
      isIpad: false,
      deviceType: "phone",
      viewportWidth,
      viewportHeight,
      minWidth: MIN_SUPPORTED_VIEWPORT_WIDTH,
    };
  }

  if (viewportWidth > 0 && viewportWidth < MIN_SUPPORTED_VIEWPORT_WIDTH) {
    if (isIpad) {
      return {
        supported: false,
        reason: "narrow-ipad",
        isPhone: false,
        isIpad: true,
        deviceType: "ipad",
        viewportWidth,
        viewportHeight,
        minWidth: MIN_SUPPORTED_VIEWPORT_WIDTH,
      };
    }

    if (viewportWidth <= 500) {
      return {
        supported: false,
        reason: "phone",
        isPhone: true,
        isIpad: false,
        deviceType: "phone",
        viewportWidth,
        viewportHeight,
        minWidth: MIN_SUPPORTED_VIEWPORT_WIDTH,
      };
    }

    return {
      supported: false,
      reason: "narrow-window",
      isPhone: false,
      isIpad: false,
      deviceType: "desktop",
      viewportWidth,
      viewportHeight,
      minWidth: MIN_SUPPORTED_VIEWPORT_WIDTH,
    };
  }

  return {
    supported: true,
    reason: "supported",
    isPhone: false,
    isIpad,
    deviceType: isIpad ? "ipad" : "desktop",
    viewportWidth,
    viewportHeight,
    minWidth: MIN_SUPPORTED_VIEWPORT_WIDTH,
  };
}
