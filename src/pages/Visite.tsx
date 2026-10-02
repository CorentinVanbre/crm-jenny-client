import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useIsMobile } from '../lib/useIsMobile';
import type { TripStep } from '../lib/tripPlanner';

interface VisitTrip {
  id: string;
  owner: string;
  name: string;
  countries: string;
  sites: { id: string; noms: string; groupe?: string; pays: string }[];
  plans: { country: string; outboundMode: string; hubName: string; totalKm: number }[];
  steps: TripStep[];
  notes: string;
  status: string;
  created_date: string;
  updated_date: string;
}

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

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const persistSteps = async (trip: VisitTrip, steps: TripStep[]) => {
    setTrips(prev => prev.map(tr => tr.id === trip.id ? { ...tr, steps } : tr));
    const { error } = await supabase
      .from('visit_trips')
      .update({ steps, updated_date: new Date().toISOString() })
      .eq('id', trip.id);
    if (error) setMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
  };

  const addManualStep = async (trip: VisitTrip) => {
    const steps = [...trip.steps, {
      type: 'note' as const,
      label: t('visite.newStepLabel'),
      detail: '',
      manual: true,
      scheduledDate: '',
      scheduledTime: '',
    }];
    await persistSteps(trip, steps);
  };

  const removeStep = async (trip: VisitTrip, index: number) => {
    const steps = trip.steps.filter((_, i) => i !== index);
    await persistSteps(trip, steps);
  };

  const moveStep = async (trip: VisitTrip, index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= trip.steps.length) return;
    const steps = [...trip.steps];
    const [moved] = steps.splice(index, 1);
    steps.splice(target, 0, moved);
    await persistSteps(trip, steps);
  };

  const updateStep = async (trip: VisitTrip, index: number, patch: Partial<TripStep>) => {
    const steps = trip.steps.map((s, i) => i === index ? { ...s, ...patch } : s);
    await persistSteps(trip, steps);
  };

  const updateTripStatus = async (trip: VisitTrip, status: string) => {
    setTrips(prev => prev.map(tr => tr.id === trip.id ? { ...tr, status } : tr));
    const { error } = await supabase
      .from('visit_trips')
      .update({ status, updated_date: new Date().toISOString() })
      .eq('id', trip.id);
    if (error) setMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
  };

  const deleteTrip = async (trip: VisitTrip) => {
    if (!window.confirm(t('visite.confirmDelete'))) return;
    setTrips(prev => prev.filter(tr => tr.id !== trip.id));
    const { error } = await supabase.from('visit_trips').delete().eq('id', trip.id);
    if (error) setMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
    else setMessage({ text: t('visite.tripDeleted'), isSuccess: true });
  };

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

  const statusLabels: Record<string, string> = {
    draft: t('visite.statusDraft'),
    planned: t('visite.statusPlanned'),
    done: t('visite.statusDone'),
  };

  const meetingSites = (trip: VisitTrip) => trip.sites || [];

  return (
    <div style={{ padding: '10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ width: 'calc(100% - 20px)', maxWidth: '980px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: isMobile ? '22px' : '28px', marginBottom: '20px' }}>
          {t('visite.title')}
        </h1>
        <p style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '20px' }}>
          {t('visite.subtitle')} <Link to="/sites">{t('visite.goToSites')}</Link>
        </p>

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
          trips.map((trip) => (
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
                    {statusLabels[trip.status] || trip.status} · {formatDate(trip.created_date)} · {meetingSites(trip).length} {t('visite.sites')}
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
                  {trip.plans?.map((plan, pi) => (
                    <div key={pi} style={{ backgroundColor: '#E5E5E4', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                        {plan.country} — {plan.outboundMode === 'train' ? '🚆' : '✈️'} {plan.hubName}
                      </div>
                      <div style={{ fontWeight: 200, fontSize: '13px' }}>
                        {t('visite.localCar')} · {t('visite.totalKm', { km: Math.round(plan.totalKm || 0) })}
                      </div>
                    </div>
                  ))}

                  <div style={{ fontWeight: 'bold', fontSize: '15px', margin: '15px 0 10px' }}>{t('visite.stepsTitle')}</div>
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
                        <button style={{ ...buttonStyle, height: '22px', padding: '0 6px', fontSize: '12px' }} onClick={() => moveStep(trip, index, -1)} disabled={index === 0}>↑</button>
                        <button style={{ ...buttonStyle, height: '22px', padding: '0 6px', fontSize: '12px' }} onClick={() => moveStep(trip, index, 1)} disabled={index === trip.steps.length - 1}>↓</button>
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
                            onChange={(e) => updateStep(trip, index, { scheduledDate: e.target.value })}
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
      </div>
    </div>
  );
}
