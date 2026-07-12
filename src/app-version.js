export const APP_VERSION = "1.0.1";
export const APP_VERSION_STORAGE_KEY = "center-rog-evidence:last-seen-version";
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const CURRENT_RELEASE = {
  version: APP_VERSION,
  releasedAt: "2026-07-12",
  title: "Urejen imenik podjetij",
  notes: [
    "Dodana je lokalna kartica za dodajanje, popravljanje in odstranjevanje podjetij.",
    "Shranjena podjetja so vključena med predloge pri vnosu partnerja.",
    "Odstranjena je obroba pri odobritvi DA / NE."
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
