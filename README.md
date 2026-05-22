# Predlog Nakupa Drobnega Materiala

Document-first lokalna PWA aplikacija za izdajo obrazca **Predlog nakupa drobnega materiala**.

## Zagon

```bash
npm run dev
```

Nato odpri `http://127.0.0.1:5173`.

## Preverjanje in produkcijski build

```bash
npm run verify
npm run build
npm run preview
```

`npm run build` pripravi mapo `dist/`, ki vsebuje samo javne datoteke aplikacije. To je mapa, ki se objavi na Vercelu.

## Objava na Vercel

Projekt je pripravljen za Vercel prek `vercel.json`:

- Build command: `npm run verify && npm run build`
- Output directory: `dist`
- Framework preset: brez frameworka oziroma `Other`

Najlažja pot:

```bash
npm install -g vercel
vercel
vercel --prod
```

Če povežeš GitHub repo z Vercelom, Vercel sam uporabi `vercel.json` in naredi preview deploye za branche ter produkcijski deploy za glavno vejo.

## Kaj dela

- ustvari A4 dokument, ki sledi obstoječemu ODT obrazcu,
- shrani dokumente lokalno v IndexedDB,
- generira številko v obliki `KOV-2026-001`,
- pomni prejšnja podjetja, namene in obrazložitve za autocomplete,
- uporablja fiksni Center Rog wordmark na dokumentu,
- pripne eno PDF ponudbo k dokumentu,
- izvozi ali natisne združen PDF: obrazec najprej, ponudba kot dodatne strani,
- prikaže miren povzetek letne porabe iz shranjenih dokumentov,
- samodejno sešteje EUR zneske iz alinej v obrazložitvi in jih vpiše kot okvirno vrednost,
- loči interno številko dokumenta od računovodske vrstice `Št.: 2026- ____`.

## Podatki

Aplikacija je namenoma brez backend strežnika. Dokumenti, priponke in zgodovina porabe se shranjujejo v IndexedDB v brskalniku uporabnika. To pomeni, da Vercel objava ne ustvari skupne baze za vse vodje labov; vsak brskalnik ima svojo lokalno evidenco.

## Opomba o stacku

Projekt je samostojen no-build PWA brez frontend bundlerja. `npm` skripte služijo za preverjanje, pripravo `dist/` mape in lokalni preview. UI uporablja shadcn/Tailwind oblikovno logiko prek lokalnih CSS tokenov. `pdf-lib` in `lucide` se nalagata prek fiksno verzioniranih CDN povezav, service worker pa ju po prvem obisku shrani v cache.
