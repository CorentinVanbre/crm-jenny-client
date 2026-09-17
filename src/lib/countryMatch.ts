import { GEOJSON_TO_FRENCH } from './countryMapping';

// Normalisation : minuscules, sans accents, apostres unifiés, espaces normalisés
export const normalizeCountry = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Alias de noms de pays étrangers (Google Maps / langues locales / anglais)
// -> nom français canonique (tel que stocké dans user_zones / CONTINENTS).
// Les noms GeoJSON anglais et les noms français canoniques sont déjà couverts
// par GEOJSON_TO_FRENCH, on n'ajoute ici que les variantes supplémentaires.
const ALIASES_TO_FRENCH: Record<string, string> = {
  // Amérique du Nord
  'etats unis': 'États-Unis',
  'estados unidos': 'États-Unis',
  'usa': 'États-Unis',
  'united states of america': 'États-Unis',
  'mexico': 'Mexique',
  'mexiko': 'Mexique',
  'kanada': 'Canada',
  'groenlandia': 'Groenland',
  'gronland': 'Groenland',
  // Amérique Centrale / Caraïbes
  'republica dominicana': 'Republique dominicaine',
  'haiti': 'Haïti',
  'jamaika': 'Jamaïque',
  'trinidad y tobago': 'Trinite-et-Tobago',
  // Amérique du Sud
  'argentinien': 'Argentine',
  'bolivien': 'Bolivie',
  'brasil': 'Brésil',
  'kolumbien': 'Colombie',
  'ekuador': 'Équateur',
  'surinam': 'Suriname',
  // Océanie
  'australien': 'Australie',
  'fidji': 'Fidji',
  'neuseeland': 'Nouvelle-Zelande',
  'papua neuguinea': 'Papouasie-Nouvelle-Guinee',
  'islas salomon': 'Salomon',
  // Europe
  'albanien': 'Albanie',
  'deutschland': 'Allemagne',
  'alemania': 'Allemagne',
  'osterreich': 'Autriche',
  'belgica': 'Belgique',
  'weissrussland': 'Bielorussie',
  'bosnien und herzegowina': 'Bosnie-Herzegovine',
  'bosnia y herzegovina': 'Bosnie-Herzegovine',
  'bulgarien': 'Bulgarie',
  'zypern': 'Chypre',
  'chipre': 'Chypre',
  'kroatien': 'Croatie',
  'croacia': 'Croatie',
  'danmark': 'Danemark',
  'dinamarca': 'Danemark',
  'espana': 'Espagne',
  'spanien': 'Espagne',
  'estland': 'Estonie',
  'finlandia': 'Finlande',
  'finnland': 'Finlande',
  'francia': 'France',
  'frankreich': 'France',
  'griechenland': 'Grèce',
  'grecia': 'Grèce',
  'hungria': 'Hongrie',
  'ungarn': 'Hongrie',
  'irlanda': 'Irlande',
  'islandia': 'Islande',
  'italia': 'Italie',
  'italien': 'Italie',
  'lettland': 'Lettonie',
  'letonia': 'Lettonie',
  'litauen': 'Lituanie',
  'luxemburgo': 'Luxembourg',
  'north macedonia': 'Macedoine du Nord',
  'mazedonien': 'Macedoine du Nord',
  'republic of moldova': 'Moldavie',
  'norwegen': 'Norvege',
  'noruega': 'Norvege',
  'nederland': 'Pays-Bas',
  'niederlande': 'Pays-Bas',
  'paises bajos': 'Pays-Bas',
  'holland': 'Pays-Bas',
  'polonia': 'Pologne',
  'polen': 'Pologne',
  'czechia': 'République tchèque',
  'tschechien': 'République tchèque',
  'republica checa': 'République tchèque',
  'rumänien': 'Roumanie',
  'reino unido': 'Royaume-Uni',
  'grossbritannien': 'Royaume-Uni',
  'great britain': 'Royaume-Uni',
  'serbien': 'Serbie',
  'republic of serbia': 'Serbie',
  'slowakei': 'Slovaquie',
  'eslovaquia': 'Slovaquie',
  'slowenien': 'Slovenie',
  'eslovenia': 'Slovenie',
  'sverige': 'Suède',
  'schweden': 'Suède',
  'suecia': 'Suède',
  'schweiz': 'Suisse',
  'suiza': 'Suisse',
  'ucrania': 'Ukraine',
  // Moyen-Orient
  'arabia saudita': 'Arabie saoudite',
  'saudi arabien': 'Arabie saoudite',
  'bahrein': 'Bahreïn',
  'emiratos arabes unidos': 'Émirats arabes unis',
  'vae': 'Émirats arabes unis',
  'islamic republic of iran': 'Iran',
  'state of israel': 'Israël',
  'jordania': 'Jordanie',
  'jordanien': 'Jordanie',
  'kuwaiti': 'Koweït',
  'libano': 'Liban',
  'libanon': 'Liban',
  'katar': 'Qatar',
  'siria': 'Syrie',
  'syrien': 'Syrie',
  'jemen': 'Yémen',
  'state of palestine': 'Palestine',
  'cisjordanie': 'Palestine',
  // Asie
  'armenien': 'Arménie',
  'aserbaidschan': 'Azerbaïdjan',
  'butan': 'Bhoutan',
  'brunei darussalam': 'Brunei',
  'camboya': 'Cambodge',
  'kambodscha': 'Cambodge',
  'república popular china': 'Chine',
  'corea del norte': 'Coree du Nord',
  'nordkorea': 'Coree du Nord',
  'corea del sur': 'Coree du Sud',
  'sudkorea': 'Coree du Sud',
  'republic of korea': 'Coree du Sud',
  'georgien': 'Géorgie',
  'indien': 'Inde',
  'republic of india': 'Inde',
  'indonesien': 'Indonésie',
  'japón': 'Japon',
  'kasachstan': 'Kazakhstan',
  'kazajistan': 'Kazakhstan',
  'kirgistan': 'Kirghizistan',
  'kirguistan': 'Kirghizistan',
  'malasia': 'Malaisie',
  'mongolei': 'Mongolie',
  'usbekistan': 'Ouzbékistan',
  'filipinas': 'Philippines',
  'philippinen': 'Philippines',
  'russian federation': 'Russie',
  'rusia': 'Russie',
  'russland': 'Russie',
  'tayikistan': 'Tadjikistan',
  'tadshikistan': 'Tadjikistan',
  'tailandia': 'Thaïlande',
  'east timor': 'Timor oriental',
  'turquia': 'Turquie',
  'türkei': 'Turquie',
  'viet nam': 'Viêt Nam',
  'socialist republic of vietnam': 'Viêt Nam',
  // Afrique
  'algerien': 'Algérie',
  'argelia': 'Algérie',
  'benín': 'Bénin',
  'kamerun': 'Cameroun',
  'camerun': 'Cameroun',
  'tschad': 'Tchad',
  'chad republic': 'Tchad',
  'ivory coast': "Côte d'Ivoire",
  'costa de marfil': "Côte d'Ivoire",
  'cote divoire': "Côte d'Ivoire",
  'cote de ivoire': "Côte d'Ivoire",
  'democratic republic of the congo': 'Congo (RDC / Kinshasa)',
  'dr congo': 'Congo (RDC / Kinshasa)',
  'congo kinshasa': 'Congo (RDC / Kinshasa)',
  'congo democratic republic': 'Congo (RDC / Kinshasa)',
  'demokratische republik kongo': 'Congo (RDC / Kinshasa)',
  'republic of the congo': 'Congo (Brazzaville)',
  'congo republic': 'Congo (Brazzaville)',
  'egipto': 'Égypte',
  'ägypten': 'Égypte',
  'erythrée': 'Érythrée',
  'eswatini': 'Eswatini (ex-Swaziland)',
  'etiopia': 'Éthiopie',
  'äthiopien': 'Éthiopie',
  'gabun': 'Gabon',
  'guinea bissau': 'Guinée-Bissau',
  'guinee bissau': 'Guinée-Bissau',
  'equatorial guinea': 'Guinée équatoriale',
  'guinee equatoriale': 'Guinée équatoriale',
  'äquatorialguinea': 'Guinée équatoriale',
  'kenia': 'Kenya',
  'libia': 'Libye',
  'libyen': 'Libye',
  'madagaskar': 'Madagascar',
  'marruecos': 'Maroc',
  'marokko': 'Maroc',
  'mauretanien': 'Mauritanie',
  'mosambik': 'Mozambique',
  'namibie': 'Namibie',
  'nigerien': 'Nigeria',
  'uganda republic': 'Ouganda',
  'ruanda': 'Rwanda',
  'tunez': 'Tunisie',
  'tunesien': 'Tunisie',
  'sambia': 'Zambie',
  'simbabwe': 'Zimbabwe',
};

// Index normalisé -> nom français canonique
const normalizedToFrench = new Map<string, string>();

// 1. Les noms français canoniques eux-mêmes
Object.values(GEOJSON_TO_FRENCH).forEach((fr) => {
  normalizedToFrench.set(normalizeCountry(fr), fr);
});

// 2. Les noms GeoJSON anglais (clés de GEOJSON_TO_FRENCH)
Object.entries(GEOJSON_TO_FRENCH).forEach(([en, fr]) => {
  normalizedToFrench.set(normalizeCountry(en), fr);
});

// 3. Les alias étrangers
Object.entries(ALIASES_TO_FRENCH).forEach(([alias, fr]) => {
  normalizedToFrench.set(normalizeCountry(alias), fr);
});

// Résout un nom de pays (quelle que soit sa langue) vers le nom français canonique.
// Retourne undefined si aucune correspondance n'est trouvée.
export function resolveToFrench(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const norm = normalizeCountry(name);
  if (!norm) return undefined;
  return normalizedToFrench.get(norm);
}

// Vérifie si un pays (potentiellement en langue étrangère) est autorisé
// pour un utilisateur dont les zones sont en français.
export function isCountryAllowed(
  allowedCountries: string[] | null | undefined,
  pays: string | undefined | null
): boolean {
  if (!allowedCountries) return true;
  if (pays == null || pays === '') {
    return true;
  }
  const resolved = resolveToFrench(pays);
  const target = resolved ?? pays;
  const targetNorm = normalizeCountry(target);
  return allowedCountries.some((c) => normalizeCountry(c) === targetNorm);
}

// Construit un Set normalisé des pays autorisés (formes françaises canoniques)
export function buildAllowedSet(allowedCountries: string[] | null | undefined): Set<string> | null {
  if (!allowedCountries) return null;
  return new Set(allowedCountries.map(normalizeCountry));
}

// Vérifie l'appartenance d'un pays à un Set d'autorisations (construit via buildAllowedSet)
export function countryInSet(
  allowedSet: Set<string> | null,
  pays: string | undefined | null
): boolean {
  if (!allowedSet) return true;
  if (pays == null || pays === '') return true;
  const resolved = resolveToFrench(pays) ?? pays;
  return allowedSet.has(normalizeCountry(resolved));
}
