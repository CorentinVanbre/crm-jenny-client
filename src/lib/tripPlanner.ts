import { drivingLeg, transitLeg, RouteLeg } from './googleDirections';

// ============================================================================
// Planificateur de trajets "Mode visite IA"
// Départ de Lille, train privilégié, avion (CRL en voiture / Lesquin / CDG-ORY
// en train), arrivée sur le hub le plus stratégique proche des sites,
// déplacements locaux en voiture de location, retour par le même hub.
// ============================================================================

export interface TripSite {
  id: string;
  noms: string;
  groupe?: string;
  pays: string;
  lat: number;
  lng: number;
}

export interface TripStep {
  type: 'train' | 'plane' | 'car' | 'meeting' | 'note';
  label: string;
  detail?: string;
  from?: string;
  to?: string;
  day?: number;
  time?: string;
  siteId?: string;
  siteName?: string;
  lat?: number;
  lng?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  manual?: boolean;
  manualDate?: boolean;
  meetingMinutes?: number;
  legKm?: number;
  legMinutes?: number;
}

export interface TripPreferences {
  originCity: string;
  originLat: number;
  originLng: number;
  preferredStations: string[];
  preferredAirports: string[];
  meetingMinutes?: number;
}

export interface TripPlan {
  country: string;
  outboundMode: 'train' | 'plane' | 'car';
  originLabel: string;
  originDetail: string;
  hubName: string;
  hubKind: 'station' | 'airport';
  hubLat: number;
  hubLng: number;
  steps: TripStep[];
  totalKm: number;
  siteCount: number;
}

const DEFAULT_ORIGIN = { city: 'Lille', lat: 50.6292, lng: 2.7575 };

const AIRPORTS: Record<string, { name: string; lat: number; lng: number }> = {
  LIL: { name: 'Lille-Lesquin', lat: 50.5640, lng: 3.0230 },
  CRL: { name: 'Charleroi (CRL)', lat: 50.4592, lng: 4.4538 },
  CDG: { name: 'Paris-CDG', lat: 49.0097, lng: 2.5479 },
  ORY: { name: 'Paris-Orly', lat: 48.7233, lng: 2.3794 },
};

const CRL_CAR_FROM_LILLE_MIN = 105;

interface Hub {
  name: string;
  kind: 'station' | 'airport';
  lat: number;
  lng: number;
}

// Gares majeures (train direct ou quasi-direct depuis Lille / TGV)
const STATIONS: Record<string, Hub[]> = {
  France: [
    { name: 'Gare de Lille-Europe', kind: 'station', lat: 50.6124, lng: 3.0733 },
    { name: 'Gare de Paris-Nord', kind: 'station', lat: 48.8809, lng: 2.3553 },
    { name: 'Gare de Lyon-Part-Dieu', kind: 'station', lat: 45.7602, lng: 4.8594 },
    { name: 'Gare de Strasbourg', kind: 'station', lat: 48.5850, lng: 7.7340 },
    { name: 'Gare de Bordeaux-Saint-Jean', kind: 'station', lat: 44.8258, lng: -0.5570 },
    { name: 'Gare de Toulouse-Matabiau', kind: 'station', lat: 43.6110, lng: 1.4550 },
    { name: 'Gare de Marseille-Saint-Charles', kind: 'station', lat: 43.3020, lng: 5.3800 },
    { name: 'Gare de Nantes', kind: 'station', lat: 47.2175, lng: -1.5440 },
    { name: 'Gare de Rennes', kind: 'station', lat: 48.1035, lng: -1.6720 },
    { name: 'Gare de Rouen-Rive-Droite', kind: 'station', lat: 49.4490, lng: 1.0940 },
    { name: 'Gare de Dijon-Ville', kind: 'station', lat: 47.3220, lng: 5.0040 },
    { name: 'Gare de Le Mans', kind: 'station', lat: 47.9960, lng: 0.1920 },
    { name: 'Gare de Limoges-Bénédictins', kind: 'station', lat: 45.8380, lng: 1.2640 },
    { name: 'Gare de Clermont-Ferrand', kind: 'station', lat: 45.8490, lng: 3.1100 },
    { name: 'Gare de Lourdes', kind: 'station', lat: 43.0970, lng: -0.0450 },
    { name: 'Gare de Tours', kind: 'station', lat: 47.3895, lng: 0.6890 },
    { name: 'Gare de Reims-Centre', kind: 'station', lat: 49.2540, lng: 4.0290 },
    { name: 'Gare de Saint-Étienne-Châteaucreux', kind: 'station', lat: 45.4410, lng: 4.4000 },
  ],
  Belgique: [
    { name: 'Gare de Bruxelles-Midi', kind: 'station', lat: 50.8355, lng: 4.3365 },
    { name: 'Gare de Charleroi-Central', kind: 'station', lat: 50.4115, lng: 4.4360 },
    { name: 'Gare d’Anvers-Central', kind: 'station', lat: 51.2165, lng: 4.4200 },
    { name: 'Gare de Liège-Guillemins', kind: 'station', lat: 50.6245, lng: 5.5665 },
    { name: 'Gare de Gand-Saint-Pierre', kind: 'station', lat: 51.0360, lng: 3.7105 },
  ],
  'Pays-Bas': [
    { name: 'Amsterdam-Centraal', kind: 'station', lat: 52.3775, lng: 4.9010 },
    { name: 'Rotterdam-Centraal', kind: 'station', lat: 51.9225, lng: 4.4790 },
  ],
  Luxembourg: [
    { name: 'Gare de Luxembourg', kind: 'station', lat: 49.5995, lng: 6.1335 },
  ],
  Allemagne: [
    { name: 'Bahnhof Köln (Cologne)', kind: 'station', lat: 50.3715, lng: 6.9580 },
    { name: 'Bahnhof Düsseldorf', kind: 'station', lat: 51.2195, lng: 6.7940 },
    { name: 'Berlin Hauptbahnhof', kind: 'station', lat: 52.5250, lng: 13.3695 },
  ],
  'Royaume-Uni': [
    { name: 'London St Pancras', kind: 'station', lat: 51.5320, lng: -0.1265 },
    { name: 'Manchester Piccadilly', kind: 'station', lat: 53.4773, lng: -2.2309 },
    { name: 'Birmingham New Street', kind: 'station', lat: 52.4782, lng: -1.8995 },
    { name: 'Leeds', kind: 'station', lat: 53.7947, lng: -1.5491 },
    { name: 'Sheffield', kind: 'station', lat: 53.3830, lng: -1.4659 },
    { name: 'Derby', kind: 'station', lat: 52.9154, lng: -1.4847 },
    { name: 'Nottingham', kind: 'station', lat: 52.9530, lng: -1.1495 },
    { name: 'York', kind: 'station', lat: 53.9580, lng: -1.0950 },
    { name: 'Newcastle', kind: 'station', lat: 54.9687, lng: -1.6184 },
    { name: 'Bristol Temple Meads', kind: 'station', lat: 51.4549, lng: -2.5812 },
    { name: 'Edinburgh Waverley', kind: 'station', lat: 55.9526, lng: -3.1899 },
    { name: 'Glasgow Central', kind: 'station', lat: 55.8590, lng: -4.2580 },
    { name: 'Peterborough', kind: 'station', lat: 52.5730, lng: -0.2430 },
    { name: 'Ely', kind: 'station', lat: 52.3980, lng: 0.2650 },
    { name: 'Doncaster', kind: 'station', lat: 53.5220, lng: -1.1050 },
    { name: 'Preston', kind: 'station', lat: 53.7590, lng: -2.7050 },
    { name: 'Chester', kind: 'station', lat: 53.1910, lng: -2.8910 },
    { name: 'Cardiff Central', kind: 'station', lat: 51.4750, lng: -3.1820 },
  ],
};

// Aéroports internationaux stratégiques par pays : plusieurs candidats par pays,
// le plus proche des sites est choisi. (fallback : hub le plus proche des sites)
// Gares d'entrée internationale : première gare du pays atteinte depuis Lille
// en train international (Eurostar/Thalys/ICE). Sert de point d'arrivée du
// tronçon international ; une correspondance nationale peut ensuite rapprocher
// les sites avant la prise en charge de la voiture.
const ENTRY_STATIONS: Record<string, Hub> = {
  France: { name: 'Gare de Lille-Europe', kind: 'station', lat: 50.6124, lng: 3.0733 },
  Belgique: { name: 'Gare de Bruxelles-Midi', kind: 'station', lat: 50.8355, lng: 4.3365 },
  'Pays-Bas': { name: 'Amsterdam-Centraal', kind: 'station', lat: 52.3775, lng: 4.9010 },
  Luxembourg: { name: 'Gare de Luxembourg', kind: 'station', lat: 49.6000, lng: 6.1330 },
  Allemagne: { name: 'Bahnhof Köln', kind: 'station', lat: 50.7333, lng: 6.9597 },
  'Royaume-Uni': { name: 'London St Pancras', kind: 'station', lat: 51.5320, lng: -0.1265 },
};

const COUNTRY_AIRPORT_HUBS: Record<string, Hub[]> = {
  France: [
    { name: 'Aéroport de Paris-CDG', kind: 'airport', lat: 49.0097, lng: 2.5479 },
    { name: 'Aéroport de Paris-Orly', kind: 'airport', lat: 48.7233, lng: 2.3794 },
    { name: 'Aéroport de Lyon-Saint-Exupéry', kind: 'airport', lat: 45.7256, lng: 5.0811 },
    { name: 'Aéroport de Marseille-Provence', kind: 'airport', lat: 43.4392, lng: 5.2214 },
    { name: 'Aéroport de Bordeaux-Mérignac', kind: 'airport', lat: 44.8283, lng: -0.7156 },
    { name: 'Aéroport de Toulouse-Blagnac', kind: 'airport', lat: 43.6293, lng: 1.3638 },
    { name: 'Aéroport de Nice-Côte d’Azur', kind: 'airport', lat: 43.6584, lng: 7.2159 },
    { name: 'Aéroport de Nantes-Atlantique', kind: 'airport', lat: 47.1530, lng: -1.6115 },
    { name: 'Aéroport de Strasbourg-Entzheim', kind: 'airport', lat: 48.5383, lng: 7.6283 },
    { name: 'Aéroport de Lille-Lesquin', kind: 'airport', lat: 50.5640, lng: 3.0230 },
  ],
  'Nouvelle-Calédonie': [
    { name: 'Aéroport de Nouméa-Magenta', kind: 'airport', lat: -22.2464, lng: 166.4736 },
    { name: 'Aéroport de Nouméa-La Tontouta', kind: 'airport', lat: -22.0140, lng: 166.2130 },
  ],
  Espagne: [
    { name: 'Aéroport de Madrid-Barajas', kind: 'airport', lat: 40.4720, lng: -3.5610 },
    { name: 'Aéroport de Séville', kind: 'airport', lat: 37.4180, lng: -5.8930 },
    { name: 'Aéroport de Barcelone-El Prat', kind: 'airport', lat: 41.2971, lng: 2.0785 },
    { name: 'Aéroport de Valence', kind: 'airport', lat: 39.4893, lng: -0.4816 },
    { name: 'Aéroport de Bilbao', kind: 'airport', lat: 43.3011, lng: -2.9106 },
    { name: 'Aéroport de Malaga', kind: 'airport', lat: 36.6750, lng: -4.4990 },
  ],
  Italie: [{ name: 'Aéroport de Milan-Malpensa', kind: 'airport', lat: 45.6306, lng: 8.7281 }],
  Allemagne: [{ name: 'Aéroport de Francfort', kind: 'airport', lat: 50.0420, lng: 8.5640 }],
  Pologne: [{ name: 'Aéroport de Varsovie-Chopin', kind: 'airport', lat: 52.1657, lng: 20.9670 }],
  'République tchèque': [{ name: 'Aéroport de Prague', kind: 'airport', lat: 50.1008, lng: 14.2600 }],
  Turquie: [{ name: 'Aéroport d’Istanbul', kind: 'airport', lat: 41.2753, lng: 28.7519 }],
  Égypte: [{ name: 'Aéroport du Caire', kind: 'airport', lat: 30.1115, lng: 31.4130 }],
  Maroc: [{ name: 'Aéroport de Casablanca-Mohammed V', kind: 'airport', lat: 33.3675, lng: -7.5900 }],
  Algérie: [{ name: 'Aéroport d’Alger', kind: 'airport', lat: 36.6910, lng: 3.2154 }],
  Tunisie: [{ name: 'Aéroport de Tunis-Carthage', kind: 'airport', lat: 36.8510, lng: 10.2272 }],
  'États-Unis': [{ name: 'Aéroport de New York-JFK', kind: 'airport', lat: 40.6413, lng: -73.7781 }],
  Canada: [{ name: 'Aéroport de Toronto-Pearson', kind: 'airport', lat: 43.6777, lng: -79.6248 }],
  Brésil: [{ name: 'Aéroport de São Paulo-Guarulhos', kind: 'airport', lat: -23.4356, lng: -46.4731 }],
  Mexique: [{ name: 'Aéroport de Mexico', kind: 'airport', lat: 19.4361, lng: -99.0719 }],
  Argentine: [{ name: 'Aéroport de Buenos Aires-Ezeiza', kind: 'airport', lat: -34.8222, lng: -58.5358 }],
  Chili: [{ name: 'Aéroport de Santiago', kind: 'airport', lat: -33.3930, lng: -70.7858 }],
  Colombie: [{ name: 'Aéroport de Bogotá-El Dorado', kind: 'airport', lat: 4.7016, lng: -74.1469 }],
  Pérou: [{ name: 'Aéroport de Lima-Jorge Chávez', kind: 'airport', lat: -12.0219, lng: -77.1143 }],
  'Afrique du Sud': [{ name: 'Aéroport de Johannesburg-OR Tambo', kind: 'airport', lat: -26.1392, lng: 28.2460 }],
  Nigeria: [{ name: 'Aéroport de Lagos-Murtala Muhammed', kind: 'airport', lat: 6.5774, lng: 3.3212 }],
  Kenya: [{ name: 'Aéroport de Nairobi-Jomo Kenyatta', kind: 'airport', lat: -1.3193, lng: 36.9278 }],
  'Arabie saoudite': [{ name: 'Aéroport de Djeddah', kind: 'airport', lat: 21.6796, lng: 39.1565 }],
  'Émirats arabes unis': [{ name: 'Aéroport de Dubaï', kind: 'airport', lat: 25.2532, lng: 55.3657 }],
  Inde: [{ name: 'Aéroport de Delhi-Indira Gandhi', kind: 'airport', lat: 28.5562, lng: 77.1000 }],
  Chine: [{ name: 'Aéroport de Pékin-Capitale', kind: 'airport', lat: 40.0799, lng: 116.6031 }],
  Japon: [{ name: 'Aéroport de Tokyo-Haneda', kind: 'airport', lat: 35.5494, lng: 139.7798 }],
  Corée_du_Sud: [{ name: 'Aéroport de Séoul-Incheon', kind: 'airport', lat: 37.4602, lng: 126.4407 }],
  'Corée du Sud': [{ name: 'Aéroport de Séoul-Incheon', kind: 'airport', lat: 37.4602, lng: 126.4407 }],
  Australie: [{ name: 'Aéroport de Sydney', kind: 'airport', lat: -33.9399, lng: 151.1753 }],
  Indonésie: [{ name: 'Aéroport de Jakarta-Soekarno-Hatta', kind: 'airport', lat: -6.1256, lng: 106.6558 }],
  Vietnam: [{ name: 'Aéroport de Hanoi-Noi Bai', kind: 'airport', lat: 21.2212, lng: 105.8072 }],
  Thaïlande: [{ name: 'Aéroport de Bangkok-Suvarnabhumi', kind: 'airport', lat: 13.6900, lng: 100.7501 }],
  Russie: [{ name: 'Aéroport de Moscou-Cheremetievo', kind: 'airport', lat: 55.9726, lng: 37.4146 }],
  Suisse: [{ name: 'Aéroport de Zurich', kind: 'airport', lat: 47.4582, lng: 8.5555 }],
  Autriche: [{ name: 'Aéroport de Vienne', kind: 'airport', lat: 48.1103, lng: 16.5696 }],
  Suède: [{ name: 'Aéroport de Stockholm-Arlanda', kind: 'airport', lat: 59.6519, lng: 17.9186 }],
  Norvege: [{ name: 'Aéroport d’Oslo', kind: 'airport', lat: 60.1939, lng: 11.1024 }],
  Danemark: [{ name: 'Aéroport de Copenhague', kind: 'airport', lat: 55.6180, lng: 12.6560 }],
  Portugal: [{ name: 'Aéroport de Lisbonne', kind: 'airport', lat: 38.7742, lng: -9.1342 }],
  Roumanie: [{ name: 'Aéroport de Bucarest-Henri Coandă', kind: 'airport', lat: 44.5711, lng: 26.0850 }],
  Hongrie: [{ name: 'Aéroport de Budapest-Ferenc Liszt', kind: 'airport', lat: 47.4369, lng: 19.2556 }],
  Grèce: [{ name: 'Aéroport d’Athènes', kind: 'airport', lat: 37.9364, lng: 23.9445 }],
  'Royaume-Uni': [{ name: 'Aéroport de Londres-Heathrow', kind: 'airport', lat: 51.4700, lng: -0.4543 }],
};


const DEFAULT_MEETING_MIN = 120;
const EARLIEST_MIN = 8 * 60 + 30;
const LATEST_START_MIN = 15 * 60;
const DEFAULT_DAY_START = 8 * 60 + 30;

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const driveMin = (km: number) => Math.round((km / 70) * 60 + 15);

const fmtDurationHM = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
};
const trainMin = (km: number) => Math.round((km / 130) * 60 + 20);
const flightMin = (km: number) => Math.round(Math.max(km / 750, 1) * 60 + 30);
const fmtHHMM = (m: number) => {
  const q = Math.round(m / 15) * 15;
  const mm = ((q % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
};
const centroid = (pts: { lat: number; lng: number }[]) => ({
  lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
  lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
});

const normalizeCountry = (country: string) =>
  country.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

const lookupCountry = <T>(table: Record<string, T>, country: string): T | undefined => {
  const key = Object.keys(table).find(k => normalizeCountry(k) === normalizeCountry(country));
  return key != null ? table[key] : undefined;
};

const pickHub = (country: string, sites: TripSite[]): { hub: Hub; trainPreferred: boolean } => {
  const c = centroid(sites);
  const stations = lookupCountry(STATIONS, country);
  const trainCountry = Object.keys(STATIONS).find(k => normalizeCountry(k) === normalizeCountry(country));
  const airports = lookupCountry(COUNTRY_AIRPORT_HUBS, country);
  // Train uniquement si les sites sont réellement proches du réseau ferroviaire
  // européen (garde-fou : sites ultra-périphériques / outre-mer enregistrés sous
  // le pays d'origine, ex. Nouvelle-Calédonie sous "France").
  const nearestStationKm = stations
    ? Math.min(...stations.map(st => haversineKm({ lat: st.lat, lng: st.lng }, c)))
    : Infinity;
  if (trainCountry && nearestStationKm <= 600) {
    const best = stations!.reduce((acc, s) =>
      haversineKm({ lat: s.lat, lng: s.lng }, c) < haversineKm({ lat: acc.lat, lng: acc.lng }, c) ? s : acc
    );
    return { hub: best, trainPreferred: true };
  }
  // Aéroports candidats du pays : on choisit le plus proche des sites.
  // Garde-fou : si même l'aéroport national est à plus de 3000 km des sites
  // (outre-mer / territoire ultra-périphérique enregistré sous le pays,
  // ex. Nouvelle-Calédonie sous "France"), on retombe sur un hub local au
  // plus près des sites.
  if (airports?.length) {
    const best = airports.reduce((acc, a) =>
      haversineKm({ lat: a.lat, lng: a.lng }, c) < haversineKm({ lat: acc.lat, lng: acc.lng }, c) ? a : acc
    );
    const bestKm = haversineKm({ lat: best.lat, lng: best.lng }, c);
    if (bestKm <= 3000) return { hub: best, trainPreferred: false };
    return { hub: { name: `Hub principal (${country})`, kind: 'airport' as const, lat: c.lat, lng: c.lng }, trainPreferred: false };
  }
  return { hub: { name: `Hub principal (${country})`, kind: 'airport', lat: c.lat, lng: c.lng }, trainPreferred: false };
};

const findPreferredAirport = (prefs: TripPreferences | undefined, names: string[]) => {
  if (!prefs?.preferredAirports?.length) return null;
  const wanted = prefs.preferredAirports.map(a => a.toLowerCase().trim());
  return names.find(n => wanted.includes(n.toLowerCase().trim())) || null;
};

// Choix de l'aéroport de départ depuis l'origine selon la destination et les préférences
const pickOutboundFlight = (hub: Hub, origin: { city: string; lat: number; lng: number }, prefs?: TripPreferences): { origin: { name: string; lat: number; lng: number; kind: 'car' | 'train'; toOriginMin: number } } => {
  const km = haversineKm({ lat: origin.lat, lng: origin.lng }, { lat: hub.lat, lng: hub.lng });
  if (km < 1800) {
    const preferred = findPreferredAirport(prefs, ['CRL', 'LIL']);
    const code = preferred === 'Lille-Lesquin' || preferred === 'LIL' || preferred === 'Lille-Lesquin (LIL)' ? 'LIL' : 'CRL';
    const kind = code === 'LIL' ? 'train' : 'car';
    const a = AIRPORTS[code];
    const toOriginMin = code === 'LIL' ? 25 : CRL_CAR_FROM_LILLE_MIN;
    return { origin: { name: a.name, lat: a.lat, lng: a.lng, kind, toOriginMin } };
  }
  const preferred = findPreferredAirport(prefs, ['CDG', 'ORY']);
  const code = preferred === 'Orly' || preferred === 'ORY' || preferred === 'Paris-Orly' ? 'ORY' : 'CDG';
  const a = AIRPORTS[code];
  const toOriginMin = code === 'ORY' ? 80 : 60;
  return { origin: { name: a.name, lat: a.lat, lng: a.lng, kind: 'train', toOriginMin } };
};

// Ordre de visite optimisé : plus proche voisin depuis le hub
const orderSites = (hub: { lat: number; lng: number }, sites: TripSite[]): TripSite[] => {
  const remaining = [...sites];
  const ordered: TripSite[] = [];
  let current = { lat: hub.lat, lng: hub.lng };
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineKm(current, { lat: s.lat, lng: s.lng });
      if (d < bestD) { bestD = d; bestIdx = i; }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = { lat: next.lat, lng: next.lng };
  }
  return ordered;
};

// Résout une étape réelle via Google Directions ; retombe sur l'estimation
// locale (haversine + formule) si l'API est indisponible, hors quota, ou si
// l'itinéraire n'est pas trouvé.
const realLeg = async (
  mode: 'driving' | 'transit',
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  estMin: number,
  estKm: number,
): Promise<RouteLeg> => {
  const leg = mode === 'driving' ? await drivingLeg(from, to) : await transitLeg(from, to);
  return leg ?? { km: estKm, minutes: estMin, source: 'estimate' as const };
};

export const planTripAsync = async (sites: TripSite[], prefs?: TripPreferences): Promise<TripPlan[]> => {
  const origin = prefs?.originCity && prefs.originLat && prefs.originLng
    ? { city: prefs.originCity, lat: prefs.originLat, lng: prefs.originLng }
    : { city: DEFAULT_ORIGIN.city, lat: DEFAULT_ORIGIN.lat, lng: DEFAULT_ORIGIN.lng };
  const meetingMin = prefs?.meetingMinutes && prefs.meetingMinutes > 0 ? prefs.meetingMinutes : DEFAULT_MEETING_MIN;
  const byCountry = new Map<string, TripSite[]>();
  sites.forEach((s) => {
    const list = byCountry.get(s.pays) || [];
    list.push(s);
    byCountry.set(s.pays, list);
  });

  const plans: TripPlan[] = [];
  for (const [country, group] of byCountry) {
    const { hub, trainPreferred } = pickHub(country, group);
    const steps: TripStep[] = [];
    let totalKm = 0;
    let t = 6 * 60;
    let day = 1;

    let outboundMode: TripPlan['outboundMode'];
    let originLabel: string;
    let originDetail: string;
    let hubArrival: number;

    if (trainPreferred) {
      outboundMode = 'train';
      // Tronçon international : Lille -> gare d'entrée du pays (ex. St Pancras)
      const entry = lookupCountry(ENTRY_STATIONS, country) || hub;
      const kmLilleEntry = haversineKm({ lat: origin.lat, lng: origin.lng }, { lat: entry.lat, lng: entry.lng });
      const legEntry = await realLeg('transit', { lat: origin.lat, lng: origin.lng }, { lat: entry.lat, lng: entry.lng }, trainMin(kmLilleEntry), kmLilleEntry);
      const durEntry = legEntry.minutes;
      originLabel = 'Lille (gare)';
      originDetail = `Train international depuis ${origin.city} (${entry.name})`;
      steps.push({ type: 'train', label: `Train ${origin.city} → ${entry.name}`, detail: `Train international ~${Math.round(legEntry.km)} km, ~${fmtDurationHM(durEntry)}`, from: origin.city, to: entry.name, day, time: fmtHHMM(t) });
      hubArrival = t + durEntry;

      // Correspondance nationale si la gare d'entrée est éloignée des sites :
      // train domestique vers la gare la plus proche des sites (ex. St Pancras -> Derby)
      if (hub.name !== entry.name) {
        const kmEntryHub = haversineKm({ lat: entry.lat, lng: entry.lng }, { lat: hub.lat, lng: hub.lng });
        const legNat = await realLeg('transit', { lat: entry.lat, lng: entry.lng }, { lat: hub.lat, lng: hub.lng }, trainMin(kmEntryHub), kmEntryHub);
        const durNat = legNat.minutes;
        steps.push({ type: 'train', label: `Train ${entry.name} → ${hub.name}`, detail: `Correspondance nationale ~${Math.round(legNat.km)} km, ~${fmtDurationHM(durNat)}`, from: entry.name, to: hub.name, day, time: fmtHHMM(hubArrival + 20) });
        hubArrival = hubArrival + 20 + durNat;
      }
    } else {
      const flight = pickOutboundFlight(hub, origin, prefs);
      outboundMode = 'plane';
      const toOrigin = flight.origin.toOriginMin;
      const legToAirport = await realLeg(flight.origin.kind === 'car' ? 'driving' : 'transit', { lat: origin.lat, lng: origin.lng }, { lat: flight.origin.lat, lng: flight.origin.lng }, toOrigin, haversineKm({ lat: origin.lat, lng: origin.lng }, { lat: flight.origin.lat, lng: flight.origin.lng }));
      if (flight.origin.kind === 'car') {
        steps.push({ type: 'car', label: `Voiture ${origin.city} → ${flight.origin.name}`, detail: `~${Math.round(legToAirport.km)} km, ~${fmtDurationHM(legToAirport.minutes)}`, from: origin.city, to: flight.origin.name, day, time: fmtHHMM(t) });
      } else {
        steps.push({ type: 'train', label: `Train ${origin.city} → ${flight.origin.name}`, detail: `Trajet ferroviaire ~${fmtDurationHM(legToAirport.minutes)}`, from: origin.city, to: flight.origin.name, day, time: fmtHHMM(t) });
      }
      t += legToAirport.minutes;
      const kmOrigin = haversineKm({ lat: flight.origin.lat, lng: flight.origin.lng }, { lat: hub.lat, lng: hub.lng });
      const dur = flightMin(kmOrigin);
      steps.push({ type: 'plane', label: `Avion ${flight.origin.name} → ${hub.name}`, detail: `~${Math.round(kmOrigin)} km, vol ~${Math.round(dur / 60)}h + enregistrement 1h30`, from: flight.origin.name, to: hub.name, day, time: fmtHHMM(t + 90) });
      originLabel = `${origin.city} → ${flight.origin.name}`;
      originDetail = flight.origin.kind === 'car' ? `Voiture depuis ${origin.city} (${flight.origin.name})` : `Train depuis ${origin.city} (${flight.origin.name})`;
      hubArrival = t + 90 + dur;
    }

    steps.push({ type: 'car', label: 'Voiture de location — prise en charge', detail: `Location au départ de ${hub.name}`, to: hub.name, day, time: fmtHHMM(hubArrival) });
    let clock = hubArrival + 45;

    const ordered = orderSites({ lat: hub.lat, lng: hub.lng }, group);
    let currentPos = { lat: hub.lat, lng: hub.lng };
    for (let i = 0; i < ordered.length; i++) {
      const site = ordered[i];
      const kmEst = haversineKm(currentPos, { lat: site.lat, lng: site.lng });
      const leg = await realLeg('driving', currentPos, { lat: site.lat, lng: site.lng }, driveMin(kmEst), kmEst);
      const km = leg.km;
      const drive = leg.minutes;
      totalKm += km;
      let arrive = clock + drive;
      if (arrive > LATEST_START_MIN + meetingMin || (i > 0 && arrive % 1440 > 19 * 60 && arrive % 1440 < 5 * 60)) {
        day += 1;
        arrive = DEFAULT_DAY_START + drive;
      }
      let start = Math.max(arrive, EARLIEST_MIN);
      if (start > LATEST_START_MIN) {
        day += 1;
        start = DEFAULT_DAY_START + drive;
      }
      steps.push({ type: 'car', label: `Voiture → ${site.noms}`, detail: `~${Math.round(km)} km, ~${fmtDurationHM(drive)}`, from: i === 0 ? hub.name : ordered[i - 1].noms, to: site.noms, day, time: fmtHHMM(start - drive), legKm: km, legMinutes: drive });
      steps.push({ type: 'meeting', label: `Réunion — ${site.groupe ? site.groupe + ' - ' : ''}${site.noms}`, detail: `Réunion de ${fmtDurationHM(meetingMin)}`, to: site.noms, day, time: fmtHHMM(start), siteId: site.id, siteName: site.noms, lat: site.lat, lng: site.lng, meetingMinutes: meetingMin });
      currentPos = { lat: site.lat, lng: site.lng };
      clock = start + meetingMin;
    }

    const kmBackEst = haversineKm(currentPos, { lat: hub.lat, lng: hub.lng });
    const legBack = await realLeg('driving', currentPos, { lat: hub.lat, lng: hub.lng }, driveMin(kmBackEst), kmBackEst);
    const kmBack = legBack.km;
    const driveBack = legBack.minutes;
    totalKm += kmBack;
    let backArrive = clock + driveBack;
    if (backArrive > 21 * 60) {
      day += 1;
      backArrive = DEFAULT_DAY_START + driveBack;
    }
    steps.push({ type: 'car', label: `Voiture → ${hub.name} (retour)`, detail: `~${Math.round(kmBack)} km, ~${fmtDurationHM(driveBack)}, retour location`, from: ordered.length ? ordered[ordered.length - 1].noms : hub.name, to: hub.name, day, time: fmtHHMM(backArrive - driveBack), legKm: kmBack, legMinutes: driveBack });

    if (outboundMode === 'train') {
      const entry = lookupCountry(ENTRY_STATIONS, country) || hub;
      let returnClock = backArrive;
      if (hub.name !== entry.name) {
        const kmNatBack = haversineKm({ lat: hub.lat, lng: hub.lng }, { lat: entry.lat, lng: entry.lng });
        const legNatBack = await realLeg('transit', { lat: hub.lat, lng: hub.lng }, { lat: entry.lat, lng: entry.lng }, trainMin(kmNatBack), kmNatBack);
        steps.push({ type: 'train', label: `Train ${hub.name} → ${entry.name} (retour)`, detail: `Correspondance nationale ~${Math.round(legNatBack.km)} km, ~${fmtDurationHM(legNatBack.minutes)}`, from: hub.name, to: entry.name, day, time: fmtHHMM(returnClock + 15) });
        returnClock = returnClock + 15 + legNatBack.minutes;
      }
      const kmEntryLille = haversineKm({ lat: entry.lat, lng: entry.lng }, { lat: origin.lat, lng: origin.lng });
      const legBackIntl = await realLeg('transit', { lat: entry.lat, lng: entry.lng }, { lat: origin.lat, lng: origin.lng }, trainMin(kmEntryLille), kmEntryLille);
      steps.push({ type: 'train', label: `Train ${entry.name} → ${origin.city} (retour)`, detail: `Train international ~${Math.round(legBackIntl.km)} km, ~${fmtDurationHM(legBackIntl.minutes)}`, from: entry.name, to: origin.city, day, time: fmtHHMM(returnClock + 20) });
    } else {
      const flight = pickOutboundFlight(hub, origin, prefs);
      const kmOrigin = haversineKm({ lat: flight.origin.lat, lng: flight.origin.lng }, { lat: hub.lat, lng: hub.lng });
      const dur = flightMin(kmOrigin);
      steps.push({ type: 'plane', label: `Avion ${hub.name} → ${flight.origin.name} (retour)`, detail: 'Retour par le même aéroport', from: hub.name, to: flight.origin.name, day, time: fmtHHMM(backArrive) });
      steps.push({
        type: flight.origin.kind === 'car' ? 'car' : 'train',
        label: flight.origin.kind === 'car' ? `Voiture ${flight.origin.name} → ${origin.city} (retour)` : `Train ${flight.origin.name} → ${origin.city} (retour)`,
        detail: `Retour à ${origin.city}`,
        from: flight.origin.name,
        to: origin.city,
        day,
        time: fmtHHMM(backArrive + dur + 90),
      });
    }

    plans.push({
      country,
      outboundMode,
      originLabel,
      originDetail,
      hubName: hub.name,
      hubKind: hub.kind,
      hubLat: hub.lat,
      hubLng: hub.lng,
      steps,
      totalKm,
      siteCount: group.length,
    });
  }

  return plans;
};

export const tripPlanTitle = (plans: TripPlan[]): string => {
  if (!plans.length) return '';
  const countries = plans.map((p) => p.country).join(' + ');
  return `Voyage ${countries}`;
};

// ============================================================================
// Réordonnancement d'un projet enregistré : l'utilisateur ne réordonne que
// les visites clients (étapes de type "meeting") ; les étapes de déplacement
// sont recalculées automatiquement pour s'adapter au nouvel ordre.
// ============================================================================

interface RebuildPoint {
  lat: number;
  lng: number;
  name: string;
}

// Cache des liaisons déjà calculées (durées réelles API conservées) : clé "from→to".
// Seules les liaisons absentes du cache sont recalculées via l'API.
const legKey = (from: string, to: string) => `${(from || '').toLowerCase()}→${(to || '').toLowerCase()}`;

export const rebuildTripSteps = async (steps: TripStep[], orderedMeetings: TripStep[], hub?: { lat: number; lng: number }): Promise<TripStep[]> => {
  if (!orderedMeetings.length) return steps;

  // Tout ce qui précède la première réunion (train/avion aller + location) est conservé tel quel
  const firstMeetingIdx = steps.findIndex(st => st.type === 'meeting');
  const outbound = firstMeetingIdx >= 0 ? steps.slice(0, firstMeetingIdx) : [...steps];

  // Tout ce qui suit la dernière réunion (retour) est conservé, puis adapté
  const types = steps.map(st => st.type);
  const lastMeetingIdx = types.lastIndexOf('meeting');
  const returnSteps = lastMeetingIdx >= 0 ? steps.slice(lastMeetingIdx + 1) : [];

  // Les anciens trajets "car" ENTRE les réunions sont supprimés : ils seront
  // recalculés ci-dessous selon le nouvel ordre des visites clients.
  // Les étapes manuelles sont préservées : chacune est rattachée à la réunion
  // qu'elle suivait (clé = nom du site de la réunion précédente ; '' = avant
  // la toute première réunion).
  const legCache = new Map<string, { km: number; minutes: number }>();
  steps.filter(st => st.type === 'car').forEach(st => {
    if (st.legKm != null && st.legMinutes != null && st.from && st.to) {
      legCache.set(legKey(st.from, st.to), { km: st.legKm, minutes: st.legMinutes });
    }
  });
  const manualAfter = new Map<string, TripStep[]>();
  let currentKey = '';
  steps.slice(firstMeetingIdx >= 0 ? firstMeetingIdx : 0, lastMeetingIdx >= 0 ? lastMeetingIdx + 1 : steps.length).forEach(st => {
    if (st.type === 'meeting') {
      currentKey = st.siteName || st.label;
    } else if (st.manual) {
      const list = manualAfter.get(currentKey) || [];
      list.push(st);
      manualAfter.set(currentKey, list);
    }
  });
  // Le trajet "car" aller (hub -> 1er site) fait partie du bloc à recalculer :
  // on le retire d'outbound, il sera régénéré selon le nouvel ordre.
  const lastCarIdx = outbound.map(st => st.type).lastIndexOf('car');
  const hubName = lastCarIdx >= 0 ? (outbound[lastCarIdx].from || 'Hub') : (outbound.length ? (outbound[outbound.length - 1].to || 'Hub') : 'Hub');
  if (lastCarIdx >= 0) outbound.splice(lastCarIdx, 1);

  const rebuilt: TripStep[] = [...outbound, ...(manualAfter.get('') || [])];
  let current: RebuildPoint = { lat: hub?.lat ?? 0, lng: hub?.lng ?? 0, name: hubName };
  let prevName = hubName;

  // Horloge de départ : juste après la prise en charge de la voiture de location
  const lastOutbound = outbound[outbound.length - 1];
  let day = lastOutbound?.day ?? 1;
  let clock = (lastOutbound?.time ? timeToMin(lastOutbound.time) : DEFAULT_DAY_START - 45) + 45;

  for (const m of orderedMeetings) {
    if (m.lat == null || m.lng == null) {
      rebuilt.push(m);
      continue;
    }
    const meetingMin = m.meetingMinutes ?? DEFAULT_MEETING_MIN;
    const nextName = m.siteName || m.label;
    const cached = legCache.get(legKey(prevName, nextName));
    const kmEst = haversineKm(current, { lat: m.lat, lng: m.lng });
    const leg = cached ?? (await realLeg('driving', current, { lat: m.lat, lng: m.lng }, driveMin(kmEst), kmEst));
    const km = leg.km;
    const drive = leg.minutes;
    let arrive = clock + drive;
    if (arrive > LATEST_START_MIN + meetingMin || (arrive % 1440 > 19 * 60 && arrive % 1440 < 5 * 60)) {
      day += 1;
      arrive = DEFAULT_DAY_START + drive;
    }
    let start = Math.max(arrive, EARLIEST_MIN);
    if (start > LATEST_START_MIN) {
      day += 1;
      start = DEFAULT_DAY_START + drive;
    }
    rebuilt.push({
      type: 'car',
      label: `Voiture → ${nextName}`,
      detail: `~${Math.round(km)} km, ~${fmtDurationHM(drive)}`,
      from: prevName,
      to: nextName,
      day,
      time: fmtHHMM(start - drive),
      legKm: km,
      legMinutes: drive,
    });
    rebuilt.push({ ...m, from: prevName, day, time: fmtHHMM(start) });
    (manualAfter.get(nextName) || []).forEach(ms => rebuilt.push(ms));
    prevName = nextName;
    current = { lat: m.lat, lng: m.lng, name: prevName };
    clock = start + meetingMin;
  }

  // Trajet retour : recalcule le jour du premier tronçon (voiture -> hub), puis
  // décale les tronçons suivants (train/avion) du même écart de jours.
  const firstReturn = returnSteps[0];
  const origFirstReturnDay = firstReturn?.day ?? day;
  let returnDay = day;
  const kmBackEst = haversineKm(current, { lat: hub?.lat ?? 0, lng: hub?.lng ?? 0 });
  const cachedBack = legCache.get(legKey(prevName, firstReturn?.to || hubName));
  const legBackR = cachedBack ?? (await realLeg('driving', current, { lat: hub?.lat ?? 0, lng: hub?.lng ?? 0 }, driveMin(kmBackEst), kmBackEst));
  const kmBack = legBackR.km;
  const backDrive = legBackR.minutes;
  const backArrive = clock + backDrive;
  if (backArrive > 21 * 60) {
    returnDay += 1;
  }
  const dayDelta = returnDay - origFirstReturnDay;
  const adaptedReturn = returnSteps.map((st, i) => {
    if (i === 0 && st.type === 'car' && st.label.toLowerCase().includes('retour')) {
      return { ...st, from: prevName, day: returnDay, time: fmtHHMM(backArrive - backDrive), legKm: kmBack, legMinutes: backDrive };
    }
    if (st.type === 'car' && st.label.toLowerCase().includes('retour')) {
      return { ...st, from: prevName };
    }
    return st.day != null ? { ...st, day: st.day + dayDelta } : st;
  });

  return [...rebuilt, ...adaptedReturn];
};

const timeToMin = (time: string): number => {
  const [h, min] = time.split(':').map(Number);
  return h * 60 + min;
};



// Addition de jours sur une date ISO (YYYY-MM-DD)
export const addDaysISO = (isoDate: string, days: number): string => {
  const [y, m, dd] = isoDate.split('-').map(Number);
  if (!y || !m || !dd) return isoDate;
  const d = new Date(y, m - 1, dd + days, 12, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Propage la date de début de trajet sur les étapes : le "day" de chaque étape
// décale la date de départ (jour 1 = date de début). Ne touche pas aux dates
// saisies manuellement par l'utilisateur (manualDate).
export const propagateDates = (steps: TripStep[], startDate: string | null): TripStep[] => {
  if (!startDate) return steps;
  return steps.map(st => {
    if (st.manualDate || st.day == null) return st;
    return { ...st, scheduledDate: addDaysISO(startDate, st.day - 1) };
  });
};
