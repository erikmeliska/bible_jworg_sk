import { DatabaseSync } from "node:sqlite";

export function openDb(path = "data.sqlite") {
	const db = new DatabaseSync(path);
	db.exec(`
		CREATE TABLE IF NOT EXISTS books (
			num          INTEGER PRIMARY KEY,
			name         TEXT NOT NULL,
			abbreviation TEXT,
			code         TEXT,
			chapters     INTEGER
		);
		CREATE TABLE IF NOT EXISTS verses (
			book    INTEGER NOT NULL REFERENCES books(num),
			chapter INTEGER NOT NULL,
			verse   INTEGER NOT NULL, -- 0 = psalm superscription
			text    TEXT NOT NULL,
			PRIMARY KEY (book, chapter, verse)
		);
		CREATE TABLE IF NOT EXISTS footnotes (
			book    INTEGER NOT NULL,
			chapter INTEGER NOT NULL,
			verse   INTEGER NOT NULL,
			seq     INTEGER NOT NULL,
			text    TEXT NOT NULL,
			PRIMARY KEY (book, chapter, verse, seq)
		);
	`);
	return db;
}

export function saveBook(db, book) {
	db.prepare(
		`INSERT INTO books (num, name, abbreviation, code, chapters) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(num) DO UPDATE SET name = excluded.name, abbreviation = excluded.abbreviation,
		   code = excluded.code, chapters = COALESCE(excluded.chapters, books.chapters)`,
	).run(book.num, book.name, book.abbreviation, book.code, book.chapters ?? null);
}

export function hasChapter(db, book, chapter) {
	return !!db.prepare("SELECT 1 FROM verses WHERE book = ? AND chapter = ? LIMIT 1").get(book, chapter);
}

// Replaces a whole chapter atomically, so an interrupted run never leaves half a chapter.
export function saveChapter(db, book, chapter, verses) {
	const insVerse = db.prepare("INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)");
	const insNote = db.prepare("INSERT INTO footnotes (book, chapter, verse, seq, text) VALUES (?, ?, ?, ?, ?)");
	db.exec("BEGIN");
	try {
		db.prepare("DELETE FROM verses WHERE book = ? AND chapter = ?").run(book, chapter);
		db.prepare("DELETE FROM footnotes WHERE book = ? AND chapter = ?").run(book, chapter);
		for (const v of verses) {
			insVerse.run(book, chapter, v.verse, v.text);
			v.footnotes.forEach((text, i) => insNote.run(book, chapter, v.verse, i + 1, text));
		}
		db.exec("COMMIT");
	} catch (err) {
		db.exec("ROLLBACK");
		throw err;
	}
}
