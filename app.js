const fs = require('fs');
const path = require('path');

function parseCsv(text) {
	const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
	if (lines.length < 3) throw new Error('CSV must have at least header, tickers, and one data row');

	const nameCols = lines[0].split(',').map(s => s.trim());
	const tickerCols = lines[1].split(',').map(s => s.trim());

	const bankNames = nameCols.slice(1);
	const tickers = tickerCols.slice(1);

	const dataLines = lines.slice(2);
	const years = [];
	const rows = dataLines.map(line => {
		const cols = line.split(',').map(s => s.trim());
		years.push(cols[0]);
		return cols.slice(1).map(v => {
			const n = Number(v);
			return Number.isFinite(n) ? n : NaN;
		});
	});

	// Transpose rows into per-bank arrays
	const banks = bankNames.map((name, i) => ({
		name,
		ticker: tickers[i] || '',
		prices: rows.map(r => r[i])
	}));

	return { years, banks };
}

function computeYoY(banks, years) {
	return banks.map(bank => {
		const yoy = [];
		const p = bank.prices;
		for (let i = 1; i < p.length; i++) {
			const prev = p[i - 1];
			const cur = p[i];
			const pct = (Number.isFinite(prev) && prev !== 0 && Number.isFinite(cur)) ? ((cur - prev) / prev) * 100 : NaN;
			yoy.push({ year: years[i], pct });
		}
		const first = p[0];
		const last = p[p.length - 1];
		const overall = (Number.isFinite(first) && first !== 0 && Number.isFinite(last)) ? ((last - first) / first) * 100 : NaN;
		return { ...bank, yoy, overall };
	});
}

function formatPercent(n) {
	if (!Number.isFinite(n)) return 'N/A';
	const sign = n >= 0 ? '+' : '';
	return sign + n.toFixed(2) + '%';
}

function main() {
	const csvPath = path.join(__dirname, 'data', 'banks.csv');
	let text;
	try {
		text = fs.readFileSync(csvPath, 'utf8');
	} catch (err) {
		console.error('Failed to read banks CSV:', err.message);
		process.exit(1);
	}

	let parsed;
	try {
		parsed = parseCsv(text);
	} catch (err) {
		console.error('Failed to parse CSV:', err.message);
		process.exit(1);
	}

	const computed = computeYoY(parsed.banks, parsed.years);

	function formatNumber(n) {
		return Number.isFinite(n) ? n.toFixed(2) : 'N/A';
	}

	// For each year (starting from index 1), produce a ranking by percent change
	for (let yi = 1; yi < parsed.years.length; yi++) {
		const year = parsed.years[yi];
		const rankings = parsed.banks.map(bank => {
			const prev = bank.prices[yi - 1];
			const cur = bank.prices[yi];
			const change = (Number.isFinite(cur) && Number.isFinite(prev)) ? (cur - prev) : NaN;
			const pct = (Number.isFinite(prev) && prev !== 0 && Number.isFinite(cur)) ? ((cur - prev) / prev) * 100 : NaN;
			return { name: bank.name, ticker: bank.ticker, start: prev, end: cur, change, pct };
		});

		rankings.sort((a, b) => (Number.isFinite(b.pct) ? b.pct : -Infinity) - (Number.isFinite(a.pct) ? a.pct : -Infinity));

		// CSV header for the year
		console.log(`\nYear ${year} : Rank,Name,Symbol,Start,End,Change,Pct`);
		rankings.forEach((r, idx) => {
			const cols = [
				String(idx + 1),
				r.name,
				r.ticker,
				formatNumber(r.start),
				formatNumber(r.end),
				formatNumber(r.change),
				formatPercent(r.pct)
			];
			console.log(cols.join(','));
		});
	}
}

if (require.main === module) main();

