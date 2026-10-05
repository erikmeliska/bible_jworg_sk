// Scrapes the Slovak New World Translation from wol.jw.org into data.sqlite.
//
//   node scraper.js            all 66 books
//   node scraper.js 57 19      only Philemon and Psalms (book numbers 1-66)
//
// Already scraped chapters are skipped, so an interrupted run can simply be restarted.
// Set FORCE=1 to re-download them, DELAY_MS to change the pause between requests.
import { parseBooks, parseChapterCount, parseChapter } from "./src/parse.js";
import { createFetcher } from "./src/fetch.js";
import { openDb, saveBook, hasChapter, saveChapter } from "./src/db.js";

const BASE = "https://wol.jw.org/sk/wol";
const PUB = "r38/lp-v"; // Slovak library
const force = process.env.FORCE === "1";

const fetchHtml = createFetcher({ delayMs: Number(process.env.DELAY_MS ?? 1000) });
const db = openDb(process.env.DB_PATH ?? "data.sqlite");

const only = process.argv.slice(2).map(Number);
const books = parseBooks(await fetchHtml(`${BASE}/binav/${PUB}`));
if (books.length !== 66) throw new Error(`Expected 66 books, found ${books.length}`);

let failed = 0;
for (const book of books) {
	if (only.length && !only.includes(book.num)) continue;

	book.chapters = parseChapterCount(await fetchHtml(`${BASE}/binav/${PUB}/nwt/${book.num}`), book.num);
	saveBook(db, book);
	console.log(`${book.num}. ${book.name} (${book.chapters} kap.)`);

	for (let ch = 1; ch <= book.chapters; ch++) {
		if (!force && hasChapter(db, book.num, ch)) continue;
		try {
			const verses = parseChapter(await fetchHtml(`${BASE}/b/${PUB}/nwt/${book.num}/${ch}`), book.num, ch);
			if (!verses.some((v) => v.verse === 1)) throw new Error("no verses parsed");
			saveChapter(db, book.num, ch, verses);
			console.log(`  ${book.code} ${ch}: ${verses.length} veršov`);
		} catch (err) {
			failed++;
			console.error(`  ${book.code} ${ch}: CHYBA ${err.message}`);
		}
	}
}

db.close();
if (failed) {
	console.error(`${failed} kapitol zlyhalo, spusti znova pre dokončenie.`);
	process.exitCode = 1;
}
