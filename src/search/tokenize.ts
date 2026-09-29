const STOPWORDS = new Set(
  (
    'a an and are as at be but by can do does for from has have how i if in into is it its ' +
    'me my no not of on or our so than that the their them then there these they this to ' +
    'up us was we what when where which who why will with you your'
  ).split(' '),
);

/**
 * Lowercases, splits on non-alphanumerics, drops stopwords and folds common
 * suffixes ("policies" -> "policy", "blocked"/"blocking" -> "block") so keyword
 * search matches the way people actually phrase questions.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    tokens.push(stem(raw));
  }
  return tokens;
}

/**
 * Tokens from words with an internal capital: camelCase settings
 * (disableAdminDigest) and PascalCase cmdlet nouns (Get-AdminPowerApp). They
 * name one exact thing, so they deserve more weight than ordinary words.
 */
export function identifierTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of text.split(/[^A-Za-z0-9]+/)) {
    if (/[a-z][A-Z]/.test(word)) tokens.add(stem(word.toLowerCase()));
  }
  return tokens;
}

/**
 * A deliberately tiny suffix stripper (not Porter). It only needs to map a
 * word's variants to the same key, e.g. update/updates/updated/updating -> "updat".
 */
export function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  let w = word;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}
