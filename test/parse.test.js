import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBooks, parseChapterCount, parseChapter } from "../src/parse.js";

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

test("parseBooks reads all 66 books in order", () => {
	const books = parseBooks(fixture("binav.html"));
	assert.equal(books.length, 66);
	assert.deepEqual(books[0], { num: 1, name: "1. Mojžišova", abbreviation: "1. Mojž.", code: "1Mo" });
	assert.deepEqual(books.map((b) => b.num), Array.from({ length: 66 }, (_, i) => i + 1));
});

test("parseChapterCount", () => {
	assert.equal(parseChapterCount(fixture("binav-57.html"), 57), 1);
	assert.equal(parseChapterCount(fixture("binav-19.html"), 19), 150);
});

test("parseChapter strips verse numbers and cross-reference markers", () => {
	const verses = parseChapter(fixture("b-57-1.html"), 57, 1);
	assert.equal(verses.length, 25);
	assert.equal(
		verses[0].text,
		"Ja, Pavol, uväznený pre vieru v Krista Ježiša, spolu s bratom Timotejom, píšem tebe, nášmu milovanému spolupracovníkovi Filemonovi,",
	);
	assert.ok(verses.every((v) => !/[+*]/.test(v.text) && !/^\d/.test(v.text)));
});

test("parseChapter joins poetic segments and keeps the superscription as verse 0", () => {
	const verses = parseChapter(fixture("b-19-3.html"), 19, 3);
	assert.deepEqual(verses.map((v) => v.verse), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
	assert.equal(verses[0].text, "Dávidov žalm, keď utekal pred svojím synom Abšalómom.");
	assert.match(verses[1].text, /^Jehova, prečo mám toľko nepriateľov\? Prečo sa toľkí stavajú proti mne\?/);
});

test("parseChapter attaches footnotes to their verse", () => {
	const verses = parseChapter(fixture("b-1-1.html"), 1, 1);
	assert.equal(verses.length, 31);
	assert.equal(verses[0].text, "Na počiatku Boh stvoril nebo a zem.");
	assert.equal(verses[1].footnotes[0], "Al. „vzdúvajúcich sa vôd“.");
	assert.equal(verses[1].footnotes.length, 3);
});
