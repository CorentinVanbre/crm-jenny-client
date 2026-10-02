// ============================================================================
// Google Directions : durées et distances réelles pour le planificateur de
// visites. Utilise le Directions Service de l'API Maps JavaScript (déjà
// chargée par la carte, compatible avec les clés restreintes aux referrers).
// Fallback silencieux sur les estimations locales si le service échoue.
// ============================================================================

export interface RouteLeg {
  km: number;
  minutes: number;
  source: 'directions' | 'estimate';
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

export const directionsStatus = (): DirectionsStatus => lastStatus;

const legKey = (mode: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
  `${mode}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;

const mapsRuntime = (): GoogleMapsRuntime['maps'] | null =>
  (window as unknown as { google?: GoogleMapsRuntime }).google?.maps ?? null;

const fetchLeg = async (mode: 'driving' | 'transit', from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => {
  const key = legKey(mode, from, to);
  const hit = cache.get(key);
  if (hit) return hit;

  const maps = mapsRuntime();
  const Service = maps?.DirectionsService;
  const TravelMode = maps?.TravelMode;
  if (!Service || !TravelMode) {
    lastStatus = 'no-maps';
    return null;
  }
  const travelMode = mode === 'driving' ? TravelMode.DRIVING : TravelMode.TRANSIT;
  if (!travelMode) {
    lastStatus = 'no-maps';
    return null;
  }

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
            resolve(null);
            return;
          }
          const leg = res.legs[0];
          if (!leg.duration?.value || !leg.distance?.value) {
            lastStatus = 'error';
            resolve(null);
            return;
          }
          const result: RouteLeg = {
            km: leg.distance.value / 1000,
            minutes: Math.round(leg.duration.value / 60),
            source: 'directions',
          };
          lastStatus = 'ok';
          cache.set(key, result);
          resolve(result);
        },
      );
    } catch {
      lastStatus = 'error';
      resolve(null);
    }
  });
};

export const drivingLeg = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => fetchLeg('driving', from, to);

export const transitLeg = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => fetchLeg('transit', from, to);

export const clearDirectionsCache = () => cache.clear();
