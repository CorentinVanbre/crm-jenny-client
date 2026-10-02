// ============================================================================
// Google Directions API : durées et distances réelles pour le planificateur
// de visites. Fallback silencieux sur les estimations locales si l'API
// échoue (quota, réseau, clé absente).
// ============================================================================

export interface RouteLeg {
  km: number;
  minutes: number;
  source: 'directions' | 'estimate';
}

const cache = new Map<string, RouteLeg>();

const legKey = (mode: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
  `${mode}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;

export const hasDirectionsApiKey = (): boolean => Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

const fetchLeg = async (mode: 'driving' | 'transit', from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => {
  const key = legKey(mode, from, to);
  const hit = cache.get(key);
  if (hit) return hit;
  if (!hasDirectionsApiKey()) return null;
  try {
    const origin = `${from.lat},${from.lng}`;
    const destination = `${to.lat},${to.lng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=${mode}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.status !== 'OK' || !data.routes?.length) return null;
    const leg = data.routes[0].legs[0];
    if (!leg?.duration?.value || !leg?.distance?.value) return null;
    const result: RouteLeg = { km: leg.distance.value / 1000, minutes: Math.round(leg.duration.value / 60), source: 'directions' };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
};

export const drivingLeg = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => fetchLeg('driving', from, to);

export const transitLeg = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteLeg | null> => fetchLeg('transit', from, to);

export const clearDirectionsCache = () => cache.clear();
