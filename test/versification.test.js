import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChapter } from "../src/parse.js";
import { loadMappings, parseVrsMappings, remapBook } from "../src/versification.js";

const mappings = loadMappings();
const v = (chapter, verse, text = `${chapter}:${verse}`) => ({ chapter, verse, text });
const refs = (verses) => verses.map((x) => `${x.chapter}:${x.verse}`);

test("psalm title (verse 0) becomes verse 1 and the rest shifts", () => {
	const html = readFileSync(new URL("fixtures/b-19-3.html", import.meta.url), "utf8");
	const out = remapBook(19, parseChapter(html, 19, 3).map((x) => ({ chapter: 3, ...x })), mappings);
	assert.deepEqual(refs(out), ["3:1", "3:2", "3:3", "3:4", "3:5", "3:6", "3:7", "3:8", "3:9"]);
	assert.equal(out[0].text, "Dávidov žalm, keď utekal pred svojím synom Abšalómom.");
	assert.match(out[1].text, /^Jehova, prečo mám toľko nepriateľov\?/);
});

test("two-verse psalm title goes whole into verse 1, verse 2 stays empty", () => {
	const out = remapBook(19, [v(51, 0, "title"), v(51, 1), v(51, 19)], mappings);
	assert.deepEqual(refs(out), ["51:1", "51:3", "51:21"]);
	assert.equal(out[0].text, "title");
});

test("unmapped short psalm title is joined with verse 1", () => {
	const out = remapBook(19, [v(25, 0, "Dávidov."), v(25, 1, "K tebe, Jehova,"), v(25, 2)], mappings);
	assert.deepEqual(refs(out), ["25:1", "25:2"]);
	assert.equal(out[0].text, "Dávidov. K tebe, Jehova,");
});

test("chapter boundaries move (Malachi 4, Joel 2-3)", () => {
	assert.deepEqual(refs(remapBook(39, [v(3, 18), v(4, 1), v(4, 6)], mappings)), ["3:18", "3:19", "3:24"]);
	assert.deepEqual(refs(remapBook(29, [v(2, 27), v(2, 28), v(3, 1)], mappings)), ["2:27", "3:1", "4:1"]);
});

test("verses without mapping keep their numbers, omitted placeholder stays", () => {
	const out = remapBook(45, [v(16, 23), v(16, 24, "––"), v(16, 25)], mappings);
	assert.deepEqual(out, [v(16, 23), v(16, 24, "––"), v(16, 25)]);
});

test("several source verses on one target are joined, later file overrides", () => {
	const map = parseVrsMappings("2CO 13:12 = 2CO 13:12\n2CO 13:13 = 2CO 13:12\n2CO 13:14 = 2CO 13:13\n");
	const out = remapBook(47, [v(13, 12, "a"), v(13, 13, "b"), v(13, 14, "c")], map);
	assert.deepEqual(out, [v(13, 12, "a b"), v(13, 13, "c")]);
	parseVrsMappings("2CO 13:14 = 2CO 13:14\n", map);
	assert.deepEqual(map.get("2CO 13:14"), [{ book: "2CO", chapter: 13, verse: 14 }]);
});
