import { useEffect, useState } from 'react';
import { GoogleMap } from '@react-google-maps/api';
import { GEOJSON_TO_FRENCH } from '../lib/countryMapping';
import { normalizeCountry } from '../lib/countryMatch';

const GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
let cachedGeoJson: any = null;

export default function ZonesMap({ allowedCountries }: { allowedCountries: string[] }) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [geoJson, setGeoJson] = useState<any>(cachedGeoJson);

  // Charger le GeoJSON mondial (mis en cache au niveau du module)
  useEffect(() => {
    if (cachedGeoJson) return;
    fetch(GEOJSON_URL)
      .then(r => r.json())
      .then(data => { cachedGeoJson = data; setGeoJson(data); })
      .catch(err => console.error('Erreur chargement GeoJSON:', err));
  }, []);

    const allowedNorm = allowedCountries.map(normalizeCountry);

  const styleFeature = (feature: google.maps.Data.Feature): google.maps.Data.StyleOptions => {
    const name = feature.getProperty('name') as string;
    const frenchName = name ? GEOJSON_TO_FRENCH[name] : undefined;
    const allowed = !!frenchName && allowedNorm.includes(normalizeCountry(frenchName));
    return {
      fillColor: allowed ? '#3b82f6' : '#c9ccd1',
      fillOpacity: allowed ? 0.55 : 0.7,
      strokeColor: allowed ? '#1d4ed8' : '#9ca3af',
      strokeWeight: allowed ? 1 : 0.4,
      strokeOpacity: 0.8,
    };
  };

  // Quand la carte ET le GeoJSON sont prêts, ajouter les données
  useEffect(() => {
    if (!map || !geoJson) return;
    map.data.forEach(f => map.data.remove(f));
    map.data.addGeoJson(geoJson);
    map.data.setStyle(styleFeature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, geoJson]);

  // Quand les pays autorisés changent, juste re-styler
  useEffect(() => {
    if (!map) return;
    map.data.setStyle(styleFeature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedCountries, map]);

  if (!geoJson) {
    return (
      <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', borderRadius: '8px', fontFamily: 'Barlow, sans-serif', fontSize: '14px' }}>
        Chargement de la carte...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '400px', borderRadius: '8px' }}
      zoom={2}
      center={{ lat: 20, lng: 0 }}
      onLoad={(m) => setMap(m)}
      options={{
        minZoom: 2,
        maxZoom: 6,
        gestureHandling: 'greedy',
        mapTypeControl: false,
        streetViewControl: false,
      }}
    />
  );
}