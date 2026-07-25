# Kasboek — affiliate-inkomsten op één plek

Een mobiel-vriendelijke webapp die je inkomsten uit **Daisycon, TradeTracker,
TradeDoubler, bol.com en Awin** ophaalt en samenbrengt in één overzicht met
grafieken en trends. Je logt veilig in, de app haalt periodiek je transacties op
en je ziet in één oogopslag wat er binnenkomt, wat nog in behandeling is en of je
voor of achter loopt op de vorige periode.

Alles draait op je eigen server. Er gaat geen data naar derden, behalve de
netwerken zelf en de ECB voor wisselkoersen.

## Inhoud

- [Wat je krijgt](#wat-je-krijgt)
- [Snel starten](#snel-starten)
- [Netwerken koppelen](#netwerken-koppelen)
- [Automatisch ophalen](#automatisch-ophalen)
- [Beveiliging](#beveiliging)
- [Als je jezelf buitensluit](#als-je-jezelf-buitensluit)
- [Deployen](#deployen)
- [Een netwerk toevoegen](#een-netwerk-toevoegen)
- [Ontwikkelen](#ontwikkelen)

## Wat je krijgt

**Overzicht.** Eén groot getal bovenaan: je verwachte inkomsten (goedgekeurd plus
in behandeling) over de gekozen periode, met het verschil ten opzichte van de
even lange periode ervoor. Daaronder tegels voor goedgekeurd, in behandeling,
aantal transacties en je afkeurpercentage. Heb je clickdata, dan komen daar
clicks, omzet, opbrengst per click en conversie bij.

**Grafieken.**

| Grafiek | Wat je ziet |
|---|---|
| Commissie per periode | Gestapelde staven per dag, week of maand, uitgesplitst per netwerk |
| Deze periode tegen de vorige | Twee lijnen op één as, met een schakelaar naar cumulatief |
| Wat brengt elk netwerk op | Gerangschikte staven met bedrag, aandeel en verschil met vorige periode |
| Beste programma's | Je acht sterkste programma's op verwachte commissie |

De periode wordt automatisch per dag, week of maand gegroepeerd, afhankelijk van
hoe lang hij is. Elke grafiek heeft een tabelweergave, tooltips die met de muis
én met de pijltjestoetsen werken, en werkt in licht en donker.

**Praktisch.** Meerdere valuta worden omgerekend naar euro met de dagkoersen van
de ECB. Transacties worden idempotent bijgewerkt: een netwerk dat een transactie
later goedkeurt of afkeurt, past de bestaande regel aan in plaats van een tweede
regel toe te voegen. Werkt een API niet mee, dan is er CSV-import.

## Snel starten

Je hebt Node.js 20 of nieuwer nodig.

```bash
# 1. Afhankelijkheden
npm install

# 2. Geheimen aanmaken
cp .env.example .env
openssl rand -hex 32   # zet dit bij ENCRYPTION_KEY
openssl rand -hex 32   # zet dit bij SESSION_SECRET

# 3. Database aanmaken
npm run setup

# 4. Starten
npm run dev
```

Open <http://localhost:3000>. Het eerste account maak je aan via
**Account aanmaken**; daarna is registreren dicht. Wil je later nog een account
kunnen aanmaken, zet dat e-mailadres dan in `ALLOWED_SIGNUP_EMAILS`.

Wil je eerst zien hoe het overzicht eruitziet zonder je echte sleutels in te
voeren:

```bash
npm run demo -- jouw@email.nl
```

Dat vult 180 dagen aan verzonnen transacties over alle vijf netwerken. De
demo-accounts staan uitgezet, dus een sync raakt ze niet. Je verwijdert ze weer
via **Netwerken → Bewerken → Dit account verwijderen**.

## Netwerken koppelen

Ga naar **Netwerken**, kies een netwerk en vul je gegevens in. Klik daarna op
**Verbinding testen**: die doet één lichte aanroep en vertelt je precies wat er
misgaat als iets niet klopt. Vaak krijg je de gevonden publisher- of site-id's
terug, die je dan kunt invullen.

| Netwerk | Wat je nodig hebt | Waar je het vindt |
|---|---|---|
| **Awin** | Publisher-id + OAuth2-token | Awin-dashboard → Gereedschap → API-credentials |
| **Daisycon** | E-mail + wachtwoord, óf client-id + secret + refresh-token | [developers.daisycon.com](https://developers.daisycon.com/) |
| **TradeTracker** | Customer-id + webservice-passphrase | TradeTracker → Account → Webservice (eerst aanzetten) |
| **TradeDoubler** | Affiliate-id + report-token | TradeDoubler → Rapporten → Open rapport-API |
| **bol.com** | Client-id + client-secret | bol.com partneraccount |

### Eerlijk over de betrouwbaarheid per koppeling

De adapters zijn gebouwd op de gepubliceerde documentatie van elk netwerk, maar
ik heb geen live accounts om ze tegen te testen. Alleen **Awin** heeft een
stabiele, goed gedocumenteerde REST-API waar ik van de veldnamen uitga; die is
gemarkeerd als nagelopen. De andere vier staan als **"nog te verifiëren"** in de
app, met een waarschuwing erbij.

Wat dat praktisch betekent:

- De **structuur** staat: authenticatie, paginering, periodes opdelen,
  normaliseren en opslaan werken.
- De **veldnamen** kunnen bij jouw account anders heten. Elke adapter leest
  velden met meerdere mogelijke namen en negeert schrijfwijze en scheidingstekens,
  dus veel varianten vangt hij al op.
- Endpoints, rapportnamen en paden zijn **in de UI aan te passen** zonder de code
  aan te raken. Bij TradeDoubler kun je bijvoorbeeld de rapportnaam wijzigen, bij
  bol.com het rapport-pad en de accept-header.
- Mislukt een sync, dan blijft dat netjes bij dat ene netwerk: de andere
  netwerken worden gewoon bijgewerkt en de foutmelding van het netwerk komt
  letterlijk in de app te staan.

**Meerdere sites bij hetzelfde netwerk** koppel je als losse accounts: klik bij
het netwerk op *Nog een* en geef het een eigen naam. Elk account krijgt dan zijn
eigen sleutels, sync-status en foutmeldingen.

**Welke versie staat er live?** `GET /api/health` geeft naast de status ook de
korte commit-hash van de draaiende versie. Handig om te zien of een herstelde
fout al gedeployd is voordat je in de code gaat zoeken.

**Daisycon filtert op een datumsoort.** Je kiest bij het account of de app op
clickdatum, goedkeuringsdatum of laatst-gewijzigd filtert. Clickdatum is de
standaard: dan staat een transactie op de dag dat de bezoeker klikte, wat past
bij de grafieken. Wil je vooral latere goedkeuringen oppikken, kies dan
'laatst gewijzigd'.

**Clicks en impressies bij Awin** staan standaard uit. Awin rapporteert die
alleen als totaal over een periode, niet als reeks per dag, dus voor dagcijfers
is één API-aanroep per dag nodig. Zet je het aan, dan haalt de app hoogstens de
laatste 7 dagen op en heb je ook een regio nodig (bijvoorbeeld `NL`). Zonder dit
werken je commissies en alle grafieken gewoon; alleen de tegels "per click" en
"conversie" blijven leeg.

**bol.com verdient een aparte waarschuwing.** Het partnerprogramma wijzigt zijn
rapportage-endpoint met enige regelmaat en er is geen stabiele publieke
documentatie voor de affiliate-kant. De OAuth2-tokenwissel (`login.bol.com`) is
het deel waar ik zeker van ben; het rapport-pad is een aanname. Werkt het niet,
gebruik dan de CSV-import — voor bol.com is dat de betrouwbaarste route.

### CSV-import

Onder **Netwerken → CSV importeren** upload je een export van een netwerk. Nodig
zijn een datumkolom en een commissiekolom. Herkend worden onder andere `datum`,
`transactiedatum`, `commissie`, `vergoeding`, `provisie`, `omzet`, `status`,
`programma` en `valuta`, in het Nederlands en het Engels. Puntkomma, komma en tab
werken alle drie als scheidingsteken, en `1.234,56` en `1,234.56` worden beide
goed gelezen.

Zonder transactienummer in het bestand maakt de app zelf een id uit de inhoud van
de regel. Hetzelfde bestand twee keer importeren levert dus geen dubbele bedragen
op.

## Automatisch ophalen

**In productie doet de app dit zelf**, elk uur, zonder dat je een cron hoeft te
regelen. Dat werkt omdat de app als één langlopend proces draait. Het interval
pas je aan met `AUTO_SYNC_MINUTES` (minuten, minimaal 15); `0` zet het uit. In
development staat het altijd uit, zodat je tijdens het bouwen niet ongevraagd de
netwerken aanroept.

Elke ronde kijkt **45 dagen terug**, niet alleen naar gisteren. Dat is bewust:
netwerken keuren transacties nog weken later goed of af, en door terug te kijken
volgt de app die statuswijzigingen. Verlopen sessies worden bij dezelfde ronde
opgeruimd. Loopt een ronde langer dan het interval, dan wordt de volgende
overgeslagen in plaats van er dwars door te lopen.

### Liever een externe cron

Draai je meerdere instanties, dan zou elke instantie tegelijk gaan ophalen. Zet
`AUTO_SYNC_MINUTES=0`, zet `CRON_SECRET` (minimaal 16 tekens) en roep het
endpoint zelf aan:

```bash
# elk uur
0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://jouw-app/api/cron/sync
```

Zonder `CRON_SECRET` is dat endpoint uitgeschakeld. Een langere terugkijkperiode
geef je mee met `?lookbackDays=180` (maximaal 730). Heb je geen crontab, dan werkt
een dienst als cron-job.org of een GitHub Action met een `schedule` net zo goed —
het is één HTTP-aanroep.

## Beveiliging

Dit is een app met je financiële gegevens erin, dus:

- **Wachtwoorden** worden gehasht met scrypt en een eigen salt per wachtwoord.
- **API-sleutels** staan versleuteld in de database met AES-256-GCM. GCM is
  geauthenticeerd: gerommel in de database wordt bij het lezen gedetecteerd. Na
  opslaan zijn sleutels niet meer op te vragen, ook niet door jou — bij bewerken
  laat je het veld leeg om de bestaande waarde te behouden.
- **Sessies** zitten in een httpOnly-cookie (`secure` in productie, `sameSite=lax`).
  In de database staat alleen een HMAC van het token, met `SESSION_SECRET` als
  peper: een gestolen database levert dus geen werkende sessies op.
- **Tweestapsverificatie** (TOTP) kun je aanzetten op de accountpagina, met acht
  eenmalige herstelcodes. Die codes worden gehasht bewaard.
- **Brute force**: na 8 mislukte pogingen gaat het account 15 minuten op slot, en
  er zit een rate limiter per IP op inloggen, registreren en de 2FA-stap.
  Onbekend e-mailadres en verkeerd wachtwoord geven dezelfde melding en kosten
  evenveel tijd, zodat je hier geen accounts kunt aftasten.
- **Registratie** sluit zichzelf na het eerste account.
- De app zet `robots: noindex`.

Verlies `ENCRYPTION_KEY` niet: zonder die sleutel zijn de opgeslagen credentials
onleesbaar en moet je ze opnieuw invoeren. Wijzig je `SESSION_SECRET`, dan is
iedereen uitgelogd.

Zet de app achter HTTPS. Zonder TLS gaan je wachtwoord en sessiecookie in
leesbare vorm over de lijn.

## Als je jezelf buitensluit

Er is geen wachtwoord-herstel via e-mail — de app stuurt geen mail, en een
herstelknop op internet zou een achterdeur zijn in een app met je financiële
gegevens. In plaats daarvan is er een beheerscript, te draaien op de machine
waar de database staat:

```bash
npm run admin -- lijst                     # welke accounts zijn er
npm run admin -- wachtwoord jij@mail.nl    # nieuw wachtwoord, wordt getoond
npm run admin -- tweestaps-uit jij@mail.nl # authenticator kwijt
npm run admin -- verwijder jij@mail.nl     # account en al zijn gegevens weg
```

`wachtwoord` en `tweestaps-uit` verwijderen ook alle actieve sessies, dus
apparaten die nog ingelogd waren zijn dat daarna niet meer. `verwijder` haalt
via de database-cascade ook de netwerkkoppelingen en transacties weg; is het
laatste account weg, dan laat de app weer een registratie toe.

Op Railway kom je met `railway ssh` in de container en geef je daar hetzelfde
commando. Wil je liever helemaal opnieuw beginnen, dan kun je ook het volume
verwijderen in Railway: bij de volgende start maakt de app een lege database
aan en staat registreren weer open.

## Deployen

De app draait als gewone Next.js-applicatie op Node, met SQLite als database.
Dat is de route die werkt en die getest is.

### Railway (aanbevolen)

Railway bouwt de `Dockerfile` uit deze repo; `railway.json` zet de healthcheck en
het herstartbeleid al goed. Wat je zelf doet:

**1. Project aanmaken.** *New Project → Deploy from GitHub repo*, kies deze repo
en de branch. Railway ziet de `Dockerfile` en begint te bouwen. Laat die eerste
build gerust mislukken of half af zijn; we zetten eerst de rest goed.

**2. Volume toevoegen — doe dit vóórdat je de app gaat gebruiken.** Zonder volume
staat je database in de container en ben je hem bij de volgende deploy kwijt. In
het project:

- Druk **⌘K** (of Ctrl+K) en kies de optie om een volume aan te maken. Rechtsklikken
  op het projectcanvas werkt ook — daar staat dezelfde optie in het menu.
- Railway vraagt aan welke service het volume moet hangen; kies je app-service.
- Zet het **mount path** op `/data`.

Het volume wordt bij het starten van de container aangekoppeld, niet tijdens de
build. Een service met een volume kan niet twee deployments tegelijk actief
hebben, dus bij elke nieuwe deploy is er even downtime. Dat is normaal.

**3. Variabelen zetten** onder *Variables*:

| Variabele | Waarde |
|---|---|
| `DATABASE_URL` | `file:/data/kasboek.db` |
| `ENCRYPTION_KEY` | uitvoer van `openssl rand -hex 32` |
| `SESSION_SECRET` | uitvoer van `openssl rand -hex 32` |
| `APP_TIMEZONE` | `Europe/Amsterdam` |
| `RAILWAY_RUN_UID` | `0` |

Die laatste heeft uitleg nodig. Railway koppelt een volume aan als eigendom van
root, dus een container die meteen als gewone gebruiker start kan er niets in
schrijven. Met `RAILWAY_RUN_UID=0` start de container als root; de entrypoint zet
dan de rechten op `/data` goed en zakt daarna zelf terug naar een onbevoorrechte
gebruiker (uid 10001). De app draait dus alsnog niet als root.

`PORT` zet Railway zelf. `AUTO_SYNC_MINUTES` kun je weglaten, want 60 is de
standaard, en een `CRON_SECRET` heb je niet nodig — de app haalt zijn cijfers zelf
op.

**4. Domein aanzetten** onder *Settings → Networking → Generate Domain*. Railway
regelt HTTPS.

**5. Openen en je account aanmaken.** Daarna gaat registreren automatisch dicht.

Je hebt dus **geen tweede service voor een cron** nodig: de planner loopt in het
app-proces mee. Laat `numReplicas` daarom op 1 staan — bij meerdere instanties
zouden ze allemaal tegelijk gaan ophalen.

Zet `ENCRYPTION_KEY` ook in je wachtwoordmanager. Raak je die kwijt, dan zijn de
opgeslagen API-sleutels onleesbaar en moet je ze opnieuw invoeren.

### Docker (eigen server of NAS)

```bash
docker build -t kasboek .
docker run -d --name kasboek -p 3000:3000 \
  -v kasboek-data:/data \
  -e DATABASE_URL="file:/data/kasboek.db" \
  -e ENCRYPTION_KEY="…" \
  -e SESSION_SECRET="…" \
  kasboek
```

Het volume `/data` houdt de database vast; bij het opstarten zet de app het
schema klaar. De container start als root om de rechten op het volume goed te
zetten en draait de app daarna als uid 10001. Zet er een reverse proxy met TLS
voor (Caddy of Traefik regelt een certificaat automatisch).

### Zonder Docker

```bash
npm ci
npm run setup     # client genereren + tabellen aanmaken
npm run build
npm start
```

**Waar staat de database?** `DATABASE_URL` wordt gerekend vanaf de map waar je
de app start, niet vanaf `prisma/`. De standaardwaarde
`file:./prisma/kasboek.db` geeft dus een bestand in de map `prisma/`. Zorg dat
dat pad op opslag staat die bewaard blijft, en maak er back-ups van — samen met
je `ENCRYPTION_KEY`, want zonder die sleutel is een back-up van de database maar
de helft waard.

Wil je liever Postgres (bijvoorbeeld omdat je al een database hebt), dan is dat
een kleine ingreep: zet `provider = "postgresql"` in `prisma/schema.prisma` en
wissel in `lib/db.ts` en `prisma.config.ts` de SQLite-adapter om voor
`@prisma/adapter-pg`. Alle queries lopen via Prisma, dus verder verandert er
niets.

### Cloudflare Workers: werkt nu niet

Er staat een `wrangler.jsonc` en een D1-koppeling in de repo, en die is af — maar
**de app draait op dit moment niet op Cloudflare Workers.** Dat is geen kwestie
van configuratie: het loopt vast op een openstaande bug in Prisma zelf.

Wat er precies gebeurt:

| Stap | Uitkomst |
|---|---|
| `npm run cf:build` | slaagt, bundel is 2,2 MB gzip (ruim onder de limiet) |
| Alles behalve de database | werkt: scrypt, AES-256-GCM, TOTP en tijdzones zijn in workerd getest |
| Eerste databasequery | `WebAssembly.Module(): Wasm code generation disallowed by embedder` |

Prisma 7 compileert zijn WASM-querycompiler op runtime, en dat verbiedt
Cloudflare. Prisma heeft daar een `runtime = "workerd"`-stand voor die de WASM als
module importeert (`scripts/generate-prisma.mjs` zet die), maar die import
overleeft de bundeling door Next en OpenNext niet. Zie
[prisma/prisma#28657](https://github.com/prisma/prisma/issues/28657) en
[opennextjs-cloudflare#471](https://github.com/opennextjs/opennextjs-cloudflare/issues/471).
Prisma 6 helpt hier niet: dan valt de client terug op de native engine, die op
Workers per definitie niet bestaat.

Twee manieren vooruit, mocht je Cloudflare echt willen:

1. **Wachten.** Zodra Prisma die bug oplost, is het waarschijnlijk genoeg om
   Prisma bij te werken en `npm run cf:deploy` te draaien. De D1-plumbing (de
   binding, `lib/db.ts`, de migraties in `migrations/`) ligt klaar.
2. **Prisma laten vallen voor D1** en de queries als SQL tegen `env.DB` schrijven.
   Dat werkt zeker, geeft een kleine bundel en snelle koude starts, maar het is
   een herschrijving van de datalaag (ongeveer vijftien plekken).

Los daarvan zijn er twee dingen om te weten over Workers en deze app: uitgaande
requests zijn per aanroep begrensd (50 op het gratis plan), wat bij vijf
netwerken met paginering krap kan worden — daarom staat de paginalimiet per
netwerk op 20. En een Worker heeft geen ingebouwde planner voor deze app, dus het
automatisch ophalen blijft een externe cron die `/api/cron/sync` aanroept.

Als de D1-koppeling ooit gebruikt wordt: `npx wrangler d1 create kasboek`, het
`database_id` in `wrangler.jsonc` zetten, `npm run d1:apply` voor de tabellen, en
de geheimen als `npx wrangler secret put ENCRYPTION_KEY` (idem `SESSION_SECRET`
en `CRON_SECRET`). Let op dat D1 geen transacties kent; de sync is daarom
opgebouwd uit losse idempotente upserts, zodat een half afgemaakte ronde zichzelf
herstelt.

## Een netwerk toevoegen

De netwerken zitten achter één interface, dus een zesde toevoegen is klein werk:

1. Zet de id onderaan `NETWORK_IDS` in `lib/networks/types.ts`. **Onderaan**, want
   de kleur van een netwerk hangt aan zijn plek in die lijst — bovenaan
   toevoegen verschuift de kleuren van alle bestaande netwerken.
2. Voeg de naam toe aan `NETWORK_NAMES` in `lib/networks/meta.ts` en een
   kleurslot `--series-6` in `app/globals.css` (voor beide thema's).
3. Maak `lib/networks/jouwnetwerk.ts` met een `NetworkAdapter`: `fields`,
   `fetchTransactions` en `testConnection`. Kijk naar `awin.ts` voor een REST-API,
   `tradedoubler.ts` voor een rapport-API en `tradetracker.ts` voor SOAP.
4. Zet hem in de `adapters`-map in `lib/networks/index.ts`.

De rest — formulier, versleutelde opslag, verbindingstest, sync, grafieken,
filters — werkt dan automatisch mee. Bij meer dan acht netwerken moet je de
kleurenaanpak herzien: acht is het maximum dat nog met zekerheid te
onderscheiden is, ook voor kleurenblinde lezers.

## Ontwikkelen

```bash
npm run dev        # ontwikkelserver
npm test           # tests (datums/tijdzones, parsing, crypto, TOTP)
npm run lint       # ESLint
npm run build      # productiebuild, inclusief typecheck
npm run generate   # Prisma-client opnieuw genereren na een schemawijziging
npm run db:studio  # database bekijken
npm run admin      # accounts beheren (zie hierboven)
```

Wijzig je `prisma/schema.prisma`, dan draai je `npm run setup` (genereren én de
tabellen bijwerken). Voor D1 hoort daar ook een migratiebestand bij:
`npm run d1:migration > migrations/0002_iets.sql`.

### Hoe het in elkaar zit

```
app/                 pagina's en het cron-endpoint
components/
  charts/            eigen SVG-grafieken (geen grafiek-library)
  dashboard/         overzicht, filterrij, KPI-tegels
  networks/          koppelingen beheren, CSV-import
lib/
  auth/              sessies, TOTP, rate limiting, server actions
  networks/          één adapter per netwerk + gedeelde hulpmiddelen
  crypto.ts          AES-256-GCM en scrypt
  dates.ts           dagindeling met echte tijdzone-ondersteuning
  db.ts              kiest tussen lokaal SQLite en Cloudflare D1
  scheduler.ts       de ingebouwde planner voor automatisch ophalen
  fx.ts              wisselkoersen van de ECB
  reporting.ts       de aggregatie waar het dashboard op leunt
  sync.ts            per account ophalen, normaliseren en opslaan
instrumentation.ts   start de planner bij het opstarten van de server
migrations/          SQL-migraties voor D1 (wrangler)
prisma/schema.prisma datamodel
scripts/             Prisma-client genereren, en accountbeheer (admin.ts)
tests/               unit tests voor de foutgevoelige pure logica
```

### Keuzes die uitleg verdienen

**Dagen worden in jouw tijdzone geteld.** Een transactie van 00:30 Nederlandse
tijd hoort bij die dag, niet bij de dag ervoor in UTC. `lib/dates.ts` rekent dat
netjes om, inclusief de zomertijdovergangen; daar staan tests op.

**"Verwachte inkomsten" is goedgekeurd plus in behandeling.** Dat is het getal
waar je op stuurt. Goedgekeurd en in behandeling staan er los onder, en het
afkeurpercentage laat zien hoe betrouwbaar het cijfer is.

**Eigen SVG-grafieken, geen library.** Dat is bewust: de kleuren, de 2px
tussenruimte tussen gestapelde segmenten, de afgeronde uiteinden en de
toetsenbordbediening zijn precies zo te maken als bedoeld, zonder een grafiek-
library te overrulen.

**De kleuren zijn nagerekend, niet gekozen op gevoel.** De vijf reeksen zijn per
thema getoetst op onderscheidbaarheid bij kleurenblindheid en op contrast met de
achtergrond. Een netwerk houdt zijn kleur ook als je andere netwerken
wegfiltert — wie geleerd heeft dat bol.com geel is, ziet dat geel blijven.

**Eén filterrij boven alles.** Periode en netwerkselectie staan in de URL, dus je
kunt een specifieke weergave bewaren of delen. Alle grafieken kijken naar
dezelfde selectie.

**Prisma 7 met een driver adapter.** De gegenereerde client is TypeScript en de
verbinding loopt via een adapter (`better-sqlite3` lokaal, D1 op Cloudflare). Dat
betekent dat er geen native database-engine per platform hoeft te kloppen, en het
is de reden dat één codebase op beide kan draaien — zie `lib/db.ts`.

### Bekende punten

- De rate limiter zit in het geheugen van één proces. Draai je meerdere
  instanties, gebruik dan een gedeelde store (Redis). De accountvergrendeling in
  de database werkt wel over instanties heen.
- `npm audit` meldt adviezen in de ontwikkel- en bouwtooling: de ESLint-keten
  (via `brace-expansion`/`minimatch`), de Prisma-CLI (`@prisma/dev`,
  `find-my-way`, `valibot`) en `@opennextjs/cloudflare`. Alle drie staan in
  `devDependencies`; niets ervan zit in het pad dat een request afhandelt. De
  Prisma-CLI zit wel in het Docker-image, omdat de entrypoint `prisma db push`
  draait bij het opstarten — dat is een bewuste keuze, geen ongeluk. Oplossen kan
  pas als die pakketten zelf bijwerken.
- De sync loopt de netwerken één voor één af. Met vijf netwerken duurt dat
  tientallen seconden; op een platform met een korte time-out op serverless
  functies kun je `?lookbackDays=` verlagen of per netwerk syncen.
- Cloudflare Workers werkt nog niet, door een openstaande bug in Prisma. Zie
  [Deployen](#deployen) voor wat er precies gebeurt en welke twee routes er zijn.
- De `Dockerfile` is niet als image gebouwd: in de omgeving waar deze code is
  gemaakt was geen Docker-daemon beschikbaar. De stappen erin zijn wel los
  getest, inclusief de entrypoint tegen een root-eigen `/data`: rechten zetten,
  terugzakken naar uid 10001, schema aanmaken, en bij een tweede start de
  bestaande data ongemoeid laten.
