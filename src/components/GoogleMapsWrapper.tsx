// src/components/GoogleMapsWrapper.tsx
import { LoadScript } from '@react-google-maps/api';

export const GoogleMapsWrapper = ({ children }) => {
  return (
    <LoadScript
      googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
      libraries={['places']}
    >
      {children}
    </LoadScript>
  );
};