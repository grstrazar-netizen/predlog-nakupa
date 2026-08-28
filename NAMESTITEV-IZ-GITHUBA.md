# Namestitev aplikacije iz GitHuba

Ta možnost je rezervna pot, če Vercelov naslov ni več dosegljiv ali želi Center Rog aplikacijo poganjati lokalno. GitHub vsebuje aplikacijo, ne vsebuje pa dokumentov, priponk, podpisov ali osebnih podatkov uporabnikov.

## Najlažja namestitev lokalnega paketa

1. Odpri <https://github.com/grstrazar-netizen/predlog-nakupa/releases/latest>.
2. V razdelku **Assets** prenesi `center-rog-evidence-v...-lokalna.zip`.
3. ZIP razširi v stalno mapo, na primer `Dokumenti/Center Rog evidence`.
4. Namesti aktualni [Node.js LTS](https://nodejs.org/en/download). Ta korak je potreben samo prvič.
5. V macOS dvoklikni `ZAZENI-MAC.command`. Če sistem prvi zagon blokira, datoteko klikni z desnim gumbom in izberi **Odpri**.
6. V Windows dvoklikni `ZAZENI-WINDOWS.bat`.
7. Brskalnik odpre `http://127.0.0.1:4173/`. Ukazno okno mora med uporabo ostati odprto.
8. Aplikacijo lahko nato namestiš kot PWA z gumbom **Namesti**.

## Prenos obstoječe zgodovine

Pred namestitvijo na novem računalniku na starem računalniku odpri:

**Backup → Prenos na nov računalnik**

Prenesi šifrirani paket in geslo posreduj po drugi poti. V lokalno nameščeni aplikaciji odpri isti meni, izberi predajni paket ter vnesi geslo. Preveri vsaj en dokument, eno priponko in podpis.

GitHubova ZIP-datoteka sama nikoli ne vsebuje uporabniške zgodovine. Če starega naslova ni več mogoče odpreti in predajni paket ni bil izdelan, podatkov iz drugega računalnika ni mogoče pridobiti iz GitHuba.

## Preverjanje prenosa

Ob izdaji je poleg ZIP-datoteke objavljen `SHA256SUMS.txt`. Tehnični skrbnik lahko preveri, da paket med prenosom ni bil spremenjen:

```bash
shasum -a 256 center-rog-evidence-v*-lokalna.zip
```

Izpis mora biti enak vrednosti v `SHA256SUMS.txt`.

## Namestitev iz izvorne kode

Za razvijalca ali novega vzdrževalca:

```bash
git clone https://github.com/grstrazar-netizen/predlog-nakupa.git
cd predlog-nakupa
npm ci
npm run check
npm test
npm run dev
```

Aplikacija je nato dosegljiva na `http://127.0.0.1:4173/`. Produkcijska mapa se pripravi z `npm run build`; rezultat je v `dist/` in ga je mogoče objaviti na kateremkoli statičnem spletnem gostovanju.

## Posodobitev lokalne namestitve

1. Najprej izdelaj svež šifriran predajni paket.
2. Z GitHub Releases prenesi novo različico.
3. Zapri star lokalni strežnik in razširi novi paket v novo mapo.
4. Zaženi novo različico in po potrebi obnovi predajni paket.

Za običajno uporabo je še vedno priporočljiv stalni spletni naslov ali lastna domena. Lokalni GitHub paket je zanesljiva rezervna možnost, ne samodejni sistem posodobitev.
