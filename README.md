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

Už stiahnuté kapitoly sa preskakujú, takže prerušený beh stačí spustiť znova.

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

## Štruktúra

- `scraper.js` – CLI, prechádza knihy → kapitoly
- `src/parse.js` – čisté parsery HTML (cheerio)
- `src/fetch.js` – fetch s pauzou a opakovaním
- `src/db.js` – schéma a zápis (kapitola sa ukladá atomicky)
