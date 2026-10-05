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

const selected = books.filter((b) => !only.length || only.includes(b.num));

// Chapter counts first, so the total is known and progress can be shown
for (const [i, book] of selected.entries()) {
	book.chapters = parseChapterCount(await fetchHtml(`${BASE}/binav/${PUB}/nwt/${book.num}`), book.num);
	saveBook(db, book);
	process.stdout.write(`\rZoznam kapitol: ${i + 1}/${selected.length} kníh`);
}
console.log();

const todo = selected.flatMap((book) =>
	Array.from({ length: book.chapters }, (_, i) => ({ book, chapter: i + 1 })).filter(
		({ chapter }) => force || !hasChapter(db, book.num, chapter),
	),
);
const total = selected.reduce((sum, b) => sum + b.chapters, 0);
console.log(`Kapitol spolu: ${total}, už stiahnutých: ${total - todo.length}, zostáva: ${todo.length}`);

const started = Date.now();
let failed = 0;
const progress = (done) => {
	const eta = Math.round((((Date.now() - started) / done) * (todo.length - done)) / 60000);
	const pct = ((done / todo.length) * 100).toFixed(1).padStart(5);
	return `[${String(done).padStart(String(todo.length).length)}/${todo.length} ${pct}% | ešte ~${eta} min]`;
};
for (const [i, { book, chapter }] of todo.entries()) {
	try {
		const verses = parseChapter(await fetchHtml(`${BASE}/b/${PUB}/nwt/${book.num}/${chapter}`), book.num, chapter);
		if (!verses.length) throw new Error("no verses parsed");
		saveChapter(db, book.num, chapter, verses);
		console.log(`${progress(i + 1)} ${book.code} ${chapter}: ${verses.length} veršov`);
	} catch (err) {
		failed++;
		console.error(`${progress(i + 1)} ${book.code} ${chapter}: CHYBA ${err.message}`);
	}
}

db.close();
if (failed) {
	console.error(`${failed} kapitol zlyhalo, spusti znova pre dokončenie.`);
	process.exitCode = 1;
}
