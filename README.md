# bible_jworg_sk

Scraper slovenského Prekladu nového sveta (PNS) z [wol.jw.org](https://wol.jw.org/sk/wol/binav/r38/lp-v) do SQLite a import do databázy aplikácie krestan.sk ako preklad `jw`, zarovnaný tak, aby sa verše dali porovnávať vedľa seba s ostatnými prekladmi. Pôvodne šablóna pre [morph.io](https://morph.io/documentation).

> Pred zverejnením dát si prečítaj podmienky používania jw.org – obmedzujú automatizované sťahovanie a ďalšie šírenie obsahu.

## Stav

- Stiahnutá celá Biblia: 66 kníh, 1189 kapitol, 31 194 veršov + poznámky pod čiarou (`data.sqlite`, mimo gitu).
- Naimportovaná do lokálnej `krestan_v2` (OrbStack) ako preklad `jw`, prečíslovaná na versifikáciu `ep`.

## Použitie

Vyžaduje Node.js ≥ 22.13 (vstavaný `node:sqlite`).

```sh
npm install
npm start                 # stiahnuť všetkých 66 kníh (1189 kapitol, pri 1 s pauze cca 20 min)
npm start -- 57 19        # len vybrané knihy (čísla 1–66)
npm run import            # preniesť data.sqlite do krestan DB
npm run check             # skontrolovať zarovnanie s ep
npm test                  # testy parsera a prečíslovania
```

### Sťahovanie

Scraper najprv zistí počty kapitol všetkých kníh, potom sťahuje kapitolu po kapitole a pri každej vypíše priebeh:

```
[ 312/1189  26.2% | ešte ~15 min] Ž 45: 17 veršov
```

Chyby sú v riadku označené `CHYBA`. Už stiahnuté kapitoly sa preskakujú, takže prerušený alebo čiastočne neúspešný beh stačí spustiť znova. Na pozadí:

```sh
npm start > scrape.log 2>&1 &
tail -f scrape.log
```

| Premenná   | Predvolené    | Význam                                |
|------------|---------------|---------------------------------------|
| `DELAY_MS` | `1000`        | pauza medzi requestmi                 |
| `FORCE`    | –             | `1` = stiahnuť aj existujúce kapitoly |
| `DB_PATH`  | `data.sqlite` | cesta k databáze                      |

### Dáta v `data.sqlite`

Pôvodné číslovanie PNS, tak ako je na wol.jw.org:

- `books(num, name, abbreviation, code, chapters)`
- `verses(book, chapter, verse, text)` – `verse = 0` je nadpis žalmu
- `footnotes(book, chapter, verse, seq, text)`

Vynechané verše (Mt 17:21, Sk 8:37, Rim 16:24 …) majú svoje číslo a text `––`. Mk 16:9–20 a Ján 7:53–8:11 v PNS nie sú vôbec (Ján 8 začína veršom 12).

```sh
sqlite3 data.sqlite "SELECT text FROM verses WHERE book = 43 AND chapter = 3 AND verse = 16"
```

## Import do krestan DB (Postgres)

`import-pg.js` prenesie knihy z `data.sqlite` do DB aplikácie krestan.sk (`krestan_v2`, kontajner `krestan-db-dev` v OrbStacku) ako preklad `bsn = 'jw'`.

```sh
npm run import            # všetky knihy z data.sqlite (pár sekúnd, priebeh [n/66])
npm run import -- 45      # len Rimanom
DRY_RUN=1 npm run import  # všetko v transakcii, na konci rollback
```

- `DATABASE_URL`, predvolene `postgresql://postgres:password@localhost:5450/krestan_v2`.
- Formát DB: `translations` → `verses(chapter, verse, context, translation_id, book_id)` → `books`. Každý preklad má v `books` vlastnú sadu riadkov (kód `gen`…`rev`, `"order" = id`). Kniha sa spáruje cez existujúce verše prekladu, inak sa vytvorí nová.
- Kniha sa nahrádza celá v jednej transakcii, opakovaný beh nič neduplikuje.
- Poznámky pod čiarou DB nemá, ostávajú len v `data.sqlite`.
- Aplikácia v2 zobrazí každý preklad, ktorý má aspoň jeden verš, `published_at` neberie do úvahy.

### Versifikácia a porovnanie vedľa seba

Preklady v krestan DB sa porovnávajú podľa (kniha, kapitola, verš). PNS čísluje Starý zákon anglicky, primárny preklad `ep` hebrejsky, preto import verše prečísluje na versifikáciu `ep` (`src/versification.js`):

- `versification/eng.vrs` – štandardné mapovanie anglickej versifikácie na hebrejskú (Paratext): nadpis žalmu sa stane veršom 1 a ďalšie verše sa posunú, Gn 31:55 → 32:1, Mal 4 → Mal 3:19–24, Joel 2:28 → 3:1 atď.
- `versification/nwt.vrs` – doplnkové pravidlá PNS → `ep` (1 Sam 20:42, Sk 19:40–41, 2 Kor 13:12–14), majú prednosť.
- Krátky nadpis žalmu bez mapovania (napr. Ž 23 „Dávidov žalm.“) sa spojí s veršom 1.
- Keď verš PNS pokrýva viac veršov cieľa, celý text ide do prvého z nich. Keď viac veršov PNS padne na jeden verš cieľa, texty sa spoja.

```sh
npm run check             # kapitoly, kde sa jw líši od ep počtom veršov
npm run check -- sevp     # alebo od iného prekladu
```

Zostávajúce rozdiely (29 kapitol oproti `ep`, 12 oproti `sevp`) sú zámerne neriešené:

- väčšina sú odchýlky samotného `ep` – napr. v Mt 17 vynechal verš 21 a ďalšie posunul, ostatné preklady v DB sa zhodujú s `jw`;
- Mk 16:9–20 a Ján 7:53–8:11 v PNS nie sú;
- 3 Jána 14/15, Zjv 12:17/18 a Num 25:18/19 – PNS má v jednom verši text, ktorý iné preklady delia na dva; druhý verš chýba (delenie podľa viet by bolo nespoľahlivé).

Porovnanie vedľa seba priamo v DB:

```sh
docker exec krestan-db-dev psql -U postgres -d krestan_v2 -c "
  SELECT v.verse, t.bsn, v.context FROM verses v
  JOIN books b ON b.id = v.book_id JOIN translations t ON t.id = v.translation_id
  WHERE b.book = 'psa' AND v.chapter = 23 AND t.bsn IN ('jw', 'ep')
  ORDER BY v.verse, t.bsn DESC"
```

## Štruktúra

- `scraper.js` – CLI, prechádza knihy → kapitoly, vypisuje priebeh
- `src/parse.js` – čisté parsery HTML (cheerio)
- `src/fetch.js` – fetch s pauzou a opakovaním
- `src/db.js` – SQLite schéma a zápis (kapitola sa ukladá atomicky)
- `import-pg.js` – import do krestan Postgres DB
- `src/versification.js`, `versification/` – prečíslovanie PNS na versifikáciu `ep`
- `check-alignment.js` – kontrola zarovnania s iným prekladom
- `test/` – testy nad uloženými HTML stránkami v `test/fixtures`
