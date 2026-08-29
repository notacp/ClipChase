// Which YouTube surface a path represents, split out from the content script
// so it can be tested without a DOM. Getting this wrong is the difference
// between a button on every channel and a button on the homepage.

export type Surface = "channel_page" | "watch_page";

const CHANNEL_PATH_RE = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(\/|$)/;

export function surfaceForPath(pathname: string): Surface | null {
  if (pathname === "/watch") return "watch_page";
  if (CHANNEL_PATH_RE.test(pathname)) return "channel_page";
  return null;
}
