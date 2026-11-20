// One way to print a count everywhere it is shown. All copy is Australian
// English, and counts use standard comma grouping ("1,590") whatever the
// browser's locale, and the noun follows English plural rules.
const LOCALE = 'en-US';
const numbers = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const plurals = new Intl.PluralRules(LOCALE);

export function formatCount(n) {
  const value = Number(n);
  return numbers.format(Number.isFinite(value) ? value : 0);
}

// "1 domain", "0 domains", "1,590 topics". Pass the plural when adding "s"
// is wrong ("1 child", "2 children").
export function countLabel(n, singular, plural = `${singular}s`) {
  const value = Number.isFinite(Number(n)) ? Number(n) : 0;
  return `${formatCount(value)} ${plurals.select(value) === 'one' ? singular : plural}`;
}
