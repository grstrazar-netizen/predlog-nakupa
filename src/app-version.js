export const APP_VERSION = "1.3.1";
export const APP_VERSION_STORAGE_KEY = "center-rog-evidence:last-seen-version";
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const CURRENT_RELEASE = {
  version: APP_VERSION,
  releasedAt: "2026-09-06",
  title: "Pametnejše izdajnice in koledar",
  notes: [
    "Izdajnice materiala si zapomnijo nazive iz shranjenih izdajnic in jih med naslednjim vnosom ponudijo kot predloge.",
    "Predlogi se med tipkanjem filtrirajo, podvojeni nazivi pa se ne prikazujejo.",
    "Koledar ima podroben mesečni urnik z urami in zaporedjem srečanj ter ločen A4 PDF za objavo na vhodu laboratorija.",
    "V koledarju lahko programu dodaš predvideno ceno vstopnice; podatek se prenese tudi v Asana CSV.",
    "Orodja in viri ocene v glavi koledarja so urejeni v preglednejšo, kompaktno vrstico."
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
