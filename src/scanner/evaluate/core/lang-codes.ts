/**
 * hreflang value validation, KNOWLEDGE.md §3.9. The ISO lists are stored as
 * versioned data; their versions are part of the ruleset version.
 */

export const ISO_DATA_VERSION = "iso-lists-2026-10";

/** ISO 639-1 two-letter language codes. */
export const ISO_639_1 = new Set(
  (
    "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu"
  ).split(" "),
);

/** ISO 15924 four-letter script codes. */
export const ISO_15924 = new Set(
  (
    "Adlm Afak Aghb Ahom Arab Aran Armi Armn Avst Bali Bamu Bass Batk Beng Bhks Blis Bopo Brah Brai Bugi Buhd Cakm Cans Cari Cham Cher Chis Chrs Cirt Copt Cpmn Cprt Cyrl Cyrs Deva Diak Dogr Dsrt Dupl Egyd Egyh Egyp Elba Elym Ethi Gara Geok Geor Glag Gong Gonm Goth Gran Grek Gujr Gukh Guru Hanb Hang Hani Hano Hans Hant Hatr Hebr Hira Hluw Hmng Hmnp Hrkt Hung Inds Ital Jamo Java Jpan Jurc Kali Kana Kawi Khar Khmr Khoj Kitl Kits Knda Kore Kpel Krai Kthi Lana Laoo Latf Latg Latn Leke Lepc Limb Lina Linb Lisu Loma Lyci Lydi Mahj Maka Mand Mani Marc Maya Medf Mend Merc Mero Mlym Modi Mong Moon Mroo Mtei Mult Mymr Nagm Nand Narb Nbat Newa Nkdb Nkgb Nkoo Nshu Ogam Olck Onao Orkh Orya Osge Osma Ougr Palm Pauc Pcun Pelm Perm Phag Phli Phlp Phlv Phnx Plrd Piqd Prti Psin Ranj Rjng Rohg Roro Runr Samr Sara Sarb Saur Sgnw Shaw Shrd Shui Sidd Sidt Sind Sinh Sogd Sogo Sora Soyo Sund Sunu Sylo Syrc Syre Syrj Syrn Tagb Takr Tale Talu Taml Tang Tavt Tayo Telu Teng Tfng Tglg Thaa Thai Tibt Tirh Tnsa Todr Tols Toto Tutg Ugar Vaii Visp Vith Wara Wcho Wole Xpeo Xsux Yezi Yiii Zanb Zinh Zmth Zsye Zsym Zxxx Zyyy Zzzz"
  ).split(" "),
);

/** ISO 3166-1 alpha-2 officially assigned codes. */
export const ISO_3166_1 = new Set(
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
  ).split(" "),
);

export type HreflangVerdict =
  | { valid: true; language: string | null; script: string | null; region: string | null; xDefault: boolean }
  | { valid: false; condition: "malformed" | "region_only" | "unsupported_code" };

/** Labels for the {condition_label} placeholder of SEO-I18N-04. */
export const HREFLANG_CONDITION_LABEL: Record<"malformed" | "region_only" | "unsupported_code", string> = {
  malformed: "not a valid code format",
  region_only: "a region code without a language",
  unsupported_code: "a code outside ISO 639-1, ISO 15924 or ISO 3166-1 Alpha 2",
};

export function validateHreflang(value: string): HreflangVerdict {
  const code = value.trim();
  if (code.toLowerCase() === "x-default") {
    return { valid: true, language: null, script: null, region: null, xDefault: true };
  }
  const m = /^([A-Za-z]{2,3})(?:-([A-Za-z]{4}))?(?:-([A-Za-z]{2}|\d{3}))?$/.exec(code);
  if (!m) return { valid: false, condition: "malformed" };
  const [, language, script, region] = m;
  const lang = language!.toLowerCase();
  if (language!.length === 2 && script === undefined && region === undefined) {
    const upper = lang.toUpperCase();
    if (ISO_3166_1.has(upper) && !ISO_639_1.has(lang)) return { valid: false, condition: "region_only" };
  }
  if (language!.length === 3 || !ISO_639_1.has(lang)) return { valid: false, condition: "unsupported_code" };
  const scriptCode = script ? script[0]!.toUpperCase() + script.slice(1).toLowerCase() : null;
  if (scriptCode !== null && !ISO_15924.has(scriptCode)) return { valid: false, condition: "unsupported_code" };
  const regionCode = region ? region.toUpperCase() : null;
  if (regionCode !== null && (/^\d{3}$/.test(regionCode) || !ISO_3166_1.has(regionCode))) {
    return { valid: false, condition: "unsupported_code" };
  }
  return { valid: true, language: lang, script: scriptCode, region: regionCode, xDefault: false };
}

/** Well-formed BCP 47 language tag check for the html lang attribute (SEO-HEAD-04), syntax only. */
export function isWellFormedBcp47(value: string): boolean {
  const tag = value.trim();
  if (tag === "") return false;
  if (/^[Xx](-[A-Za-z0-9]{1,8})+$/.test(tag)) return true;
  const grandfathered = new Set([
    "en-gb-oed", "i-ami", "i-bnn", "i-default", "i-enochian", "i-hak", "i-klingon", "i-lux", "i-mingo",
    "i-navajo", "i-pwn", "i-tao", "i-tay", "i-tsu", "sgn-be-fr", "sgn-be-nl", "sgn-ch-de", "art-lojban",
    "cel-gaulish", "no-bok", "no-nyn", "zh-guoyu", "zh-hakka", "zh-min", "zh-min-nan", "zh-xiang",
  ]);
  if (grandfathered.has(tag.toLowerCase())) return true;
  const re =
    /^(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{4,8})(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z0-9]{2,8})+)*(?:-[Xx](?:-[A-Za-z0-9]{1,8})+)?$/;
  return re.test(tag);
}
