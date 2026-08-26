/**
 * ISO 3166-1 numeric → alpha-2 mapping for flag display.
 * Source: https://en.wikipedia.org/wiki/ISO_3166-1_numeric
 * Used by CountryClickHandler and CountryExtrude for flag CDN URLs.
 */

export const ISO_NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'af', '008': 'al', '012': 'dz', '016': 'as', '020': 'ad',
  '024': 'ao', '028': 'ag', '031': 'az', '032': 'ar', '036': 'au',
  '040': 'at', '044': 'bs', '048': 'bh', '050': 'bd', '051': 'am',
  '052': 'bb', '056': 'be', '060': 'bm', '064': 'bt', '068': 'bo',
  '070': 'ba', '072': 'bw', '076': 'br', '084': 'bz', '090': 'sb',
  '092': 'vg', '096': 'bn', '100': 'bg', '104': 'mm', '108': 'bi',
  '112': 'by', '116': 'kh', '120': 'cm', '124': 'ca', '132': 'cv',
  '140': 'cf', '144': 'lk', '148': 'td', '152': 'cl', '156': 'cn',
  '158': 'tw', '170': 'co', '174': 'km', '178': 'cg', '180': 'cd',
  '188': 'cr', '191': 'hr', '192': 'cu', '196': 'cy', '203': 'cz',
  '204': 'bj', '208': 'dk', '212': 'dm', '214': 'do', '218': 'ec',
  '222': 'sv', '226': 'gq', '231': 'et', '232': 'er', '233': 'ee',
  '234': 'fo', '238': 'fk', '242': 'fj', '246': 'fi', '250': 'fr',
  '254': 'gf', '258': 'pf', '260': 'tf', '262': 'dj', '266': 'ga',
  '268': 'ge', '270': 'gm', '275': 'ps', '276': 'de', '288': 'gh',
  '296': 'ki', '300': 'gr', '304': 'gl', '308': 'gd', '312': 'gp',
  '316': 'gu', '320': 'gt', '324': 'gn', '328': 'gy', '332': 'ht',
  '336': 'va', '340': 'hn', '344': 'hk', '348': 'hu', '352': 'is',
  '356': 'in', '360': 'id', '364': 'ir', '368': 'iq', '372': 'ie',
  '376': 'il', '380': 'it', '384': 'ci', '388': 'jm', '392': 'jp',
  '398': 'kz', '400': 'jo', '404': 'ke', '408': 'kp', '410': 'kr',
  '414': 'kw', '417': 'kg', '418': 'la', '422': 'lb', '426': 'ls',
  '428': 'lv', '430': 'lr', '434': 'ly', '438': 'li', '440': 'lt',
  '442': 'lu', '450': 'mg', '454': 'mw', '458': 'my', '462': 'mv',
  '466': 'ml', '470': 'mt', '474': 'mq', '478': 'mr', '480': 'mu',
  '484': 'mx', '492': 'mc', '496': 'mn', '498': 'md', '499': 'me',
  '504': 'ma', '508': 'mz', '512': 'om', '516': 'na', '520': 'nr',
  '524': 'np', '528': 'nl', '530': 'an', '531': 'cw', '533': 'aw',
  '540': 'nc', '548': 'vu', '554': 'nz', '558': 'ni', '562': 'ne',
  '566': 'ng', '570': 'nu', '578': 'no', '583': 'fm', '584': 'mh',
  '585': 'pw', '586': 'pk', '591': 'pa', '598': 'pg', '600': 'py',
  '604': 'pe', '608': 'ph', '616': 'pl', '620': 'pt', '624': 'gw',
  '626': 'tl', '630': 'pr', '634': 'qa', '642': 'ro', '643': 'ru',
  '646': 'rw', '652': 'bl', '659': 'kn', '660': 'ai', '662': 'lc',
  '666': 'pm', '670': 'vc', '674': 'sm', '678': 'st', '682': 'sa',
  '686': 'sn', '688': 'rs', '690': 'sc', '694': 'sl', '702': 'sg',
  '703': 'sk', '704': 'vn', '705': 'si', '706': 'so', '710': 'za',
  '716': 'zw', '724': 'es', '728': 'ss', '729': 'sd', '732': 'eh',
  '740': 'sr', '748': 'sz', '752': 'se', '756': 'ch', '760': 'sy',
  '762': 'tj', '764': 'th', '768': 'tg', '776': 'to', '780': 'tt',
  '784': 'ae', '788': 'tn', '792': 'tr', '795': 'tm', '798': 'tv',
  '800': 'ug', '804': 'ua', '807': 'mk', '818': 'eg', '826': 'gb',
  '831': 'gg', '832': 'je', '834': 'tz', '840': 'us', '854': 'bf',
  '858': 'uy', '860': 'uz', '862': 've', '876': 'wf', '882': 'ws',
  '887': 'ye', '894': 'zm',
  // Territories and dependencies (missing from original set)
  '074': 'bv', '086': 'io', '136': 'ky', '162': 'cx', '166': 'cc',
  '184': 'ck', '248': 'ax', '334': 'hm', '500': 'ms', '574': 'nf',
  '580': 'mp', '612': 'pn', '654': 'sh', '663': 'mf', '796': 'tc',
  '833': 'im', '239': 'gs', '850': 'vi',
  // Special entries for Natural Earth / TopoJSON
  '-99': '',   // Somaliland, N. Cyprus etc (no ISO)
};

/** Convert ISO numeric string to alpha-2 lowercase code */
export function getIso2FromNumeric(numericId: string | number | undefined): string {
  if (numericId == null) return '';
  const key = String(numericId).padStart(3, '0');
  return ISO_NUMERIC_TO_ALPHA2[key] ?? '';
}

/** Convert ISO alpha-2 code to flag emoji */
export function getFlagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '';
  const upper = iso2.toUpperCase();
  return String.fromCodePoint(
    ...Array.from(upper).map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}

/** Get same-origin flag URL. Self-hosted to stay within CSP img-src 'self' — external flagcdn is blocked in prod. */
export function getFlagUrl(iso2: string): string {
  if (!iso2) return '';
  return `/flags/${iso2.toLowerCase()}.png`;
}
