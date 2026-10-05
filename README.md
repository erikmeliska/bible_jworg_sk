# bible_jworg_sk

Scraper slovenského Prekladu nového sveta z [wol.jw.org](https://wol.jw.org/sk/wol/binav/r38/lp-v) do SQLite. Pôvodne šablóna pre [morph.io](https://morph.io/documentation).

> Pred zverejnením dát si prečítaj podmienky používania jw.org – obmedzujú automatizované sťahovanie a ďalšie šírenie obsahu.

## Použitie

Vyžaduje Node.js ≥ 22.13 (vstavaný `node:sqlite`).

```sh
npm install
npm start            # všetkých 66 kníh (~1 200 kapitol, pri 1 s pauze cca 20 min)
npm start -- 57 19   # len vybrané knihy (čísla 1–66)
npm test             # testy parsera nad uloženými HTML v test/fixtures
```

Už stiahnuté kapitoly sa preskakujú, takže prerušený beh stačí spustiť znova. Pri každej kapitole sa vypíše priebeh, napr. `[ 312/1189  26.2% | ešte ~15 min] Ž 45: 17 veršov`. Pri behu na pozadí ho uložíš do logu a sleduješ cez `tail -f`:

```sh
npm start > scrape.log 2>&1 &
tail -f scrape.log
```

| Premenná  | Predvolené    | Význam                                 |
|-----------|---------------|----------------------------------------|
| `DELAY_MS`| `1000`        | pauza medzi requestmi                  |
| `FORCE`   | –             | `1` = stiahnuť aj existujúce kapitoly  |
| `DB_PATH` | `data.sqlite` | cesta k databáze                       |

## Dáta

- `books(num, name, abbreviation, code, chapters)`
- `verses(book, chapter, verse, text)` – `verse = 0` je nadpis žalmu
- `footnotes(book, chapter, verse, seq, text)`

```sh
sqlite3 data.sqlite "SELECT text FROM verses WHERE book = 43 AND chapter = 3 AND verse = 16"
```

## Import do krestan DB (Postgres)

`import-pg.js` prenesie knihy z `data.sqlite` do DB aplikácie krestan.sk (`krestan_v2`, kontajner `krestan-db-dev` v OrbStacku) ako preklad `bsn = 'jw'`.

```sh
npm run import            # všetky knihy z data.sqlite
npm run import -- 45      # len Rimanom
DRY_RUN=1 npm run import  # všetko v transakcii, na konci rollback
```

- `DATABASE_URL`, predvolene `postgresql://postgres:password@localhost:5450/krestan_v2`
- Každý preklad má v `books` vlastnú sadu riadkov (kód `gen`…`rev`, `"order" = id`). Kniha sa spáruje cez existujúce verše prekladu, inak sa vytvorí nová.
- Kniha sa nahrádza celá v jednej transakcii, opakovaný beh nič neduplikuje.
- Verše sa pri importe prečíslujú na versifikáciu primárneho prekladu `ep`, aby sa dali porovnávať vedľa seba (`src/versification.js`). `data.sqlite` si drží pôvodné číslovanie PNS.
  - Starý zákon: mapovanie anglickej versifikácie na hebrejskú z `versification/eng.vrs` (Paratext). Nadpis žalmu (v PNS verš 0) sa stane veršom 1, Mal 4 → Mal 3:19–24, Joel 2:28 → 3:1 atď.
  - Doplnkové pravidlá PNS → `ep` sú vo `versification/nwt.vrs` (rovnaký formát, má prednosť).
  - Keď verš PNS pokrýva viac veršov cieľa, celý text ide do prvého z nich. Keď viac veršov PNS padne na jeden verš cieľa, texty sa spoja.
  - `npm run check` (prípadne `npm run check -- sevp`) vypíše kapitoly, kde sa `jw` po importe líši od iného prekladu.
- Vynechané verše majú text `––`, Mk 16:9–20 a Ján 7:53–8:11 chýbajú. Poznámky pod čiarou DB nemá, ostávajú len v `data.sqlite`.
- Aplikácia v2 zobrazí každý preklad, ktorý má aspoň jeden verš, `published_at` neberie do úvahy.

## Štruktúra

- `scraper.js` – CLI, prechádza knihy → kapitoly
- `src/parse.js` – čisté parsery HTML (cheerio)
- `src/fetch.js` – fetch s pauzou a opakovaním
- `src/db.js` – schéma a zápis (kapitola sa ukladá atomicky)
- `import-pg.js` – import do krestan Postgres DB
- `src/versification.js`, `versification/` – prečíslovanie PNS na versifikáciu `ep`
- `check-alignment.js` – kontrola zarovnania s iným prekladom
