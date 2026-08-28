export const APP_VERSION = "1.1.0";
export const APP_VERSION_STORAGE_KEY = "center-rog-evidence:last-seen-version";
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const CURRENT_RELEASE = {
  version: APP_VERSION,
  releasedAt: "2026-08-28",
  title: "Varna predaja aplikacije in zgodovine",
  notes: [
    "Dodana sta neposreden gumb za namestitev aplikacije in navodila za podprte brskalnike.",
    "Voden prenos na nov računalnik izvozi celotno zgodovino v en šifriran predajni paket.",
    "Po obnovitvi aplikacija potrdi število prenesenih dokumentov in priponk."
  ]
};

export function isNewerVersion(remoteVersion, currentVersion = APP_VERSION) {
  const parse = (value) => String(value || "0").split(".").map((part) => Number(part) || 0);
  const remote = parse(remoteVersion);
  const current = parse(currentVersion);
  const length = Math.max(remote.length, current.length);
  for (let index = 0; index < length; index += 1) {
    if ((remote[index] || 0) > (current[index] || 0)) return true;
    if ((remote[index] || 0) < (current[index] || 0)) return false;
  }
  return false;
}

export async function fetchLatestVersion(fetcher = fetch) {
  const response = await fetcher(`/version.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Podatka o različici ni bilo mogoče prebrati.");
  return response.json();
}
