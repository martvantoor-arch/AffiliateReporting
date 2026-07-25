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
openssl rand -hex 24   # zet dit bij CRON_SECRET (alleen nodig voor automatisch ophalen)

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

Zet `CRON_SECRET` in je `.env` (minimaal 16 tekens) en roep het endpoint
periodiek aan. Zonder dat geheim staat de automatische sync uit.

```bash
# elk uur
0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://jouw-app/api/cron/sync
```

Elke sync kijkt standaard **45 dagen terug**, niet alleen naar gisteren. Dat is
bewust: netwerken keuren transacties nog weken later goed of af, en door terug te
kijken volgt de app die statuswijzigingen. Een langere periode kun je meegeven
met `?lookbackDays=180` (maximaal 730). Verlopen sessies worden bij dezelfde run
opgeruimd.

Op Vercel kan het ook met `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/sync", "schedule": "0 * * * *" }] }
```

Let op: op Vercel is de standaard SQLite-opslag niet blijvend. Zie hieronder.

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

## Deployen

De app is een gewone Next.js-applicatie met SQLite.

```bash
npm ci
npm run setup     # prisma generate + db push
npm run build
npm start
```

**Waar staat de database?** Een relatief pad in `DATABASE_URL` rekent Prisma
vanaf de map `prisma/`. De standaardwaarde `file:./kasboek.db` geeft dus
`prisma/kasboek.db`. Zorg dat dat pad op opslag staat die bewaard blijft:

- **Eigen server of VPS**: werkt zo, met een back-up van dat bestand.
- **Docker**: mount een volume op de map met het `.db`-bestand.
- **Vercel en vergelijkbare serverless platforms**: het bestandssysteem is daar
  tijdelijk, dus SQLite raakt bij elke deploy kwijt. Wil je daar hosten, zet dan
  `provider = "postgresql"` in `prisma/schema.prisma` en gebruik een gehoste
  Postgres. Verder hoeft er niets te veranderen: alle queries lopen via Prisma.

Denk aan een back-up van `prisma/kasboek.db` én van je `ENCRYPTION_KEY`. Zonder
die sleutel is een back-up van de database maar de helft waard.

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
npm run db:studio  # database bekijken
```

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
  fx.ts              wisselkoersen van de ECB
  reporting.ts       de aggregatie waar het dashboard op leunt
  sync.ts            per account ophalen, normaliseren en opslaan
prisma/schema.prisma datamodel
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

### Bekende punten

- De rate limiter zit in het geheugen van één proces. Draai je meerdere
  instanties, gebruik dan een gedeelde store (Redis). De accountvergrendeling in
  de database werkt wel over instanties heen.
- `npm audit` meldt nog een paar adviezen in de ESLint-keten (via
  `brace-expansion`/`minimatch`). Die tooling draait alleen lokaal bij het linten
  en zit niet in de productiebundel; oplossen kan pas als ESLint zelf bijwerkt.
- De sync loopt de netwerken één voor één af. Met vijf netwerken duurt dat
  tientallen seconden; op een platform met een korte time-out op serverless
  functies kun je `?lookbackDays=` verlagen of per netwerk syncen.
