// ============================================================================
// Google Directions : durées et distances réelles pour le planificateur de
// visites. Utilise le Directions Service de l'API Maps JavaScript (chargée
// par la carte). Fallback silencieux sur les estimations locales si le
// service échoue. Statut détaillé exposé pour diagnostic (voir le modal de
// proposition de trajet sur la page Sites).
// ============================================================================

export interface RouteLeg {
  km: number;
  minutes: number;
  source: 'directions' | 'estimate';
}

export interface DirectionsDiag {
  available: boolean;
  ok: number;
  failed: number;
  drivingFailed: number;
  transitFailed: number;
  lastError: string;
  lastCall: string;
}

export type DirectionsStatus = 'ok' | 'no-maps' | 'error';

interface DirectionsLeg {
  duration?: { value: number };
  distance?: { value: number };
}
interface DirectionsResult {
  legs?: DirectionsLeg[];
}
interface GoogleMapsRuntime {
  maps?: {
    DirectionsService?: new () => {
      route: (req: Record<string, unknown>, cb: (res: DirectionsResult | null, status: string) => void) => void;
    };
    TravelMode?: Record<string, string>;
  };
}

const cache = new Map<string, RouteLeg>();
let lastStatus: DirectionsStatus = 'no-maps';
let okCount = 0;
let failedCount = 0;
let drivingFailed = 0;
let transitFailed = 0;
let lastError = '';
let lastCall = '';

export const directionsStatus = (): DirectionsStatus => lastStatus;

export const directionsDiag = (): DirectionsDiag => ({
  available: lastStatus !== 'no-maps',
  ok: okCount,
  failed: failedCount,
  drivingFailed,
  transitFailed,
  lastError,
  lastCall,
});

const legKey = (mode: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
  `${mode}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;

const mapsRuntime = (): GoogleMapsRuntime['maps'] | null =>
  (window as unknown as { google?: GoogleMapsRuntime }).google?.maps ?? null;

// Attend que l'API Maps JavaScript soit initialisée (max ~5 s)
const waitForMaps = async (): Promise<GoogleMapsRuntime['maps'] | null> => {
  for (let i = 0; i < 25; i++) {
    const maps = mapsRuntime();
    if (maps?.DirectionsService && maps?.TravelMode) return maps;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
};

const fetchLeg = async (mode: 'driving' | 'transit', from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => {
  const key = legKey(mode, from, to);
  const hit = cache.get(key);
  if (hit) return hit;

  const maps = await waitForMaps();
  const Service = maps?.DirectionsService;
  const TravelMode = maps?.TravelMode;
  if (!Service || !TravelMode) {
    lastStatus = 'no-maps';
    lastError = 'API Maps JavaScript non chargée';
    return null;
  }
  const travelMode = mode === 'driving' ? TravelMode.DRIVING : TravelMode.TRANSIT;
  if (!travelMode) {
    lastStatus = 'no-maps';
    lastError = 'TravelMode indisponible';
    return null;
  }

  lastCall = `${mode} ${from.lat.toFixed(3)},${from.lng.toFixed(3)} → ${to.lat.toFixed(3)},${to.lng.toFixed(3)}`;

  return new Promise<RouteLeg | null>((resolve) => {
    try {
      const service = new Service();
      service.route(
        {
          origin: { lat: from.lat, lng: from.lng },
          destination: { lat: to.lat, lng: to.lng },
          travelMode,
        },
        (res: DirectionsResult | null, status: string) => {
          if (status !== 'OK' || !res?.legs?.length) {
            lastStatus = 'error';
            lastError = status;
            failedCount++;
            if (mode === 'driving') drivingFailed++;
            else transitFailed++;
            resolve(null);
            return;
          }
          const leg = res.legs[0];
          if (!leg.duration?.value || !leg.distance?.value) {
            lastStatus = 'error';
            lastError = 'legs sans durée/distance';
            failedCount++;
            resolve(null);
            return;
          }
          const result: RouteLeg = {
            km: leg.distance.value / 1000,
            minutes: Math.round(leg.duration.value / 60),
            source: 'directions',
          };
          lastStatus = 'ok';
          okCount++;
          cache.set(key, result);
          resolve(result);
        },
      );
    } catch (e) {
      lastStatus = 'error';
      lastError = String(e);
      failedCount++;
      resolve(null);
    }
  });
};

export const drivingLeg = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => fetchLeg('driving', from, to);

export const transitLeg = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => {
  const leg = await fetchLeg('transit', from, to);
  if (leg) return leg;
  // Les liaisons internationales n'ont souvent pas d'itinéraire transports en
  // commun dans Google (ex. Lille → London St Pancras) : on retombe sur un
  // itinéraire routier réel, plus précis que l'estimation locale.
  const road = await fetchLeg('driving', from, to);
  if (road) return { ...road, source: 'directions' };
  return null;
};

export const clearDirectionsCache = () => cache.clear();
