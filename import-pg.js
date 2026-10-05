// Imports scraped books from data.sqlite into the krestan Postgres DB
// (tables translations / books / verses, one set of book rows per translation).
//
//   node import-pg.js            all books present in data.sqlite
//   node import-pg.js 45         only Romans
//   DRY_RUN=1 node import-pg.js  run everything in a transaction and roll back
//
// Each book is replaced as a whole in its own transaction, so re-running is safe.
// Verses are renumbered to the versification of krestan's primary translation "ep"
// (see src/versification.js) so translations can be compared side by side;
// data.sqlite keeps the original NWT numbering. Omitted verses (Mt 17:21, ...) keep
// their number with text "––".
import pg from "pg";
import { openDb } from "./src/db.js";
import { loadMappings, remapBook } from "./src/versification.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5450/krestan_v2";
const TRANSLATION = { bsn: "jw", bname: "Preklad Svedkov Jehovových", lang: "sk", direction: "ltr" };
const dryRun = process.env.DRY_RUN === "1";

// Book codes used by krestan, indexed by NWT book number - 1
const BOOK_CODES = [
	"gen", "exo", "lev", "num", "deu", "jos", "jdg", "rut", "1sa", "2sa", "1ki", "2ki", "1ch", "2ch", "ezr", "neh", "est",
	"job", "psa", "pro", "ecc", "sol", "isa", "jer", "lam", "eze", "dan", "hos", "joe", "amo", "oba", "jon", "mic", "nah",
	"hab", "zep", "hag", "zec", "mal", "mat", "mar", "luk", "joh", "act", "rom", "1co", "2co", "gal", "eph", "phi", "col",
	"1th", "2th", "1ti", "2ti", "tit", "phm", "heb", "jam", "1pe", "2pe", "1jo", "2jo", "3jo", "jud", "rev",
];

const sqlite = openDb(process.env.DB_PATH ?? "data.sqlite");
const only = process.argv.slice(2).map(Number);
const books = sqlite
	.prepare("SELECT * FROM books ORDER BY num")
	.all()
	.filter((b) => !only.length || only.includes(b.num));
if (!books.length) throw new Error("No matching books in data.sqlite, run the scraper first");

const mappings = loadMappings();
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

async function translationId() {
	const found = await client.query("SELECT id FROM translations WHERE bsn = $1", [TRANSLATION.bsn]);
	if (found.rows.length) return found.rows[0].id;
	const { rows } = await client.query(
		`INSERT INTO translations (bsn, bname, lang, direction, study, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, false, now(), now()) RETURNING id`,
		[TRANSLATION.bsn, TRANSLATION.bname, TRANSLATION.lang, TRANSLATION.direction],
	);
	return rows[0].id;
}

// Book rows are not linked to a translation directly, only through verses.
async function upsertBook(tid, book) {
	const code = BOOK_CODES[book.num - 1];
	const found = await client.query(
		"SELECT DISTINCT b.id FROM books b JOIN verses v ON v.book_id = b.id WHERE v.translation_id = $1 AND b.book = $2",
		[tid, code],
	);
	if (found.rows.length > 1) throw new Error(`Translation ${tid} has several book rows for ${code}`);
	if (found.rows.length) {
		await client.query("UPDATE books SET fname = $2, sname = $3, chapters = $4, updated_at = now() WHERE id = $1", [
			found.rows[0].id, book.name, book.abbreviation, book.chapters,
		]);
		return found.rows[0].id;
	}
	const { rows } = await client.query(
		`INSERT INTO books (book, fname, sname, chapters, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, now(), now()) RETURNING id`,
		[code, book.name, book.abbreviation, book.chapters],
	);
	// "order" equals id for every other translation's book rows
	await client.query(`UPDATE books SET "order" = id WHERE id = $1`, [rows[0].id]);
	return rows[0].id;
}

try {
	const tid = await translationId();
	if (dryRun) await client.query("BEGIN");

	for (const [i, book] of books.entries()) {
		const source = sqlite.prepare("SELECT chapter, verse, text FROM verses WHERE book = ? ORDER BY chapter, verse").all(book.num);
		const scraped = new Set(source.map((v) => v.chapter)).size;
		if (scraped !== book.chapters) console.warn(`  ${book.code}: v data.sqlite je ${scraped}/${book.chapters} kapitol`);
		const verses = remapBook(book.num, source, mappings);
		book.chapters = Math.max(...verses.map((v) => v.chapter));

		if (!dryRun) await client.query("BEGIN");
		const bookId = await upsertBook(tid, book);
		await client.query("DELETE FROM verses WHERE translation_id = $1 AND book_id = $2", [tid, bookId]);
		await client.query(
			`INSERT INTO verses (chapter, verse, context, translation_id, book_id, created_at, updated_at)
			 SELECT c, v, t, $4, $5, now(), now() FROM unnest($1::int[], $2::int[], $3::text[]) AS x(c, v, t)`,
			[verses.map((v) => v.chapter), verses.map((v) => v.verse), verses.map((v) => v.text), tid, bookId],
		);
		if (!dryRun) await client.query("COMMIT");
		console.log(`[${i + 1}/${books.length}] ${book.name} → books.id ${bookId}, ${verses.length} veršov`);
	}

	if (dryRun) {
		await client.query("ROLLBACK");
		console.log("DRY_RUN: nič nebolo zapísané");
	}
} catch (err) {
	await client.query("ROLLBACK");
	throw err;
} finally {
	await client.end();
	sqlite.close();
}
