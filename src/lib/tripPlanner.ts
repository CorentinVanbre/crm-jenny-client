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

const LILLE = { lat: 50.6292, lng: 2.7575 };

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
  ],
};

// Aéroports internationaux stratégiques par pays (fallback : hub le plus proche des sites)
const COUNTRY_AIRPORT_HUBS: Record<string, Hub> = {
  Espagne: { name: 'Aéroport de Madrid-Barajas', kind: 'airport', lat: 40.4720, lng: -3.5610 },
  Italie: { name: 'Aéroport de Milan-Malpensa', kind: 'airport', lat: 45.6306, lng: 8.7281 },
  Allemagne: { name: 'Aéroport de Francfort', kind: 'airport', lat: 50.0420, lng: 8.5640 },
  Pologne: { name: 'Aéroport de Varsovie-Chopin', kind: 'airport', lat: 52.1657, lng: 20.9670 },
  'République tchèque': { name: 'Aéroport de Prague', kind: 'airport', lat: 50.1008, lng: 14.2600 },
  Turquie: { name: 'Aéroport d’Istanbul', kind: 'airport', lat: 41.2753, lng: 28.7519 },
  Égypte: { name: 'Aéroport du Caire', kind: 'airport', lat: 30.1115, lng: 31.4130 },
  Maroc: { name: 'Aéroport de Casablanca-Mohammed V', kind: 'airport', lat: 33.3675, lng: -7.5900 },
  Algérie: { name: 'Aéroport d’Alger', kind: 'airport', lat: 36.6910, lng: 3.2154 },
  Tunisie: { name: 'Aéroport de Tunis-Carthage', kind: 'airport', lat: 36.8510, lng: 10.2272 },
  'États-Unis': { name: 'Aéroport de New York-JFK', kind: 'airport', lat: 40.6413, lng: -73.7781 },
  Canada: { name: 'Aéroport de Toronto-Pearson', kind: 'airport', lat: 43.6777, lng: -79.6248 },
  Brésil: { name: 'Aéroport de São Paulo-Guarulhos', kind: 'airport', lat: -23.4356, lng: -46.4731 },
  Mexique: { name: 'Aéroport de Mexico', kind: 'airport', lat: 19.4361, lng: -99.0719 },
  Argentine: { name: 'Aéroport de Buenos Aires-Ezeiza', kind: 'airport', lat: -34.8222, lng: -58.5358 },
  Chili: { name: 'Aéroport de Santiago', kind: 'airport', lat: -33.3930, lng: -70.7858 },
  Colombie: { name: 'Aéroport de Bogotá-El Dorado', kind: 'airport', lat: 4.7016, lng: -74.1469 },
  Pérou: { name: 'Aéroport de Lima-Jorge Chávez', kind: 'airport', lat: -12.0219, lng: -77.1143 },
  'Afrique du Sud': { name: 'Aéroport de Johannesburg-OR Tambo', kind: 'airport', lat: -26.1392, lng: 28.2460 },
  Nigeria: { name: 'Aéroport de Lagos-Murtala Muhammed', kind: 'airport', lat: 6.5774, lng: 3.3212 },
  Kenya: { name: 'Aéroport de Nairobi-Jomo Kenyatta', kind: 'airport', lat: -1.3193, lng: 36.9278 },
  'Arabie saoudite': { name: 'Aéroport de Djeddah', kind: 'airport', lat: 21.6796, lng: 39.1565 },
  'Émirats arabes unis': { name: 'Aéroport de Dubaï', kind: 'airport', lat: 25.2532, lng: 55.3657 },
  Inde: { name: 'Aéroport de Delhi-Indira Gandhi', kind: 'airport', lat: 28.5562, lng: 77.1000 },
  Chine: { name: 'Aéroport de Pékin-Capitale', kind: 'airport', lat: 40.0799, lng: 116.6031 },
  Japon: { name: 'Aéroport de Tokyo-Haneda', kind: 'airport', lat: 35.5494, lng: 139.7798 },
  Corée_du_Sud: { name: 'Aéroport de Séoul-Incheon', kind: 'airport', lat: 37.4602, lng: 126.4407 },
  'Corée du Sud': { name: 'Aéroport de Séoul-Incheon', kind: 'airport', lat: 37.4602, lng: 126.4407 },
  Australie: { name: 'Aéroport de Sydney', kind: 'airport', lat: -33.9399, lng: 151.1753 },
  Indonésie: { name: 'Aéroport de Jakarta-Soekarno-Hatta', kind: 'airport', lat: -6.1256, lng: 106.6558 },
  Vietnam: { name: 'Aéroport de Hanoi-Noi Bai', kind: 'airport', lat: 21.2212, lng: 105.8072 },
  Thaïlande: { name: 'Aéroport de Bangkok-Suvarnabhumi', kind: 'airport', lat: 13.6900, lng: 100.7501 },
  Russie: { name: 'Aéroport de Moscou-Cheremetievo', kind: 'airport', lat: 55.9726, lng: 37.4146 },
  Suisse: { name: 'Aéroport de Zurich', kind: 'airport', lat: 47.4582, lng: 8.5555 },
  Autriche: { name: 'Aéroport de Vienne', kind: 'airport', lat: 48.1103, lng: 16.5696 },
  Suède: { name: 'Aéroport de Stockholm-Arlanda', kind: 'airport', lat: 59.6519, lng: 17.9186 },
  Norvege: { name: 'Aéroport d’Oslo', kind: 'airport', lat: 60.1939, lng: 11.1024 },
  Danemark: { name: 'Aéroport de Copenhague', kind: 'airport', lat: 55.6180, lng: 12.6560 },
  Portugal: { name: 'Aéroport de Lisbonne', kind: 'airport', lat: 38.7742, lng: -9.1342 },
  Roumanie: { name: 'Aéroport de Bucarest-Henri Coandă', kind: 'airport', lat: 44.5711, lng: 26.0850 },
  Hongrie: { name: 'Aéroport de Budapest-Ferenc Liszt', kind: 'airport', lat: 47.4369, lng: 19.2556 },
  Grèce: { name: 'Aéroport d’Athènes', kind: 'airport', lat: 37.9364, lng: 23.9445 },
  'Royaume-Uni': { name: 'Aéroport de Londres-Heathrow', kind: 'airport', lat: 51.4700, lng: -0.4543 },
};

// Pays priorititairement accessibles en train direct/quasi-direct depuis Lille
const TRAIN_PRIORITY_COUNTRIES = new Set(['France', 'Belgique', 'Pays-Bas', 'Luxembourg', 'Royaume-Uni', 'Allemagne']);

const MEETING_MIN = 120;
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
const trainMin = (km: number) => Math.round((km / 130) * 60 + 20);
const flightMin = (km: number) => Math.round(Math.max(km / 750, 1) * 60 + 30);

const fmtHHMM = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const centroid = (pts: { lat: number; lng: number }[]) => ({
  lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
  lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
});

const pickHub = (country: string, sites: TripSite[]): { hub: Hub; trainPreferred: boolean } => {
  const c = centroid(sites);
  if (TRAIN_PRIORITY_COUNTRIES.has(country) && STATIONS[country]) {
    const best = STATIONS[country].reduce((acc, s) =>
      haversineKm({ lat: s.lat, lng: s.lng }, c) < haversineKm({ lat: acc.lat, lng: acc.lng }, c) ? s : acc
    );
    return { hub: best, trainPreferred: true };
  }
  const airport = COUNTRY_AIRPORT_HUBS[country];
  if (airport) return { hub: airport, trainPreferred: false };
  return { hub: { name: `Hub principal (${country})`, kind: 'airport', lat: c.lat, lng: c.lng }, trainPreferred: false };
};

// Choix de l'aéroport de départ depuis Lille selon la destination
const pickOutboundFlight = (hub: Hub): { origin: { name: string; lat: number; lng: number; kind: 'car' | 'train'; toOriginMin: number } } => {
  const km = haversineKm(LILLE, { lat: hub.lat, lng: hub.lng });
  if (km < 1800) {
    return { origin: { name: AIRPORTS.CRL.name, lat: AIRPORTS.CRL.lat, lng: AIRPORTS.CRL.lng, kind: 'car', toOriginMin: CRL_CAR_FROM_LILLE_MIN } };
  }
  return { origin: { name: AIRPORTS.CDG.name, lat: AIRPORTS.CDG.lat, lng: AIRPORTS.CDG.lng, kind: 'train', toOriginMin: 60 } };
};

// Ordre de visite optimisé : plus proche voisin depuis le hub
const orderSites = (hub: Hub, sites: TripSite[]): TripSite[] => {
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

export const planTrip = (sites: TripSite[]): TripPlan[] => {
  const byCountry = new Map<string, TripSite[]>();
  sites.forEach((s) => {
    const list = byCountry.get(s.pays) || [];
    list.push(s);
    byCountry.set(s.pays, list);
  });

  const plans: TripPlan[] = [];
  for (const [country, group] of byCountry) {
    const { hub, trainPreferred } = pickHub(country, group);
    const kmLilleHub = haversineKm(LILLE, { lat: hub.lat, lng: hub.lng });
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
      originLabel = 'Lille (gare)';
      originDetail = 'Train direct/quasi-direct depuis Lille';
      const dur = trainMin(kmLilleHub);
      steps.push({ type: 'train', label: 'Train Lille → ' + hub.name, detail: `~${Math.round(kmLilleHub)} km, ~${Math.round(dur / 60)}h`, from: 'Lille', to: hub.name, day, time: fmtHHMM(t) });
      hubArrival = t + dur;
    } else {
      const flight = pickOutboundFlight(hub);
      outboundMode = 'plane';
      const toOrigin = flight.origin.toOriginMin;
      if (flight.origin.kind === 'car') {
        steps.push({ type: 'car', label: `Voiture Lille → ${flight.origin.name}`, detail: 'Trajet routier ~1h45', from: 'Lille', to: flight.origin.name, day, time: fmtHHMM(t) });
      } else {
        steps.push({ type: 'train', label: `Train Lille → ${flight.origin.name}`, detail: 'Trajet ferroviaire ~1h', from: 'Lille', to: flight.origin.name, day, time: fmtHHMM(t) });
      }
      t += toOrigin;
      const kmOrigin = haversineKm({ lat: flight.origin.lat, lng: flight.origin.lng }, { lat: hub.lat, lng: hub.lng });
      const dur = flightMin(kmOrigin);
      steps.push({ type: 'plane', label: `Avion ${flight.origin.name} → ${hub.name}`, detail: `~${Math.round(kmOrigin)} km, vol ~${Math.round(dur / 60)}h + enregistrement 1h30`, from: flight.origin.name, to: hub.name, day, time: fmtHHMM(t + 90) });
      originLabel = 'Lille → ' + flight.origin.name;
      originDetail = flight.origin.kind === 'car' ? `Voiture depuis Lille (${flight.origin.name})` : `Train depuis Lille (${flight.origin.name})`;
      hubArrival = t + 90 + dur;
    }

    steps.push({ type: 'car', label: 'Voiture de location — prise en charge', detail: `Location au départ de ${hub.name}`, to: hub.name, day, time: fmtHHMM(hubArrival) });
    let clock = hubArrival + 45;

    const ordered = orderSites(hub, group);
    let currentPos = { lat: hub.lat, lng: hub.lng };
    ordered.forEach((site, i) => {
      const km = haversineKm(currentPos, { lat: site.lat, lng: site.lng });
      const drive = driveMin(km);
      totalKm += km;
      let arrive = clock + drive;
      if (arrive > LATEST_START_MIN + MEETING_MIN || (i > 0 && arrive % 1440 > 19 * 60 && arrive % 1440 < 5 * 60)) {
        day += 1;
        arrive = DEFAULT_DAY_START + drive;
      }
      let start = Math.max(arrive, EARLIEST_MIN);
      if (start > LATEST_START_MIN) {
        day += 1;
        start = DEFAULT_DAY_START + drive;
      }
      steps.push({ type: 'car', label: `Voiture → ${site.noms}`, detail: `~${Math.round(km)} km, ~${Math.round(drive / 60)}h${Math.round(drive % 60)}min`, from: i === 0 ? hub.name : ordered[i - 1].noms, to: site.noms, day, time: fmtHHMM(start - drive) });
      steps.push({ type: 'meeting', label: `Réunion — ${site.groupe ? site.groupe + ' - ' : ''}${site.noms}`, detail: 'Réunion de 2h', to: site.noms, day, time: fmtHHMM(start), siteId: site.id, siteName: site.noms, lat: site.lat, lng: site.lng });
      currentPos = { lat: site.lat, lng: site.lng };
      clock = start + MEETING_MIN;
    });

    const kmBack = haversineKm(currentPos, { lat: hub.lat, lng: hub.lng });
    const driveBack = driveMin(kmBack);
    totalKm += kmBack;
    let backArrive = clock + driveBack;
    if (backArrive > 21 * 60) {
      day += 1;
      backArrive = DEFAULT_DAY_START + driveBack;
    }
    steps.push({ type: 'car', label: `Voiture → ${hub.name} (retour)`, detail: `~${Math.round(kmBack)} km, retour location`, from: ordered.length ? ordered[ordered.length - 1].noms : hub.name, to: hub.name, day, time: fmtHHMM(backArrive - driveBack) });

    if (outboundMode === 'train') {
      const dur = trainMin(kmLilleHub);
      steps.push({ type: 'train', label: `Train ${hub.name} → Lille (retour)`, detail: `Retour par le même hub, ~${Math.round(dur / 60)}h`, from: hub.name, to: 'Lille', day, time: fmtHHMM(backArrive) });
    } else {
      const flight = pickOutboundFlight(hub);
      const kmOrigin = haversineKm({ lat: flight.origin.lat, lng: flight.origin.lng }, { lat: hub.lat, lng: hub.lng });
      const dur = flightMin(kmOrigin);
      steps.push({ type: 'plane', label: `Avion ${hub.name} → ${flight.origin.name} (retour)`, detail: 'Retour par le même aéroport', from: hub.name, to: flight.origin.name, day, time: fmtHHMM(backArrive) });
      steps.push({
        type: flight.origin.kind === 'car' ? 'car' : 'train',
        label: flight.origin.kind === 'car' ? `Voiture ${flight.origin.name} → Lille (retour)` : `Train ${flight.origin.name} → Lille (retour)`,
        detail: 'Retour à Lille',
        from: flight.origin.name,
        to: 'Lille',
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
