/* ── What language does this person speak? ──

   A lead's phone number is the single most reliable signal we get: nobody
   fakes a country code. Combined with the language they browsed the site in
   and their e-mail domain, it is usually enough to hand the lead to someone who
   speaks their language — which is the difference between a conversation and a
   translated exchange.

   Pure and derived: nothing here is stored on the lead except the browsing
   locale (which cannot be inferred later). The phone reading is recomputed on
   every render, so correcting a phone number instantly corrects the language. */

export interface LanguageGuess {
  language: string;        // ISO 639-1, the most likely language
  alsoSpoken: string[];    // other languages common in that country
  country?: string;        // ISO 3166-1 alpha-2
  countryName?: string;
  confidence: 'high' | 'medium' | 'low';
  from: 'phone' | 'browsing' | 'email' | 'none';
}

/* Dialling code → country, the languages a caller is likely to speak, and a
   display name. Longest prefix wins, so +1242 (Bahamas) beats +1 (US/Canada).
   Ordered by relevance to this market: Europe, the Gulf, Asia, the Americas. */
const DIAL: Record<string, { c: string; name: string; langs: string[] }> = {
  // Europe
  '36':  { c: 'HU', name: 'Hungary',        langs: ['hu', 'en'] },
  '44':  { c: 'GB', name: 'United Kingdom', langs: ['en'] },
  '353': { c: 'IE', name: 'Ireland',        langs: ['en'] },
  '49':  { c: 'DE', name: 'Germany',        langs: ['de', 'en'] },
  '43':  { c: 'AT', name: 'Austria',        langs: ['de', 'en'] },
  '41':  { c: 'CH', name: 'Switzerland',    langs: ['de', 'fr', 'it', 'en'] },
  '33':  { c: 'FR', name: 'France',         langs: ['fr', 'en'] },
  '32':  { c: 'BE', name: 'Belgium',        langs: ['nl', 'fr', 'en'] },
  '31':  { c: 'NL', name: 'Netherlands',    langs: ['nl', 'en'] },
  '34':  { c: 'ES', name: 'Spain',          langs: ['es', 'en'] },
  '351': { c: 'PT', name: 'Portugal',       langs: ['pt', 'en'] },
  '39':  { c: 'IT', name: 'Italy',          langs: ['it', 'en'] },
  '30':  { c: 'GR', name: 'Greece',         langs: ['el', 'en'] },
  '48':  { c: 'PL', name: 'Poland',         langs: ['pl', 'en'] },
  '420': { c: 'CZ', name: 'Czechia',        langs: ['cs', 'en'] },
  '421': { c: 'SK', name: 'Slovakia',       langs: ['sk', 'hu', 'en'] },
  '40':  { c: 'RO', name: 'Romania',        langs: ['ro', 'hu', 'en'] },
  '385': { c: 'HR', name: 'Croatia',        langs: ['hr', 'en'] },
  '386': { c: 'SI', name: 'Slovenia',       langs: ['sl', 'en'] },
  '381': { c: 'RS', name: 'Serbia',         langs: ['sr', 'en'] },
  '359': { c: 'BG', name: 'Bulgaria',       langs: ['bg', 'en'] },
  '46':  { c: 'SE', name: 'Sweden',         langs: ['sv', 'en'] },
  '47':  { c: 'NO', name: 'Norway',         langs: ['no', 'en'] },
  '45':  { c: 'DK', name: 'Denmark',        langs: ['da', 'en'] },
  '358': { c: 'FI', name: 'Finland',        langs: ['fi', 'en'] },
  '354': { c: 'IS', name: 'Iceland',        langs: ['is', 'en'] },
  '372': { c: 'EE', name: 'Estonia',        langs: ['et', 'ru', 'en'] },
  '371': { c: 'LV', name: 'Latvia',         langs: ['lv', 'ru', 'en'] },
  '370': { c: 'LT', name: 'Lithuania',      langs: ['lt', 'ru', 'en'] },
  '7':   { c: 'RU', name: 'Russia',         langs: ['ru'] },
  '380': { c: 'UA', name: 'Ukraine',        langs: ['uk', 'ru'] },
  '375': { c: 'BY', name: 'Belarus',        langs: ['ru'] },
  '90':  { c: 'TR', name: 'Türkiye',        langs: ['tr', 'en'] },
  '972': { c: 'IL', name: 'Israel',         langs: ['he', 'en', 'ru'] },
  '356': { c: 'MT', name: 'Malta',          langs: ['en'] },
  '357': { c: 'CY', name: 'Cyprus',         langs: ['el', 'en', 'ru'] },
  '352': { c: 'LU', name: 'Luxembourg',     langs: ['fr', 'de', 'en'] },
  '377': { c: 'MC', name: 'Monaco',         langs: ['fr', 'en'] },

  // Gulf and Middle East — a significant buyer pool for Samui
  '971': { c: 'AE', name: 'UAE',            langs: ['ar', 'en'] },
  '966': { c: 'SA', name: 'Saudi Arabia',   langs: ['ar', 'en'] },
  '974': { c: 'QA', name: 'Qatar',          langs: ['ar', 'en'] },
  '965': { c: 'KW', name: 'Kuwait',         langs: ['ar', 'en'] },
  '973': { c: 'BH', name: 'Bahrain',        langs: ['ar', 'en'] },
  '968': { c: 'OM', name: 'Oman',           langs: ['ar', 'en'] },
  '962': { c: 'JO', name: 'Jordan',         langs: ['ar', 'en'] },
  '961': { c: 'LB', name: 'Lebanon',        langs: ['ar', 'fr', 'en'] },
  '20':  { c: 'EG', name: 'Egypt',          langs: ['ar', 'en'] },

  // Asia-Pacific
  '66':  { c: 'TH', name: 'Thailand',       langs: ['th', 'en'] },
  '65':  { c: 'SG', name: 'Singapore',      langs: ['en', 'zh'] },
  '60':  { c: 'MY', name: 'Malaysia',       langs: ['ms', 'en', 'zh'] },
  '62':  { c: 'ID', name: 'Indonesia',      langs: ['id', 'en'] },
  '63':  { c: 'PH', name: 'Philippines',    langs: ['en', 'tl'] },
  '84':  { c: 'VN', name: 'Vietnam',        langs: ['vi', 'en'] },
  '855': { c: 'KH', name: 'Cambodia',       langs: ['km', 'en'] },
  '856': { c: 'LA', name: 'Laos',           langs: ['lo', 'en'] },
  '86':  { c: 'CN', name: 'China',          langs: ['zh'] },
  '852': { c: 'HK', name: 'Hong Kong',      langs: ['zh', 'en'] },
  '853': { c: 'MO', name: 'Macau',          langs: ['zh', 'pt'] },
  '886': { c: 'TW', name: 'Taiwan',         langs: ['zh'] },
  '81':  { c: 'JP', name: 'Japan',          langs: ['ja', 'en'] },
  '82':  { c: 'KR', name: 'South Korea',    langs: ['ko', 'en'] },
  '91':  { c: 'IN', name: 'India',          langs: ['hi', 'en'] },
  '61':  { c: 'AU', name: 'Australia',      langs: ['en'] },
  '64':  { c: 'NZ', name: 'New Zealand',    langs: ['en'] },
  '976': { c: 'MN', name: 'Mongolia',       langs: ['mn', 'ru', 'en'] },
  '7700':{ c: 'KZ', name: 'Kazakhstan',     langs: ['kk', 'ru'] },

  // Americas — +1 is shared, so specific Caribbean prefixes come first
  '1':   { c: 'US', name: 'USA / Canada',   langs: ['en', 'es', 'fr'] },
  '1242':{ c: 'BS', name: 'Bahamas',        langs: ['en'] },
  '1809':{ c: 'DO', name: 'Dominican Rep.', langs: ['es'] },
  '52':  { c: 'MX', name: 'Mexico',         langs: ['es'] },
  '54':  { c: 'AR', name: 'Argentina',      langs: ['es'] },
  '55':  { c: 'BR', name: 'Brazil',         langs: ['pt'] },
  '56':  { c: 'CL', name: 'Chile',          langs: ['es'] },
  '57':  { c: 'CO', name: 'Colombia',       langs: ['es'] },
  '51':  { c: 'PE', name: 'Peru',           langs: ['es'] },
  '58':  { c: 'VE', name: 'Venezuela',      langs: ['es'] },
  '598': { c: 'UY', name: 'Uruguay',        langs: ['es'] },
  '507': { c: 'PA', name: 'Panama',         langs: ['es'] },
  '506': { c: 'CR', name: 'Costa Rica',     langs: ['es'] },

  // Africa
  '27':  { c: 'ZA', name: 'South Africa',   langs: ['en', 'af'] },
  '212': { c: 'MA', name: 'Morocco',        langs: ['ar', 'fr'] },
  '216': { c: 'TN', name: 'Tunisia',        langs: ['ar', 'fr'] },
  '234': { c: 'NG', name: 'Nigeria',        langs: ['en'] },
  '254': { c: 'KE', name: 'Kenya',          langs: ['en', 'sw'] },
  '230': { c: 'MU', name: 'Mauritius',      langs: ['en', 'fr'] },
};

/* Country-code TLDs worth reading off an e-mail address. Deliberately short:
   a .de address is a real signal, a .com is none at all. */
const EMAIL_TLD: Record<string, string> = {
  de: 'DE', at: 'AT', ch: 'CH', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', nl: 'NL',
  be: 'BE', pl: 'PL', cz: 'CZ', sk: 'SK', hu: 'HU', ro: 'RO', hr: 'HR', gr: 'GR',
  se: 'SE', no: 'NO', dk: 'DK', fi: 'FI', ru: 'RU', ua: 'UA', tr: 'TR', il: 'IL',
  ae: 'AE', sa: 'SA', th: 'TH', sg: 'SG', my: 'MY', id: 'ID', vn: 'VN', cn: 'CN',
  hk: 'HK', tw: 'TW', jp: 'JP', kr: 'KR', in: 'IN', au: 'AU', nz: 'NZ', za: 'ZA',
  br: 'BR', mx: 'MX', ar: 'AR', cl: 'CL', co: 'CO',
};

const byCountry = (code: string) => Object.values(DIAL).find((d) => d.c === code);

/** Read the dialling code off a phone number. Longest prefix wins. */
function fromPhone(phone: string): LanguageGuess | null {
  const digits = phone.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 7) return null; // too short to carry a country code
  for (let len = 4; len >= 1; len--) {
    const hit = DIAL[digits.slice(0, len)];
    if (hit) {
      return {
        language: hit.langs[0],
        alsoSpoken: hit.langs.slice(1),
        country: hit.c,
        countryName: hit.name,
        confidence: 'high',
        from: 'phone',
      };
    }
  }
  return null;
}

/** The language they read the site in — they chose it, so it counts. */
function fromBrowsing(locale?: string): LanguageGuess | null {
  const l = (locale || '').slice(0, 2).toLowerCase();
  if (!l || l === 'en') return null; // English is the default, not a choice
  return { language: l, alsoSpoken: ['en'], confidence: 'medium', from: 'browsing' };
}

function fromEmail(email?: string): LanguageGuess | null {
  const tld = (email || '').split('.').pop()?.toLowerCase();
  const country = tld ? EMAIL_TLD[tld] : undefined;
  const hit = country ? byCountry(country) : undefined;
  if (!hit) return null;
  return {
    language: hit.langs[0],
    alsoSpoken: hit.langs.slice(1),
    country: hit.c,
    countryName: hit.name,
    confidence: 'low',
    from: 'email',
  };
}

/* Phone beats browsing beats e-mail domain. A German number is a German
   speaker even if they read the site in English; a .de address is the weakest
   of the three because company domains travel. */
export function guessLanguage(input: {
  phone?: string; whatsapp?: string; locale?: string; email?: string;
}): LanguageGuess {
  return (
    fromPhone(input.phone || '') ||
    fromPhone(input.whatsapp || '') ||
    fromBrowsing(input.locale) ||
    fromEmail(input.email) ||
    { language: 'en', alsoSpoken: [], confidence: 'low', from: 'none' }
  );
}

const NAMES: Record<string, string> = {
  en: 'English', hu: 'Hungarian', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', cs: 'Czech',
  sk: 'Slovak', ro: 'Romanian', hr: 'Croatian', sl: 'Slovene', sr: 'Serbian',
  bg: 'Bulgarian', el: 'Greek', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
  fi: 'Finnish', is: 'Icelandic', et: 'Estonian', lv: 'Latvian', lt: 'Lithuanian',
  ru: 'Russian', uk: 'Ukrainian', tr: 'Turkish', he: 'Hebrew', ar: 'Arabic',
  th: 'Thai', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
  ms: 'Malay', id: 'Indonesian', vi: 'Vietnamese', tl: 'Tagalog', km: 'Khmer',
  lo: 'Lao', mn: 'Mongolian', kk: 'Kazakh', af: 'Afrikaans', sw: 'Swahili',
};

export const languageName = (code: string) => NAMES[code] || code.toUpperCase();

/** "Spanish · Spain" — the one-line form for the CRM. */
export function languageLabel(g: LanguageGuess): string {
  const lang = languageName(g.language);
  return g.countryName ? `${lang} · ${g.countryName}` : lang;
}
