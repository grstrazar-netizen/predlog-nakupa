export const APP_VERSION = "1.0.0";
export const APP_VERSION_STORAGE_KEY = "center-rog-evidence:last-seen-version";
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const CURRENT_RELEASE = {
  version: APP_VERSION,
  releasedAt: "2026-07-11",
  title: "Varnejši podatki in zanesljivejše posodobitve",
  notes: [
    "Dodane so šifrirane varnostne kopije vseh evidenc, priponk in podpisov.",
    "Chrome in Edge lahko po enkratni izbiri mape pripravita dnevni backup ob 19.30.",
    "Aplikacija zdaj jasno opozori, ko je na voljo nova različica.",
    "Dodani so večbrskalniški testi najpomembnejših uporabniških tokov."
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
