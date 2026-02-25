// Phonetic matching utilities for name comparison
// Catches similar-sounding names like "Erin" / "Aaron", "Stephen" / "Steven"

/**
 * Soundex algorithm - converts a word to a phonetic code
 * Words that sound alike get similar codes
 *
 * Examples:
 *   soundex("Erin")   → "E650"
 *   soundex("Aaron")  → "A650"  (similar!)
 *   soundex("Robert") → "R163"
 *   soundex("Rupert") → "R163"  (same!)
 */
export function soundex(word: string): string {
  if (!word || word.length === 0) return '';

  const str = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (str.length === 0) return '';

  // Soundex mapping: letters to digits
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
    // A, E, I, O, U, H, W, Y are ignored (mapped to '')
  };

  // Keep first letter
  let code = str[0];
  let prevCode = map[str[0]] || '';

  // Process remaining letters
  for (let i = 1; i < str.length && code.length < 4; i++) {
    const char = str[i];
    const charCode = map[char] || '';

    // Skip if same as previous code (handles double letters)
    // Skip vowels and H, W, Y (they have no code)
    if (charCode && charCode !== prevCode) {
      code += charCode;
    }

    // Update previous code (even for vowels, to handle cases like "Ashcraft")
    if (charCode) {
      prevCode = charCode;
    }
  }

  // Pad with zeros to length 4
  return (code + '000').substring(0, 4);
}

/**
 * Metaphone algorithm - more accurate than Soundex for English names
 * Better at handling beginning sounds and silent letters
 */
export function metaphone(word: string): string {
  if (!word || word.length === 0) return '';

  let str = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (str.length === 0) return '';

  // Handle special beginning cases
  const startPairs: Record<string, string> = {
    'KN': 'N', 'GN': 'N', 'PN': 'N', 'AE': 'E', 'WR': 'R',
    'WH': 'W', 'PH': 'F', 'GH': 'G',
  };

  for (const [pattern, replacement] of Object.entries(startPairs)) {
    if (str.startsWith(pattern)) {
      str = replacement + str.slice(pattern.length);
      break;
    }
  }

  let result = '';
  let i = 0;

  while (i < str.length && result.length < 6) {
    const char = str[i];
    const next = str[i + 1] || '';
    const prev = str[i - 1] || '';

    // Skip duplicate letters
    if (char === prev && char !== 'C') {
      i++;
      continue;
    }

    switch (char) {
      case 'A': case 'E': case 'I': case 'O': case 'U':
        // Vowels only kept at beginning
        if (i === 0) result += char;
        break;

      case 'B':
        // B is silent after M at end
        if (!(prev === 'M' && i === str.length - 1)) {
          result += 'B';
        }
        break;

      case 'C':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' || next === 'E' || next === 'Y') {
          result += 'S';
        } else {
          result += 'K';
        }
        break;

      case 'D':
        if (next === 'G' && 'IEY'.includes(str[i + 2] || '')) {
          result += 'J';
          i += 2;
        } else {
          result += 'T';
        }
        break;

      case 'G':
        if (next === 'H' && !'AEIOU'.includes(str[i + 2] || 'X')) {
          i++;
        } else if (next === 'N' && i === str.length - 2) {
          // GN at end is silent
        } else if ('IEY'.includes(next)) {
          result += 'J';
        } else {
          result += 'K';
        }
        break;

      case 'H':
        // H is silent after vowel or before non-vowel
        if ('AEIOU'.includes(prev) || !'AEIOU'.includes(next)) {
          // silent
        } else {
          result += 'H';
        }
        break;

      case 'K':
        if (prev !== 'C') result += 'K';
        break;

      case 'P':
        result += (next === 'H') ? (i++, 'F') : 'P';
        break;

      case 'Q':
        result += 'K';
        break;

      case 'S':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' && 'OA'.includes(str[i + 2] || '')) {
          result += 'X';
        } else {
          result += 'S';
        }
        break;

      case 'T':
        if (next === 'H') {
          result += '0'; // theta sound
          i++;
        } else if (next === 'I' && 'OA'.includes(str[i + 2] || '')) {
          result += 'X';
        } else {
          result += 'T';
        }
        break;

      case 'V':
        result += 'F';
        break;

      case 'W': case 'Y':
        if ('AEIOU'.includes(next)) {
          result += char;
        }
        break;

      case 'X':
        result += 'KS';
        break;

      case 'Z':
        result += 'S';
        break;

      default:
        result += char;
    }

    i++;
  }

  return result;
}

/**
 * Check if two names sound similar using both Soundex and Metaphone
 * Returns true if either algorithm considers them similar
 */
export function soundsLike(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;

  const s1 = soundex(name1);
  const s2 = soundex(name2);

  // Soundex match (same code)
  if (s1 === s2) return true;

  // Close Soundex match (same first letter, similar code)
  // This catches cases like E650 vs A650 where only first letter differs
  if (s1.slice(1) === s2.slice(1) && s1.length > 1) {
    // Check if first letters are phonetically similar
    const similarFirstLetters = [
      ['A', 'E'], ['E', 'I'], ['I', 'Y'], ['O', 'U'],
      ['C', 'K', 'Q'], ['S', 'Z'], ['F', 'V', 'PH'],
    ];
    const l1 = name1[0].toUpperCase();
    const l2 = name2[0].toUpperCase();

    for (const group of similarFirstLetters) {
      if (group.includes(l1) && group.includes(l2)) {
        return true;
      }
    }
  }

  // Metaphone match
  const m1 = metaphone(name1);
  const m2 = metaphone(name2);
  if (m1 === m2) return true;

  // Close metaphone (allow 1 char difference for longer codes)
  if (m1.length >= 3 && m2.length >= 3) {
    let diff = 0;
    const maxLen = Math.max(m1.length, m2.length);
    for (let i = 0; i < maxLen; i++) {
      if (m1[i] !== m2[i]) diff++;
    }
    if (diff <= 1) return true;
  }

  return false;
}

/**
 * Check if two first names are phonetically similar
 * Extracts first word from each name and compares phonetically
 */
export function firstNamesSoundAlike(fullName1: string, fullName2: string): boolean {
  const first1 = fullName1.split(/\s+/)[0];
  const first2 = fullName2.split(/\s+/)[0];

  return soundsLike(first1, first2);
}
