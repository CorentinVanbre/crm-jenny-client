import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { CONTINENTS } from '../lib/countries';
import { useIsMobile } from '../lib/useIsMobile';
import ZonesMap from '../components/ZonesMap';

interface Profile {
  id: string;
  email: string;
}

interface PendingRegistration {
  id: string;
  user_id: string | null;
  email: string;
  status: string;
  created_date: string;
}

export default function AdminZones() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const [mapLat, setMapLat] = useState<string>('');
  const [mapLng, setMapLng] = useState<string>('');
  const [initialMapLat, setInitialMapLat] = useState<string>('');
  const [initialMapLng, setInitialMapLng] = useState<string>('');

  // Inscriptions en attente
  const [pending, setPending] = useState<PendingRegistration[]>([]);
  const isMobile = useIsMobile();
  const [loadingPending, setLoadingPending] = useState(false);

  // Charger la liste des utilisateurs (non admin)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role')
        .order('email', { ascending: true });

      if (error) {
        setMsg({ text: `Erreur: ${error.message}`, isSuccess: false });
        setLoadingUsers(false);
        return;
      }
      setUsers((data || []).filter((u: Profile & { role: string }) => u.role !== 'admin'));
      setLoadingUsers(false);
    })();
  }, []);

  // Charger les inscriptions en attente
  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    const { data, error } = await supabase
      .from('pending_registrations')
      .select('id, user_id, email, status, created_date')
      .eq('status', 'pending')
      .order('created_date', { ascending: true });
    if (error) {
      setMsg({ text: `Erreur inscriptions: ${error.message}`, isSuccess: false });
    } else {
      setPending(data || []);
    }
    setLoadingPending(false);
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Quand on choisit un utilisateur -> charger ses zones + le centre de carte
  useEffect(() => {
    if (!selectedUserId) {
      setSelected(new Set());
      setInitial(new Set());
      setMapLat('');
      setMapLng('');
      setInitialMapLat('');
      setInitialMapLng('');
      setMsg(null);
      return;
    }
    (async () => {
      const [zonesRes, profileRes] = await Promise.all([
        supabase.from('user_zones').select('pays').eq('user_id', selectedUserId),
        supabase
          .from('profiles')
          .select('map_center_lat, map_center_lng')
          .eq('id', selectedUserId)
          .maybeSingle(),
      ]);

      if (zonesRes.error) {
        setMsg({ text: `Erreur zones: ${zonesRes.error.message}`, isSuccess: false });
        return;
      }
      const pays = new Set<string>((zonesRes.data || []).map(r => r.pays));
      setSelected(pays);
      setInitial(pays);

      if (profileRes.error) {
        setMsg({
          text: `Erreur profil (centre carte): ${profileRes.error.message}`,
          isSuccess: false,
        });
        setMapLat('');
        setMapLng('');
        setInitialMapLat('');
        setInitialMapLng('');
        return;
      }

      const lat = profileRes.data?.map_center_lat;
      const lng = profileRes.data?.map_center_lng;
      const latStr = lat != null ? String(lat) : '';
      const lngStr = lng != null ? String(lng) : '';
      setMapLat(latStr);
      setMapLng(lngStr);
      setInitialMapLat(latStr);
      setInitialMapLng(lngStr);

      setMsg(null);
    })();
  }, [selectedUserId]);

  const zonesChanged = useMemo(() => {
    if (selected.size !== initial.size) return true;
    for (const p of selected) if (!initial.has(p)) return true;
    return false;
  }, [selected, initial]);

  const mapChanged = useMemo(
    () => mapLat.trim() !== initialMapLat.trim() || mapLng.trim() !== initialMapLng.trim(),
    [mapLat, mapLng, initialMapLat, initialMapLng]
  );

  const hasChanges = zonesChanged || mapChanged;

  const selectedCountries = useMemo(
    () => CONTINENTS.flatMap(c => c.pays).filter(p => selected.has(p)),
    [selected]
  );

  const toggleCountry = (pays: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(pays)) next.delete(pays);
      else next.add(pays);
      return next;
    });
  };

  const continentState = (pays: string[]): 'all' | 'none' | 'partial' => {
    const count = pays.filter(p => selected.has(p)).length;
    if (count === 0) return 'none';
    if (count === pays.length) return 'all';
    return 'partial';
  };

  const toggleContinent = (pays: string[]) => {
    const state = continentState(pays);
    setSelected(prev => {
      const next = new Set(prev);
      if (state === 'all') {
        pays.forEach(p => next.delete(p));
      } else {
        pays.forEach(p => next.add(p));
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUserId || !hasChanges) return;
    setSaving(true);
    setMsg(null);

    const toAdd: string[] = [];
    const toRemove: string[] = [];

    selected.forEach(p => { if (!initial.has(p)) toAdd.push(p); });
    initial.forEach(p => { if (!selected.has(p)) toRemove.push(p); });

    try {
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('user_zones')
          .delete()
          .eq('user_id', selectedUserId)
          .in('pays', toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map(pays => ({ user_id: selectedUserId, pays }));
        const { error } = await supabase.from('user_zones').insert(rows);
        if (error) throw error;
      }

      if (mapChanged) {
        const latValue = mapLat.trim() === '' ? null : parseFloat(mapLat.trim());
        const lngValue = mapLng.trim() === '' ? null : parseFloat(mapLng.trim());
        if (
          (latValue !== null && isNaN(latValue)) ||
          (lngValue !== null && isNaN(lngValue))
        ) {
          throw new Error('Coordonnées invalides : latitude/longitude doivent être des nombres.');
        }
        const { error } = await supabase
          .from('profiles')
          .update({ map_center_lat: latValue, map_center_lng: lngValue })
          .eq('id', selectedUserId);
        if (error) throw error;
        setInitialMapLat(mapLat.trim());
        setInitialMapLng(mapLng.trim());
      }

      setInitial(new Set(selected));
      setMsg({ text: 'Zones enregistrées avec succès.', isSuccess: true });
    } catch (err: any) {
      setMsg({ text: `Erreur: ${err.message}`, isSuccess: false });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSelected(new Set());
    setInitial(new Set());
    setMapLat('');
    setMapLng('');
    setInitialMapLat('');
    setInitialMapLng('');
    setSelectedUserId('');
    setMsg(null);
  };

  // Valider une inscription : approuver le profil + marquer la demande approved
  const handleApprove = async (reg: PendingRegistration) => {
    if (!reg.user_id) {
      setMsg({ text: 'Erreur : utilisateur introuvable (user_id manquant).', isSuccess: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ approved: true })
        .eq('id', reg.user_id);
      if (profileError) throw profileError;

      const { error: regError } = await supabase
        .from('pending_registrations')
        .update({ status: 'approved' })
        .eq('id', reg.id);
      if (regError) throw regError;

      setMsg({ text: `Inscription validée pour ${reg.email}.`, isSuccess: true });
      await fetchPending();
    } catch (err: any) {
      setMsg({ text: `Erreur: ${err.message}`, isSuccess: false });
    } finally {
      setSaving(false);
    }
  };

  // Refuser une inscription : marquer la demande rejected + profil non approuvé
  const handleReject = async (reg: PendingRegistration) => {
    if (!reg.user_id) {
      setMsg({ text: 'Erreur : utilisateur introuvable (user_id manquant).', isSuccess: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const { error: regError } = await supabase
        .from('pending_registrations')
        .update({ status: 'rejected' })
        .eq('id', reg.id);
      if (regError) throw regError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ approved: false })
        .eq('id', reg.user_id);
      if (profileError) throw profileError;

      setMsg({ text: `Inscription refusée pour ${reg.email}.`, isSuccess: true });
      await fetchPending();
    } catch (err: any) {
      setMsg({ text: `Erreur: ${err.message}`, isSuccess: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Gestion des zones par utilisateur</h1>

      {/* Inscriptions en attente */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Inscriptions en attente</h2>
        {loadingPending ? (
          <p style={mutedStyle}>Chargement des inscriptions...</p>
        ) : pending.length === 0 ? (
          <p style={mutedStyle}>Aucune inscription en attente.</p>
        ) : (
          <div style={pendingListStyle}>
            {pending.map(reg => (
              <div key={reg.id} style={{ ...pendingItemStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '10px' : 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{reg.email}</div>
                  <div style={mutedStyle}>
                    Demandée le {new Date(reg.created_date).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleApprove(reg)}
                    disabled={saving}
                    style={{ ...approveButtonStyle, flex: isMobile ? 1 : undefined }}
                  >
                    Valider
                  </button>
                  <button
                    onClick={() => handleReject(reg)}
                    disabled={saving}
                    style={{ ...rejectButtonStyle, flex: isMobile ? 1 : undefined }}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sélecteur d'utilisateur */}
      <div style={cardStyle}>
        <label style={labelStyle}>Utilisateur</label>
        <select
          value={selectedUserId}
          onChange={e => setSelectedUserId(e.target.value)}
          style={inputStyle}
          disabled={loadingUsers}
        >
          <option value="">-- Choisir un utilisateur --</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.email}</option>
          ))}
        </select>
        {loadingUsers && <p style={mutedStyle}>Chargement des utilisateurs...</p>}
        {selectedUserId && (
          <div style={{ marginTop: '15px' }}>
            <ZonesMap allowedCountries={selectedCountries} />
          </div>
        )}
      </div>

      {msg && <div style={messageStyle(msg.isSuccess)}>{msg.text}</div>}

      {/* Pays par continent */}
      {selectedUserId && (
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Pays autorisés</h2>
          {CONTINENTS.map(({ continent, pays }) => {
            const state = continentState(pays);
            return (
              <div key={continent} style={continentBlockStyle}>
                <div style={continentHeaderStyle}>
                  <input
                    type="checkbox"
                    ref={el => { if (el) el.indeterminate = state === 'partial'; }}
                    checked={state === 'all'}
                    onChange={() => toggleContinent(pays)}
                    style={{ marginRight: '8px', cursor: 'pointer' }}
                  />
                  <strong>{continent}</strong>
                  <span style={countStyle}>
                    ({pays.filter(p => selected.has(p)).length}/{pays.length})
                  </span>
                </div>
                <div style={{ ...countriesGridStyle, gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 200}px, 1fr))` }}>
                  {pays.map(p => (
                    <label key={p} style={countryLabelStyle}>
                      <input
                        type="checkbox"
                        checked={selected.has(p)}
                        onChange={() => toggleCountry(p)}
                        style={{ marginRight: '6px', cursor: 'pointer' }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Centre de la carte (Page Sites) */}
          <div style={mapCenterBlockStyle}>
            <h2 style={sectionTitleStyle}>Centre de la carte (Page Sites)</h2>
            <p style={mutedStyle}>
              Coordonnées du centre de carte affiché pour cet utilisateur. Laisser vide pour utiliser la valeur par défaut.
            </p>
            <div style={{ ...coordsRowStyle, flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={coordFieldStyle}>
                <label style={labelStyle}>Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={mapLat}
                  onChange={e => setMapLat(e.target.value)}
                  placeholder="ex: 48.8566"
                  style={inputStyle}
                />
              </div>
              <div style={coordFieldStyle}>
                <label style={labelStyle}>Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={mapLng}
                  onChange={e => setMapLng(e.target.value)}
                  placeholder="ex: 2.3522"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Boutons */}
          <div style={buttonsStyle}>
            <button onClick={handleSave} disabled={!hasChanges || saving} style={hasChanges && !saving ? buttonStyle : disabledButtonStyle}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button onClick={handleCancel} style={buttonStyle}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles (thème du site)
const containerStyle: React.CSSProperties = {
  padding: '10px',
  maxWidth: '900px',
  margin: '0 auto',
  fontFamily: 'Barlow, sans-serif',
};

const titleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '24px',
  marginBottom: '20px',
  textAlign: 'center',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #ddd',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '20px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '18px',
  marginBottom: '15px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px',
  marginBottom: '5px',
};

const inputStyle: React.CSSProperties = {
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '14px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  width: '100%',
  boxSizing: 'border-box',
};

const mutedStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#666',
  marginTop: '5px',
  marginBottom: '10px',
};

const continentBlockStyle: React.CSSProperties = {
  marginBottom: '20px',
  paddingBottom: '15px',
  borderBottom: '1px solid #eee',
};

const continentHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: '10px',
  fontSize: '15px',
};

const countStyle: React.CSSProperties = {
  marginLeft: '10px',
  fontSize: '13px',
  color: '#666',
  fontWeight: 200,
};

const countriesGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '8px',
  marginLeft: '24px',
};

const countryLabelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 200,
  fontFamily: 'Barlow, sans-serif',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
};

const mapCenterBlockStyle: React.CSSProperties = {
  marginBottom: '20px',
  paddingBottom: '15px',
  borderBottom: '1px solid #eee',
};

const coordsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '15px',
};

const coordFieldStyle: React.CSSProperties = {
  flex: 1,
};

const buttonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  justifyContent: 'flex-end',
  marginTop: '15px',
};

const baseButton: React.CSSProperties = {
  padding: '10px 20px',
  border: '1px solid black',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  backgroundColor: '#E5E5E4',
  color: 'black',
};

const buttonStyle: React.CSSProperties = { ...baseButton };

const disabledButtonStyle: React.CSSProperties = {
  ...baseButton,
  backgroundColor: '#f5f5f5',
  opacity: 0.5,
  cursor: 'not-allowed',
};

const approveButtonStyle: React.CSSProperties = {
  ...baseButton,
  backgroundColor: '#008000',
  color: '#fff',
  border: '1px solid #008000',
};

const rejectButtonStyle: React.CSSProperties = {
  ...baseButton,
  backgroundColor: '#FF0000',
  color: '#fff',
  border: '1px solid #FF0000',
};

const pendingListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const pendingItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px',
  border: '1px solid #eee',
  borderRadius: '6px',
  backgroundColor: '#fafafa',
};

const messageStyle = (isSuccess: boolean): React.CSSProperties => ({
  padding: '10px',
  marginBottom: '15px',
  borderRadius: '4px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px',
  backgroundColor: isSuccess ? '#d4edda' : '#f8d7da',
  color: isSuccess ? '#155724' : '#721c24',
  border: `1px solid ${isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
  textAlign: 'center',
});