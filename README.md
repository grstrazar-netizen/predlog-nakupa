# Dokumenti materiala

Dokumentno usmerjena lokalna progresivna spletna aplikacija za obrazca **Predlog nakupa drobnega materiala** in **Izdajnica materiala**.

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
- z enim gumbom preklopi na izdajnico materiala z ločeno lokalno evidenco,
- izdajnico samodejno opremi z datumom, uro, krajem in številko `IZD-KOV-2026-001`,
- omogoča dinamične vrstice materiala ter izračun `količina × tarifa`,
- shrani nepopolno izdajnico kot osnutek, pred tiskom in izvozom pa preveri obvezna polja,
- vodi statuse izdajnice: osnutek, natisnjeno, plačano in material prevzet,
- pripravi profesionalno črno-belo izdajnico v ležečem formatu A4.

## Podatki

Aplikacija je namenoma brez zalednega strežnika. Dokumenti, priponke in zgodovina porabe se shranjujejo v IndexedDB v brskalniku uporabnika. To pomeni, da objava na Vercelu ne ustvari skupne baze za vse vodje labov; vsak brskalnik ima svojo lokalno evidenco.

### Varnostne kopije

- Gumb **Backup** odpre nastavitev enotne šifrirane kopije vseh evidenc, priponk, podpisov in nastavitev.
- Chrome in Edge lahko po enkratni izbiri mape vsak dan ob 19.30 zapišeta datoteko `center-rog-evidence-YYYY-MM-DD.backup`.
- Aplikacija mora biti odprta. Če je ob 19.30 zaprta, se zamujena kopija naredi ob naslednjem odprtju, ko ima brskalnik dovoljenje za izbrano mapo.
- Safari in Firefox ne omogočata tihega zapisovanja v poljubno lokalno mapo, zato v teh brskalnikih ostane ročni šifrirani prenos.
- Geslo ni shranjeno. Brez njega varnostne kopije ni mogoče obnoviti.

### Predaja drugemu uporabniku ali novemu računalniku

- Gumb **Namesti** v glavi zažene sistemsko namestitev PWA v Chromu ali Edgeu oziroma pokaže kratka navodila za druge brskalnike.
- V meniju **Backup** možnost **Prenos na nov računalnik** pripravi ločen šifriran paket `center-rog-predaja-YYYY-MM-DD.backup`.
- Paket vsebuje vse shranjene predloge nakupa, izdajnice, podpisne liste, poročila ur, priponke, podpise, imenik podjetij in nastavitve. Neshranjene spremembe niso vključene, zato aplikacija izdelavo paketa v takem stanju blokira.
- Na novem računalniku uporabnik namesti isto aplikacijo, izbere paket in vnese geslo. Po obnovitvi aplikacija izpiše število prenesenih dokumentov in priponk.
- Podatkov na starem računalniku ne briši, dokler nova odgovorna oseba ne preveri prenesene zgodovine.

Operativni kontrolni seznam je v [PREDAJA.md](./PREDAJA.md).

### Posodobitve

Datoteka `version.json` vsebuje trenutno javno različico in opombe ob izdaji. Aplikacija jo preveri ob zagonu, ob vrnitvi v zavihek in nato vsakih 15 minut. Ob novi različici pokaže obvestilo za osvežitev, po prvi uporabi nove različice pa modal **Kaj je novega**.

Različice v `package.json`, `version.json` in `src/app-version.js` morajo biti enake; `npm run check` to preveri.

## Brskalniški testi

```bash
npm run test:e2e
```

Playwright preveri glavne tokove v Chromiumu, Firefoxu in WebKitu: zaščito neshranjenih sprememb, shranjevanje in ponovno odpiranje, priponko v PDF-ju, tisk, uvoz CSV/XLSX, PIN ter varnostne kopije. GitHub Actions jih samodejno požene ob vsakem pushu na `main` in pri pull requestih.

## Opomba o tehnologiji

Projekt je samostojna progresivna spletna aplikacija brez klasičnega gradnika za uporabniški vmesnik. Skripte `npm` služijo za preverjanje, pripravo mape `dist/` in lokalni predogled. Vmesnik uporablja oblikovno logiko shadcn/Tailwind prek lokalnih žetonov CSS. Knjižnici `pdf-lib` in `lucide` se nalagata prek fiksno verzioniranih povezav CDN, servisni delavec pa ju po prvem obisku shrani v predpomnilnik.
