// Word-level comparison of what the learner said against a target sentence.

const CONTRACTIONS = {
  "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are",
  "it's": "it is", "that's": "that is", "there's": "there is", "he's": "he is",
  "she's": "she is", "i've": "i have", "you've": "you have", "we've": "we have",
  "i'll": "i will", "you'll": "you will", "i'd": "i would", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not", "aren't": "are not",
  "wasn't": "was not", "can't": "can not", "cannot": "can not", "won't": "will not",
  "let's": "let us",
};

const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty"];

export function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/\s+/)
    .map(w => w.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, ""))
    .filter(Boolean)
    .flatMap(w => (CONTRACTIONS[w] ?? (/^\d+$/.test(w) && +w <= 20 ? NUMBERS[+w] : w)).split(" "));
}

export function score(target, said) {
  const t = normalize(target);
  const s = normalize(said);
  // LCS table: L[i][j] = LCS length of t[i..] and s[j..]
  const L = Array.from({ length: t.length + 1 }, () => new Array(s.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--)
    for (let j = s.length - 1; j >= 0; j--)
      L[i][j] = t[i] === s[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);

  const words = [];
  const extra = [];
  let i = 0, j = 0;
  while (i < t.length && j < s.length) {
    if (t[i] === s[j]) { words.push({ word: t[i++], status: "ok" }); j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) words.push({ word: t[i++], status: "missed" });
    else extra.push(s[j++]);
  }
  while (i < t.length) words.push({ word: t[i++], status: "missed" });
  while (j < s.length) extra.push(s[j++]);

  const ok = words.filter(w => w.status === "ok").length;
  return { percent: t.length ? Math.round((ok / t.length) * 100) : 0, words, extra };
}
