export const APP_VERSION = "1.3.0";
export const APP_VERSION_STORAGE_KEY = "center-rog-evidence:last-seen-version";
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const CURRENT_RELEASE = {
  version: APP_VERSION,
  releasedAt: "2026-09-04",
  title: "Koledar programov",
  notes: [
    "Novi zavihek Koledar prikaže leta 2026–2035 po kvartalih in oceni primernost vsakega dne za izvedbo programa.",
    "Ocena upošteva slovenske praznike, šolske počitnice za Ljubljano, študijski koledar UL in relevantne tematske dneve.",
    "S Shift + klikom ali načinom Izberi dneve lahko na koledar dodaš enkratne in ponavljajoče se dogodke z uro, kategorijo in lokacijo.",
    "Pomembne interne datume, kot so Rog Forum, kolektivni dopust ali teambuilding, lahko dodaš neposredno na izbrane dni in določiš njihov vpliv na oceno.",
    "Letni načrt sešteje ure, programe, termine in predvidena mesta ter jih razčleni po kategorijah.",
    "Načrtovane programe lahko izvoziš v Asana CSV z datumi, kategorijami, urami, lokacijami in kapaciteto.",
    "Barvni heatmap lahko po potrebi skriješ; aplikacija si izbiro zapomni.",
    "Celoten letni koledar lahko izvoziš kot enostranski PDF A4 v pokončni postavitvi.",
    "Klik na dan pojasni oceno, pokaže načrtovane dogodke in predlaga najboljše termine v izbranem mesecu."
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
