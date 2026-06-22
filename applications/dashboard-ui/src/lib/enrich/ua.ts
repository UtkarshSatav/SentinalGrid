import "server-only";
import { UAParser } from "ua-parser-js";

export interface UAResult {
  browser: string | null;
  os: string | null;
  bot: boolean;
}

const BOT_HINTS = /bot|crawler|spider|scrape|curl|wget|python|nikto|sqlmap|nuclei|nmap|masscan/i;

export function parseUA(ua: string | null | undefined): UAResult {
  if (!ua) return { browser: null, os: null, bot: false };
  const parsed = new UAParser(ua).getResult();
  return {
    browser: parsed.browser.name ? `${parsed.browser.name} ${parsed.browser.version ?? ""}`.trim() : null,
    os:      parsed.os.name ?? null,
    bot:     BOT_HINTS.test(ua),
  };
}
