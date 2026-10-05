// Polite HTTP client: fixed delay between requests, retries with backoff.
const USER_AGENT = "bible_jworg_sk scraper (+https://github.com/erikmeliska/bible_jworg_sk)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createFetcher({ delayMs = 1000, retries = 3 } = {}) {
	let last = 0;

	return async function fetchHtml(url) {
		for (let attempt = 1; ; attempt++) {
			const wait = last + delayMs - Date.now();
			if (wait > 0) await sleep(wait);
			last = Date.now();

			try {
				const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
				if (res.ok) return await res.text();
				// 4xx other than 429 will not get better by retrying
				if (res.status < 500 && res.status !== 429) throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { fatal: true });
				throw new Error(`HTTP ${res.status} ${url}`);
			} catch (err) {
				if (err.fatal || attempt > retries) throw err;
				console.warn(`  ${err.message}, retry ${attempt}/${retries}`);
				await sleep(delayMs * 2 ** attempt);
			}
		}
	};
}
