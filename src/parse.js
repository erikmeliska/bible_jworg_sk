// Pure HTML parsers for wol.jw.org Bible pages. No network, no DB.
import * as cheerio from "cheerio";

const clean = (s) => s.replace(/\s+/g, " ").trim();

// Bible index (/wol/binav/...) -> [{ num, name, abbreviation, code }]
export function parseBooks(html) {
	const $ = cheerio.load(html);
	return $("a.bookLink")
		.map((_, el) => {
			const a = $(el);
			return {
				num: Number(a.attr("data-bookid")),
				name: clean(a.find(".name").text()),
				abbreviation: clean(a.find(".abbreviation").text()),
				code: clean(a.find(".official").text()),
			};
		})
		.get()
		.sort((x, y) => x.num - y.num);
}

// Book page (/wol/binav/.../nwt/<book>) -> number of chapters
export function parseChapterCount(html, bookNum) {
	const $ = cheerio.load(html);
	const re = new RegExp(`/wol/b/[^/]+/[^/]+/nwt/${bookNum}/(\\d+)$`);
	const chapters = new Set();
	$("a[href]").each((_, el) => {
		const m = $(el).attr("href").match(re);
		if (m) chapters.add(Number(m[1]));
	});
	return chapters.size ? Math.max(...chapters) : 0;
}

// Chapter page (/wol/b/.../nwt/<book>/<chapter>) -> [{ verse, text, footnotes: [text] }]
// Verse spans have id "v<book>-<chapter>-<verse>-<segment>"; a verse split across
// poetic lines or paragraphs has several segments. Verse 0 is a psalm superscription.
export function parseChapter(html, bookNum, chapter) {
	const $ = cheerio.load(html);

	const footnoteText = new Map();
	$("li.footnote[data-extract-id^='verseFootnote-']").each((_, el) => {
		const id = $(el).attr("data-extract-id").slice("verseFootnote-".length);
		footnoteText.set(id, clean($(el).find("p").text()));
	});

	const prefix = `v${bookNum}-${chapter}-`;
	const verses = new Map();
	$(`span.v[id^='${prefix}']`).each((_, el) => {
		const span = $(el);
		const [verseNum] = span.attr("id").slice(prefix.length).split("-").map(Number);
		const verse = verses.get(verseNum) ?? { verse: verseNum, parts: [], footnotes: [] };

		span.find("a.fn").each((_, fn) => {
			const text = footnoteText.get($(fn).attr("data-fnid"));
			if (text) verse.footnotes.push(text);
		});

		const copy = span.clone();
		copy.find("a.vl, a.cl, a.b, a.fn").remove(); // verse/chapter numbers, cross-ref "+", footnote "*"
		verse.parts.push(copy.text());
		verses.set(verseNum, verse);
	});

	return [...verses.values()]
		.sort((a, b) => a.verse - b.verse)
		.map(({ verse, parts, footnotes }) => ({ verse, text: clean(parts.join(" ")), footnotes }));
}
