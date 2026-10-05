// Lists chapters where the imported "jw" translation does not line up with another
// translation in the krestan DB (by last verse number per chapter).
//
//   node check-alignment.js          compare with "ep"
//   node check-alignment.js sevp
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5450/krestan_v2";
const other = process.argv[2] ?? "ep";

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const { rows } = await client.query(
	`WITH last AS (
		SELECT t.bsn, b.book, MIN(b."order") AS ord, v.chapter, MAX(v.verse) AS last_verse
		FROM verses v JOIN books b ON b.id = v.book_id JOIN translations t ON t.id = v.translation_id
		WHERE t.bsn IN ('jw', $1)
		GROUP BY t.bsn, b.book, v.chapter
	)
	SELECT j.book, j.chapter, j.last_verse AS jw, o.last_verse AS other
	FROM last j JOIN last o ON o.book = j.book AND o.chapter = j.chapter AND o.bsn = $1
	WHERE j.bsn = 'jw' AND j.last_verse <> o.last_verse
	ORDER BY j.ord, j.chapter`,
	[other],
);
const { rows: [stats] } = await client.query(
	`SELECT COUNT(DISTINCT (b.book, v.chapter)) AS chapters FROM verses v
	 JOIN books b ON b.id = v.book_id JOIN translations t ON t.id = v.translation_id WHERE t.bsn = 'jw'`,
);
await client.end();

for (const r of rows) console.log(`${r.book} ${r.chapter}: jw ${r.jw}, ${other} ${r.other}`);
console.log(`${rows.length} z ${stats.chapters} kapitol jw sa líši od ${other}`);
