// Converts NWT (English) versification to the one used by krestan's primary
// translation "ep" (Hebrew/BHS numbering in the OT), so verses line up side by side.
//
// Mappings come from .vrs files in Paratext format: "PSA 3:0-8 = PSA 3:1-9",
// left side English, right side target. Later files override earlier ones.
import { readFileSync } from "node:fs";

// USFM book codes indexed by NWT book number - 1
export const USFM_CODES = [
	"GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST",
	"JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM",
	"HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
	"1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

const LINE = /^([1-3A-Z]{3}) (\d+):(\d+)(?:-(\d+))? = ([1-3A-Z]{3}) (\d+):(\d+)(?:-(\d+))?\s*$/;
const range = (from, to) => Array.from({ length: (to ?? from) - from + 1 }, (_, i) => from + i);

// -> Map "PSA 51:0" -> [{ book, chapter, verse }, ...] (several targets = one verse split in the target)
export function parseVrsMappings(text, into = new Map()) {
	const fresh = new Set();
	for (const line of text.split("\n")) {
		const m = line.match(LINE);
		if (!m || !USFM_CODES.includes(m[1]) || !USFM_CODES.includes(m[5])) continue; // comments, apocrypha
		const [, sBook, sCh, sFrom, sTo, tBook, tCh, tFrom, tTo] = m;
		const src = range(Number(sFrom), sTo && Number(sTo));
		const tgt = range(Number(tFrom), tTo && Number(tTo));
		src.forEach((v, i) => {
			const key = `${sBook} ${sCh}:${v}`;
			// a source verse listed again in the same file adds a target; in a later file it replaces them
			if (!fresh.has(key)) into.set(key, []);
			fresh.add(key);
			const targets = src.length === tgt.length ? [tgt[i]] : src.length === 1 ? tgt : [tgt[tgt.length - 1]];
			for (const t of targets) into.get(key).push({ book: tBook, chapter: Number(tCh), verse: t });
		});
	}
	return into;
}

export function loadMappings(files = ["eng.vrs", "nwt.vrs"]) {
	const map = new Map();
	for (const f of files) parseVrsMappings(readFileSync(new URL(`../versification/${f}`, import.meta.url), "utf8"), map);
	return map;
}

// verses: [{ chapter, verse, text }] in NWT numbering -> same shape in target numbering.
// Several source verses landing on one target verse are joined; a source verse split
// over several targets goes whole into the first one. An unmapped psalm title
// (verse 0) belongs to verse 1, as in the Hebrew text.
export function remapBook(bookNum, verses, mappings) {
	const code = USFM_CODES[bookNum - 1];
	const out = new Map();
	for (const v of verses) {
		const [target] = mappings.get(`${code} ${v.chapter}:${v.verse}`) ?? [
			{ book: code, chapter: v.chapter, verse: v.verse === 0 ? 1 : v.verse },
		];
		if (target.book !== code) throw new Error(`Cross-book mapping ${code} ${v.chapter}:${v.verse} is not supported`);
		const key = `${target.chapter}:${target.verse}`;
		const entry = out.get(key) ?? { chapter: target.chapter, verse: target.verse, parts: [] };
		entry.parts.push(v.text);
		out.set(key, entry);
	}
	return [...out.values()]
		.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
		.map(({ chapter, verse, parts }) => ({ chapter, verse, text: parts.filter((p) => p !== "––").join(" ") || "––" }));
}
