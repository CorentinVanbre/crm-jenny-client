import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { supabase } from '../supabaseClient';
import { useIsMobile } from '../lib/useIsMobile';
import type { TripStep } from '../lib/tripPlanner';
import { rebuildTripSteps, propagateDates } from '../lib/tripPlanner';

interface VisitTrip {
  id: string;
  owner: string;
  name: string;
  countries: string;
  sites: { id: string; noms: string; groupe?: string; pays: string }[];
  plans: { country: string; outboundMode: string; hubName: string; hubLat?: number; hubLng?: number; totalKm: number }[];
  steps: TripStep[];
  notes: string;
  status: string;
  start_date: string | null;
  created_date: string;
  updated_date: string;
}

interface VisitPrefs {
  origin_city: string;
  preferred_stations: string[];
  preferred_airports: string[];
}

const PREF_STATION_OPTIONS = [
  'Gare de Lille-Europe',
  'Gare de Lille-Flandres',
  'Gare de Paris-Nord',
  'Gare de Bruxelles-Midi',
  'Gare de Londres St Pancras',
  'Gare de Rotterdam-Centrale',
];
const PREF_AIRPORT_OPTIONS = [
  'CRL (Charleroi)',
  'LIL (Lille-Lesquin)',
  'CDG (Paris-Charles-de-Gaulle)',
  'ORY (Paris-Orly)',
  'BRU (Bruxelles)',
];

const formatDate = (dateString: string): string => {
  try {
    const d = new Date(dateString);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return dateString;
  }
};

const STEP_ICONS: Record<string, string> = {
  train: '🚆',
  plane: '✈️',
  car: '🚗',
  meeting: '🤝',
  note: '📝',
};

export default function Visite() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [trips, setTrips] = useState<VisitTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);

  // Préférences de voyage (haut de page)
  const [prefs, setPrefs] = useState<VisitPrefs>({ origin_city: 'Lille', preferred_stations: [], preferred_airports: [] });
  const [prefsMessage, setPrefsMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [showPrefsPanel, setShowPrefsPanel] = useState(false);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('visit_trips')
        .select('*')
        .order('created_date', { ascending: false });
      if (error) console.error('Erreur:', error);
      setTrips(data || []);
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadPrefs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('visit_preferences')
        .select('origin_city, preferred_stations, preferred_airports')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setPrefs({
          origin_city: data.origin_city || 'Lille',
          preferred_stations: data.preferred_stations || [],
          preferred_airports: data.preferred_airports || [],
        });
      }
    };
    loadPrefs();
    fetchTrips();
  }, [fetchTrips]);

  const savePrefs = async () => {
    setIsSavingPrefs(true);
    setPrefsMessage(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { error } = await supabase.from('visit_preferences').upsert({
        user_id: user.id,
        origin_city: prefs.origin_city.trim() || 'Lille',
        preferred_stations: prefs.preferred_stations,
        preferred_airports: prefs.preferred_airports,
        updated_date: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      setPrefsMessage({ text: t('visite.prefsSaved'), isSuccess: true });
    } catch (error: unknown) {
      setPrefsMessage({ text: `Erreur: ${(error as Error).message}`, isSuccess: false });
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const togglePref = (kind: 'preferred_stations' | 'preferred_airports', value: string) => {
    setPrefs(prev => {
      const list = prev[kind];
      return {
        ...prev,
        [kind]: list.includes(value) ? list.filter(v => v !== value) : [...list, value],
      };
    });
  };

  const persistTrip = async (trip: VisitTrip, patch: Partial<VisitTrip>) => {
    setTrips(prev => prev.map(tr => tr.id === trip.id ? { ...tr, ...patch } : tr));
    const { error } = await supabase
      .from('visit_trips')
      .update({ ...patch, updated_date: new Date().toISOString() })
      .eq('id', trip.id);
    if (error) setMessage({ text: `Erreur: ${(error as Error).message}`, isSuccess: false });
  };

  const persistSteps = async (trip: VisitTrip, steps: TripStep[]) => {
    await persistTrip(trip, { steps });
  };

  // Ajout d'une étape manuelle avec possibilité de la renommer immédiatement
  const [newStepDraft, setNewStepDraft] = useState<{ tripId: string; label: string; detail: string } | null>(null);

  const addManualStep = (trip: VisitTrip) => {
    setNewStepDraft({ tripId: trip.id, label: '', detail: '' });
  };

  const confirmAddManualStep = async () => {
    if (!newStepDraft) return;
    const trip = trips.find(tr => tr.id === newStepDraft.tripId);
    if (!trip) { setNewStepDraft(null); return; }
    const steps = [...trip.steps, {
      type: 'note' as const,
      label: newStepDraft.label.trim() || t('visite.newStepLabel'),
      detail: newStepDraft.detail.trim(),
      manual: true,
      scheduledDate: '',
      scheduledTime: '',
    }];
    await persistSteps(trip, steps);
    setNewStepDraft(null);
  };

  const removeStep = async (trip: VisitTrip, index: number) => {
    const steps = trip.steps.filter((_, i) => i !== index);
    await persistSteps(trip, steps);
  };

  const updateStep = async (trip: VisitTrip, index: number, patch: Partial<TripStep>) => {
    const steps = trip.steps.map((s, i) => i === index ? { ...s, ...patch } : s);
    await persistSteps(trip, steps);
  };

  // Réordonnancement : uniquement les visites clients (meetings).
  // Les étapes de déplacement (car) sont reconstruites automatiquement.
  const moveMeeting = async (trip: VisitTrip, meetingIndex: number, dir: -1 | 1) => {
    const meetings = trip.steps.filter(s => s.type === 'meeting');
    const meetingPosInMeetings = trip.steps.slice(0, meetingIndex).filter(s => s.type === 'meeting').length;
    const targetPos = meetingPosInMeetings + dir;
    if (targetPos < 0 || targetPos >= meetings.length) return;
    const reordered = [...meetings];
    const [moved] = reordered.splice(meetingPosInMeetings, 1);
    reordered.splice(targetPos, 0, moved);
    const steps = rebuildTripSteps(trip.steps, reordered);
    await persistSteps(trip, steps);
  };

  // Date de début de trajet : propagée sur toutes les étapes (sauf dates manuelles)
  const setTripStartDate = async (trip: VisitTrip, startDate: string | null) => {
    const steps = propagateDates(trip.steps, startDate);
    await persistTrip(trip, { start_date: startDate, steps });
  };

  const setStepDate = async (trip: VisitTrip, index: number, date: string) => {
    const steps = trip.steps.map((s, i) => i === index ? { ...s, scheduledDate: date, manualDate: true } : s);
    await persistSteps(trip, steps);
  };

  const updateTripStatus = async (trip: VisitTrip, status: string) => {
    await persistTrip(trip, { status });
  };

  const deleteTrip = async (trip: VisitTrip) => {
    if (!window.confirm(t('visite.confirmDelete'))) return;
    setTrips(prev => prev.filter(tr => tr.id !== trip.id));
    const { error } = await supabase.from('visit_trips').delete().eq('id', trip.id);
    if (error) setMessage({ text: `Erreur: ${(error as Error).message}`, isSuccess: false });
    else setMessage({ text: t('visite.tripDeleted'), isSuccess: true });
  };

  // Points du trajet pour le visuel carte (dynamique : suit l'ordre des étapes)
  const tripPoints = useCallback((trip: VisitTrip) => {
    const pts: { lat: number; lng: number; label: string; kind: string }[] = [];
    trip.plans?.forEach((plan) => {
      if (plan.hubLat != null && plan.hubLng != null && !pts.some(p => p.label === plan.hubName)) {
        pts.push({ lat: plan.hubLat, lng: plan.hubLng, label: plan.hubName, kind: 'hub' });
      }
    });
    trip.steps.forEach((s) => {
      if (s.lat != null && s.lng != null) {
        pts.push({ lat: s.lat, lng: s.lng, label: s.siteName || s.label, kind: s.type });
      }
    });
    return pts;
  }, []);

  const mapCenterFor = (pts: { lat: number; lng: number }[]) =>
    pts.length ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length } : { lat: 46.8, lng: 1.5 };

  const buttonStyle = {
    height: '30px',
    padding: '0 15px',
    border: '1px solid black',
    borderRadius: '4px',
    backgroundColor: '#E5E5E4',
    cursor: 'pointer',
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const inputStyle = {
    padding: '6px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    backgroundColor: '#fff',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const prefTagStyle = (selected: boolean) => ({
    ...buttonStyle,
    backgroundColor: selected ? '#A6A6A6' : '#fff',
    fontWeight: selected ? 'bold' as const : 200,
    margin: '2px',
  });

  const statusLabels: Record<string, string> = {
    draft: t('visite.statusDraft'),
    planned: t('visite.statusPlanned'),
    done: t('visite.statusDone'),
  };

  const tripsWithPoints = useMemo(() => trips.map(tr => ({ trip: tr, pts: tripPoints(tr) })), [trips, tripPoints]);

  return (
    <div style={{ padding: '10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ width: 'calc(100% - 20px)', maxWidth: '980px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: isMobile ? '22px' : '28px', marginBottom: '20px' }}>
          {t('visite.title')}
        </h1>
        <p style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '20px' }}>
          {t('visite.subtitle')} <Link to="/sites">{t('visite.goToSites')}</Link>
        </p>

        {/* Préférences de voyage (haut de la page) */}
        <div style={{ backgroundColor: '#A6A6A6', borderRadius: '8px', padding: '15px', marginBottom: '20px', boxShadow: '2px 3px 2px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px', fontFamily: 'Barlow, sans-serif' }}>📍 {t('visite.prefsTitle')}</div>
            <button style={buttonStyle} onClick={() => setShowPrefsPanel(!showPrefsPanel)}>{showPrefsPanel ? '−' : '+'}</button>
          </div>
          {!showPrefsPanel && (
            <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '13px', marginTop: '6px' }}>
              {t('visite.prefsSummary', { city: prefs.origin_city, stations: prefs.preferred_stations.length, airports: prefs.preferred_airports.length })}
            </div>
          )}
          {showPrefsPanel && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('visite.originCity')}
              </label>
              <input
                type="text"
                value={prefs.origin_city}
                onChange={(e) => setPrefs(prev => ({ ...prev, origin_city: e.target.value }))}
                style={inputStyle}
                placeholder="Lille"
              />

              <div style={{ marginTop: '12px' }}>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('visite.preferredStations')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {PREF_STATION_OPTIONS.map(opt => (
                    <button key={opt} style={prefTagStyle(prefs.preferred_stations.includes(opt))} onClick={() => togglePref('preferred_stations', opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('visite.preferredAirports')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {PREF_AIRPORT_OPTIONS.map(opt => (
                    <button key={opt} style={prefTagStyle(prefs.preferred_airports.includes(opt))} onClick={() => togglePref('preferred_airports', opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {prefsMessage && (
                <div style={{
                  padding: '10px', marginTop: '10px', borderRadius: '4px',
                  fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
                  backgroundColor: prefsMessage.isSuccess ? '#d4edda' : '#f8d7da',
                  color: prefsMessage.isSuccess ? '#155724' : '#721c24',
                  border: `1px solid ${prefsMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
                  textAlign: 'center',
                }}>{prefsMessage.text}</div>
              )}

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button style={buttonStyle} onClick={savePrefs} disabled={isSavingPrefs}>
                  {isSavingPrefs ? t('sites.saving') : t('common.save')}
                </button>
              </div>
            </div>
          )}
        </div>

        {message && (
          <div style={{
            padding: '10px', marginBottom: '15px', borderRadius: '4px',
            fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
            backgroundColor: message.isSuccess ? '#d4edda' : '#f8d7da',
            color: message.isSuccess ? '#155724' : '#721c24',
            border: `1px solid ${message.isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
            textAlign: 'center',
          }}>{message.text}</div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center' }}>{t('visite.loading')}</p>
        ) : trips.length === 0 ? (
          <p style={{ textAlign: 'center' }}>{t('visite.noTrips')}</p>
        ) : (
          tripsWithPoints.map(({ trip, pts }) => (
            <div key={trip.id} style={{
              backgroundColor: '#A6A6A6',
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '20px',
              boxShadow: '2px 3px 2px rgba(0,0,0,0.3)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div
                  style={{ cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
                  onClick={() => setExpandedId(expandedId === trip.id ? null : trip.id)}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{trip.name}</div>
                  <div style={{ fontWeight: 200, fontSize: '13px' }}>
                    {statusLabels[trip.status] || trip.status} · {formatDate(trip.created_date)} · {trip.sites?.length || 0} {t('visite.sites')}
                    {trip.start_date ? ` · ${t('visite.from')} ${formatDate(trip.start_date)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={trip.status}
                    onChange={(e) => updateTripStatus(trip, e.target.value)}
                    style={{ ...buttonStyle, height: '30px' }}
                  >
                    <option value="draft">{t('visite.statusDraft')}</option>
                    <option value="planned">{t('visite.statusPlanned')}</option>
                    <option value="done">{t('visite.statusDone')}</option>
                  </select>
                  <button style={buttonStyle} onClick={() => deleteTrip(trip)}>{t('common.delete')}</button>
                </div>
              </div>

              {expandedId === trip.id && (
                <div style={{ marginTop: '15px' }}>
                  {trip.countries && (
                    <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '10px' }}>
                      {t('visite.countries')}: {trip.countries}
                    </div>
                  )}

                  {/* Date de début de trajet : propagée sur les étapes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <label style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px' }}>
                      {t('visite.startDate')} :
                    </label>
                    <input
                      type="date"
                      value={trip.start_date || ''}
                      onChange={(e) => setTripStartDate(trip, e.target.value || null)}
                      style={{ ...inputStyle, width: 'auto' }}
                    />
                  </div>

                  {/* Visuel du trajet (dynamique : suit l'ordre des étapes) */}
                  {pts.length > 1 && (
                    <div style={{ border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden', marginBottom: '15px' }}>
                      <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '320px' }}
                        zoom={5}
                        center={mapCenterFor(pts)}
                        options={{ streetViewControl: false, mapTypeControl: false, gestureHandling: 'greedy' }}
                      >
                        <Polyline
                          path={pts.map(p => ({ lat: p.lat, lng: p.lng }))}
                          options={{ strokeColor: '#000000', strokeWeight: 2, strokeOpacity: 0.7 }}
                        />
                        {pts.map((p, i) => (
                          <Marker
                            key={i}
                            position={{ lat: p.lat, lng: p.lng }}
                            title={`${i + 1}. ${p.label}`}
                            label={p.kind === 'meeting' ? { text: String(trip.steps.filter(s => s.type === 'meeting').findIndex(s => (s.siteName || s.label) === p.label) + 1), color: '#fff', fontWeight: 'bold' } : undefined}
                          />
                        ))}
                      </GoogleMap>
                    </div>
                  )}

                  {trip.plans?.map((plan, pi) => (
                    <div key={pi} style={{ backgroundColor: '#E5E5E4', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                        {plan.outboundMode === 'train' ? '🚆' : '✈️'} {plan.country} — {plan.hubName}
                      </div>
                      <div style={{ fontWeight: 200, fontSize: '13px' }}>
                        {t('visite.localCar')} · {t('visite.totalKm', { km: Math.round(plan.totalKm || 0) })}
                      </div>
                    </div>
                  ))}

                  <div style={{ fontWeight: 'bold', fontSize: '15px', margin: '15px 0 10px' }}>{t('visite.stepsTitle')}</div>
                  <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '12px', marginBottom: '10px' }}>
                    {t('visite.reorderHint')}
                  </div>
                  {trip.steps.map((step: TripStep, index: number) => (
                    <div key={index} style={{
                      backgroundColor: '#E5E5E4',
                      borderRadius: '6px',
                      padding: '10px',
                      marginBottom: '8px',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                    }}>
                      <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
                        {step.type === 'meeting' ? (
                          <>
                            <button style={{ ...buttonStyle, height: '22px', padding: '0 6px', fontSize: '12px' }} onClick={() => moveMeeting(trip, index, -1)}>↑</button>
                            <button style={{ ...buttonStyle, height: '22px', padding: '0 6px', fontSize: '12px' }} onClick={() => moveMeeting(trip, index, 1)}>↓</button>
                          </>
                        ) : (
                          <div style={{ width: '22px', textAlign: 'center', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '12px' }}>·</div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: step.type === 'meeting' ? 'bold' : 200, fontSize: '14px' }}>
                          {STEP_ICONS[step.type] || '•'} {step.label}
                          {step.day ? ` · ${t('visite.day')} ${step.day}` : ''} {step.time ? `· ${step.time}` : ''}
                        </div>
                        {step.detail && <div style={{ fontSize: '12px', fontFamily: 'Barlow, sans-serif', fontWeight: 200 }}>{step.detail}</div>}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            type="date"
                            value={step.scheduledDate || ''}
                            onChange={(e) => setStepDate(trip, index, e.target.value)}
                            style={{ ...inputStyle, width: 'auto' }}
                            title={t('visite.scheduledDate')}
                          />
                          <input
                            type="time"
                            value={step.scheduledTime || ''}
                            onChange={(e) => updateStep(trip, index, { scheduledTime: e.target.value })}
                            style={{ ...inputStyle, width: 'auto' }}
                            title={t('visite.scheduledTime')}
                          />
                          {step.siteId && (
                            <Link to={`/sites/${step.siteId}`} target="_blank" style={{ fontSize: '12px' }}>{t('sites.seeMore')}</Link>
                          )}
                          <button style={{ ...buttonStyle, height: '22px', padding: '0 8px', fontSize: '12px' }} onClick={() => removeStep(trip, index)}>✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button style={buttonStyle} onClick={() => addManualStep(trip)}>{t('visite.addStep')}</button>
                </div>
              )}
            </div>
          ))
        )}

        {/* Modale : nouvelle étape avec renommage */}
        {newStepDraft && (
          <>
            <div
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(5px)', zIndex: 999,
              }}
              onClick={() => setNewStepDraft(null)}
            />
            <div
              style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                backgroundColor: '#A6A6A6', borderRadius: '8px', padding: '20px', zIndex: 1000,
                width: '420px', maxWidth: '90%', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <h2 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '20px', marginBottom: '15px', textAlign: 'center' }}>
                {t('visite.newStepTitle')}
              </h2>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('visite.stepName')}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newStepDraft.label}
                  onChange={(e) => setNewStepDraft(prev => prev ? { ...prev, label: e.target.value } : prev)}
                  style={inputStyle}
                  placeholder={t('visite.newStepLabel')}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('visite.stepDetail')}
                </label>
                <input
                  type="text"
                  value={newStepDraft.detail}
                  onChange={(e) => setNewStepDraft(prev => prev ? { ...prev, detail: e.target.value } : prev)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" onClick={() => setNewStepDraft(null)} style={{ ...buttonStyle, backgroundColor: '#E5E5E4' }}>{t('common.cancel')}</button>
                <button type="button" onClick={confirmAddManualStep} style={buttonStyle}>{t('common.save')}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
