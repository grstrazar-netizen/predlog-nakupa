# Predlog nakupa drobnega materiala

Dokumentno usmerjena lokalna progresivna spletna aplikacija za izdajo obrazca **Predlog nakupa drobnega materiala**.

## Zagon

```bash
npm run dev
```

Nato odpri `http://127.0.0.1:4173`.

## Preverjanje in produkcijski build

```bash
npm run verify
npm run build
npm run preview
```

`npm run build` pripravi mapo `dist/`, ki vsebuje samo javne datoteke aplikacije. To je mapa, ki se objavi na Vercelu.

## Objava na Vercelu

Projekt je pripravljen za Vercel prek `vercel.json`:

- Build command: `npm run verify && npm run build`
- Output directory: `dist`
- Framework preset: brez ogrodja oziroma `Other`

Najlažja pot:

```bash
npm install -g vercel
vercel
vercel --prod
```

Če povežeš repozitorij GitHub z Vercelom, Vercel sam uporabi `vercel.json` ter pripravi predogledne objave za veje in produkcijsko objavo za glavno vejo.

## Kaj dela

- ustvari A4 dokument, ki sledi obstoječemu ODT obrazcu,
- shrani dokumente lokalno v IndexedDB,
- generira številko v obliki `KOV-2026-001`,
- pomni prejšnja podjetja, namene in obrazložitve za samodejno dopolnjevanje,
- uporablja fiksni logotip Centra Rog na dokumentu,
- pripne eno ponudbo v obliki datoteke PDF ali slike k dokumentu,
- izvozi ali natisne združen dokument PDF: obrazec najprej, ponudba kot dodatne strani,
- prikaže umirjen povzetek letne porabe iz shranjenih dokumentov,
- samodejno sešteje EUR zneske iz alinej v obrazložitvi in jih vpiše kot okvirno vrednost,
- loči interno številko dokumenta od računovodske vrstice `Št.: 2026- ____`.

## Podatki

Aplikacija je namenoma brez zalednega strežnika. Dokumenti, priponke in zgodovina porabe se shranjujejo v IndexedDB v brskalniku uporabnika. To pomeni, da objava na Vercelu ne ustvari skupne baze za vse vodje labov; vsak brskalnik ima svojo lokalno evidenco.

## Opomba o tehnologiji

Projekt je samostojna progresivna spletna aplikacija brez klasičnega gradnika za uporabniški vmesnik. Skripte `npm` služijo za preverjanje, pripravo mape `dist/` in lokalni predogled. Vmesnik uporablja oblikovno logiko shadcn/Tailwind prek lokalnih žetonov CSS. Knjižnici `pdf-lib` in `lucide` se nalagata prek fiksno verzioniranih povezav CDN, servisni delavec pa ju po prvem obisku shrani v predpomnilnik.
