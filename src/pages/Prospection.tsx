import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { useUserZones } from '../lib/userZones';
import { useIsMobile } from '../lib/useIsMobile';
import { Autocomplete } from '@react-google-maps/api';
import { isCountryAllowed } from '../lib/countryMatch';

interface Suggestion {
  id: string;
  groupe: string;
  noms: string;
  domaine: string;
  pays: string;
  adress: { formatted: string };
  latitude: string;
  longitude: string;
  source_url: string;
  score: number;
  score_reason: string;
  approved: string | null;
  scanned_at: string | null;
  created_date?: string | null;
}

interface Groupe {
  ID: string;
  nom_groupe: string;
}

export default function Prospection() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { allowedCountries, loadingZones } = useUserZones();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'all'>('pending');
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');
  const [message, setMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const PAGE_SIZE = 50;
  const [pageIndex, setPageIndex] = useState(0);
  const [columnSort, setColumnSort] = useState<{ col: 'score' | 'pays'; dir: 'asc' | 'desc' } | null>(null);

  // --- Modale d'analyse (création de site, identique à Contacts) ---
  const [editingSuggestion, setEditingSuggestion] = useState<Suggestion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newSiteData, setNewSiteData] = useState({
    noms: '', groupe: '', pays: '', adress: { formatted: '' },
    latitude: '', longitude: '', couleur: 'Non visités', domaine: 'Ciment',
    observations: '',
  });
  const [siteNameError, setSiteNameError] = useState('');
  const [isSiteSubmitting, setIsSiteSubmitting] = useState(false);
  const [siteSubmitMessage, setSiteSubmitMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [showSiteGroupDropdown, setShowSiteGroupDropdown] = useState(false);
  const [filteredSiteGroupes, setFilteredSiteGroupes] = useState<Groupe[]>([]);
  const [addressAutocomplete, setAddressAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const colorTags = ['Non visités', 'Visités', 'Visités il y a +18mois', 'A visiter', 'Fermés'];
  const domainTags = ['Ciment', 'Mineralurgie', 'Platre', 'Papeterie', 'Fertilisant', 'Chimie', 'Calcination', 'Incinération', 'Autre'];

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const pageSize = 1000;
      let allData: Suggestion[] = [];
      while (true) {
        const from = allData.length;
        const { data, error } = await supabase
          .from('prospect_suggestions')
          .select('*')
          .order('score', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) {
          console.error('Erreur chargement suggestions:', error.message);
          setSuggestions([]);
          return;
        }
        allData = allData.concat(data || []);
        if (!data || data.length < pageSize) break;
      }
      setSuggestions(allData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadingZones) return;
    fetchSuggestions();
    supabase
      .from('groupes')
      .select('ID, nom_groupe')
      .order('nom_groupe', { ascending: true })
      .then(({ data }) => setGroupes(data || []));
  }, [loadingZones, fetchSuggestions]);

  // Filtrage par pays attribués (renforcé par RLS côté base, mais on filtre aussi côté client)
  const isAdmin = allowedCountries === null;

  const matchesSearch = useCallback((s: Suggestion) => {
    if (!s.pays) {
      if (!isAdmin) return false;
    } else if (allowedCountries && !isCountryAllowed(allowedCountries, s.pays)) {
      return false;
    }
    if (filterStatus === 'pending' && s.approved !== null) return false;
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      (s.groupe && s.groupe.toLowerCase().includes(q)) ||
      (s.noms && s.noms.toLowerCase().includes(q)) ||
      (s.domaine && s.domaine.toLowerCase().includes(q)) ||
      (s.pays && s.pays.toLowerCase().includes(q)) ||
      (s.adress?.formatted && s.adress.formatted.toLowerCase().includes(q))
    );
  }, [isAdmin, allowedCountries, filterStatus, searchText]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchText, filterStatus, sortBy, columnSort]);

  const suggestionDate = (s: Suggestion): number => {
    const t = new Date(s.scanned_at ?? s.created_date ?? '').getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  // Tri sur le total des résultats filtrés (les colonnes cliquables prennent le pas sur le select de tri)
  const visibleSuggestions = useMemo(() => {
    const filtered = [...suggestions.filter(matchesSearch)];
    if (columnSort) {
      const factor = columnSort.dir === 'asc' ? 1 : -1;
      if (columnSort.col === 'pays') {
        filtered.sort((a, b) => (a.pays || '').localeCompare(b.pays || '') * factor);
      } else {
        filtered.sort((a, b) => ((a.score ?? 0) - (b.score ?? 0)) * factor);
      }
    } else if (sortBy === 'date') {
      filtered.sort((a, b) => suggestionDate(b) - suggestionDate(a));
    } else {
      filtered.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    return filtered;
  }, [suggestions, matchesSearch, sortBy, columnSort]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(visibleSuggestions.length / PAGE_SIZE) - 1);
    setPageIndex(p => Math.min(p, maxPage));
  }, [visibleSuggestions.length]);

  // Premier clic : ordre croissant / alphabétique ; second clic : ordre inverse
  const handleColumnSort = (col: 'score' | 'pays') => {
    setColumnSort(prev => {
      if (prev?.col === col) {
        return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { col, dir: 'asc' };
    });
  };

  const pageStart = pageIndex * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, visibleSuggestions.length);

  // --- Modération : refuser (bouton supprimer rouge) ---
  const handleRefuse = async (s: Suggestion) => {
    const { error } = await supabase
      .from('prospect_suggestions')
      .update({ approved: 'refused', updated_date: new Date().toISOString() })
      .eq('id', s.id);
    if (error) {
      setMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
      return;
    }
    setSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, approved: 'refused' } : x));
  };

  // --- Modération : déjà existant (bonne suggestion, site déjà en base) ---
  const handleExisting = async (s: Suggestion) => {
    const { error } = await supabase
      .from('prospect_suggestions')
      .update({ approved: 'existing', updated_date: new Date().toISOString() })
      .eq('id', s.id);
    if (error) {
      setMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
      return;
    }
    setSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, approved: 'existing' } : x));
  };

  // --- Ouvrir la modale d'analyse ---
  const handleAnalyze = (s: Suggestion) => {
    setEditingSuggestion(s);
    setShowModal(true);
    setFilteredSiteGroupes(groupes);
    const obs = s.source_url
      ? `${t('prospection.sourceObs')}: ${s.source_url}`
      : '';
    setNewSiteData({
      noms: s.noms,
      groupe: '',
      pays: s.pays,
      adress: { formatted: s.adress?.formatted ?? '' },
      latitude: s.latitude,
      longitude: s.longitude,
      couleur: 'Non visités',
      domaine: domainTags.includes(s.domaine) ? s.domaine : 'Autre',
      observations: obs,
    });
    setSiteNameError('');
    setSiteSubmitMessage(null);
  };

  const closeModal = () => { setShowModal(false); setEditingSuggestion(null); };

  // --- Autocomplete adresse ---
  const onAutocompleteLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    setAddressAutocomplete(autocomplete);
  }, []);

  const onAutocompletePlaceChanged = useCallback(() => {
    if (!addressAutocomplete) return;
    const place = addressAutocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;
    const countryComponent = place.address_components?.find(
      (component: any) => component.types.includes('country')
    );
    const country = countryComponent?.long_name || '';
    setNewSiteData(prev => ({
      ...prev,
      adress: { formatted: place.formatted_address || '' },
      pays: country,
      latitude: place.geometry.location.lat().toString(),
      longitude: place.geometry.location.lng().toString(),
    }));
  }, [addressAutocomplete]);

  const checkSiteExists = async (nom: string): Promise<boolean> => {
    if (!nom.trim()) return false;
    const { data } = await supabase
      .from('sites')
      .select('id')
      .ilike('noms', nom.trim())
      .maybeSingle();
    return !!data;
  };

  const handleSiteNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewSiteData(prev => ({ ...prev, noms: value }));
    if (!value.trim()) { setSiteNameError(''); return; }
    const exists = await checkSiteExists(value);
    setSiteNameError(exists ? t('sites.siteExists') : '');
  };

  const handleSiteGroupSearch = (value: string) => {
    setNewSiteData(prev => ({ ...prev, groupe: value }));
    setFilteredSiteGroupes(value === '' ? groupes : groupes.filter(g => g.nom_groupe.toLowerCase().includes(value.toLowerCase())));
  };

  const handleSelectSiteGroup = (groupe: Groupe) => {
    setNewSiteData(prev => ({ ...prev, groupe: groupe.nom_groupe }));
    setShowSiteGroupDropdown(false);
  };

  // --- Valider la modale : créer le site dans `sites` et marquer la suggestion approved ---
  const handleAddSite = async () => {
    if (!editingSuggestion) return;
    if (!newSiteData.noms.trim() || siteNameError || !newSiteData.groupe.trim() || !newSiteData.latitude.trim() || !newSiteData.longitude.trim()) return;
    setIsSiteSubmitting(true);
    setSiteSubmitMessage(null);
    try {
      const now = new Date().toISOString();
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from('sites').insert([{
        id: crypto.randomUUID(),
        noms: newSiteData.noms.trim(),
        groupe: newSiteData.groupe.trim(),
        pays: newSiteData.pays.trim(),
        adress: { formatted: newSiteData.adress.formatted.trim() },
        latitude: newSiteData.latitude.trim(),
        longitude: newSiteData.longitude.trim(),
        couleur: newSiteData.couleur,
        domaine: newSiteData.domaine,
        observations: newSiteData.observations.trim(),
        nb_contact: 0,
        dates_visites: [],
        owner: user?.id || null,
        created_date: now,
        updated_date: now
      }]);
      if (error) throw error;
      // marquer la suggestion comme approved
      await supabase
        .from('prospect_suggestions')
        .update({ approved: 'approved', updated_date: now })
        .eq('id', editingSuggestion.id);
      setSuggestions(prev => prev.map(x => x.id === editingSuggestion.id ? { ...x, approved: 'approved' } : x));
      setSiteSubmitMessage({ text: t('sites.siteAdded'), isSuccess: true });
      setTimeout(() => { closeModal(); }, 1000);
    } catch (error: any) {
      setSiteSubmitMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
    } finally {
      setIsSiteSubmitting(false);
    }
  };

  const scoreColor = (score: number): string => {
    if (score >= 75) return '#008000';
    if (score >= 50) return '#cc9900';
    return '#cc3300';
  };

  return (
    <div style={{ padding: '10px', width: 'calc(100% - 20px)', maxWidth: isMobile ? '100%' : '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
      <h2 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '20px', marginBottom: '15px' }}>
        {t('prospection.title')}
      </h2>
      <p style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '20px', color: '#333' }}>
        {t('prospection.subtitle')}
      </p>

      {message && message.text && (
        <div style={{
          padding: '10px', margin: '10px 0', borderRadius: '4px',
          fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
          backgroundColor: message.isSuccess ? '#d4edda' : '#f8d7da',
          color: message.isSuccess ? '#155724' : '#721c24',
          border: `1px solid ${message.isSuccess ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message.text}
        </div>
      )}

      {/* --- Section 1 : Prospection des sites --- */}
      <section>
        <h3 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '17px', marginBottom: '15px' }}>
          {t('prospection.sitesSection')}
        </h3>

        {/* Barre de recherche + filtres (sous le titre de section) */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '10px', marginBottom: '15px' }}>
        <input
          type="text"
          placeholder={t('prospection.searchPlaceholder')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            flex: 1, width: isMobile ? '100%' : 'auto', maxWidth: isMobile ? 'none' : '400px',
            boxSizing: 'border-box' as const, padding: '10px', border: '1px solid #ddd', borderRadius: '4px',
            fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px'
          }}
        />
        <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', whiteSpace: 'nowrap' }}>
          {t('prospection.matchingCount', { count: visibleSuggestions.length })}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={filterStatus === 'pending'}
            onChange={(e) => setFilterStatus(e.target.checked ? 'pending' : 'all')}
            style={{ width: '16px', height: '16px' }}
          />
          {t('prospection.pendingOnly')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', whiteSpace: 'nowrap' }}>
          {t('prospection.sortBy')}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'score' | 'date')}
            style={{
              padding: '6px', border: '1px solid #ddd', borderRadius: '4px',
              fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px'
            }}
          >
            <option value="score">{t('prospection.sortByRelevance')}</option>
            <option value="date">{t('prospection.sortByDate')}</option>
          </select>
        </label>
      </div>

        {loading || loadingZones ? (
          <p style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px' }}>{t('prospection.loading')}</p>
        ) : visibleSuggestions.length === 0 ? (
          <p style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px' }}>{t('prospection.noResults')}</p>
        ) : (
          <>
            <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#A6A6A6' }}>
              {!isMobile && (
                <div style={{ display: 'flex', gap: '10px', padding: '8px 10px', backgroundColor: '#E5E5E4', borderBottom: '1px solid #ddd', alignItems: 'center' }}>
                  <span style={{ ...listHeaderStyle, flex: 2 }}>{t('prospection.groupSite')}</span>
                  <span style={{ ...sortableHeaderStyle }} onClick={() => handleColumnSort('score')}>
                    {t('prospection.relevance')}{columnSort?.col === 'score' ? (columnSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                  <span style={{ ...listHeaderStyle, flex: 2 }}>{t('prospection.address')}</span>
                  <span style={{ ...sortableHeaderStyle }} onClick={() => handleColumnSort('pays')}>
                    {t('prospection.country')}{columnSort?.col === 'pays' ? (columnSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                  <span style={{ ...listHeaderStyle, flex: 1 }}>{t('prospection.source')}</span>
                  <span style={{ ...listHeaderStyle, width: '270px' }} />
                </div>
              )}
              {visibleSuggestions.slice(pageStart, pageEnd).map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '6px' : '10px',
                    padding: '10px', borderTop: '1px solid #eee', alignItems: isMobile ? 'stretch' : 'center',
                    backgroundColor: s.approved === 'refused' ? '#cfcfcf' : s.approved === 'approved' ? '#d4edda' : s.approved === 'existing' ? '#fff3cd' : '#A6A6A6',
                    opacity: s.approved ? 0.8 : 1,
                  }}
                >
                  {/* Groupe + site */}
                  <div style={{ flex: 2, minWidth: 0 }}>
                    <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '14px' }}>
                      {s.groupe} — {s.noms}
                    </span>
                    {isMobile && s.approved && (
                      <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '12px', marginLeft: '8px', color: s.approved === 'approved' ? '#008000' : s.approved === 'existing' ? '#cc9900' : '#cc0000' }}>
                        {s.approved === 'approved' ? t('prospection.statusApproved') : s.approved === 'existing' ? t('prospection.statusExisting') : t('prospection.statusRefused')}
                      </span>
                    )}
                    {s.domaine && (
                      <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '12px', color: '#444' }}>
                        {t('prospection.domain')}: {s.domaine}
                      </div>
                    )}
                  </div>

                  {/* Taux de pertinence */}
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '13px' }}>
                      {s.score}/100
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${s.score}%`, height: '100%', backgroundColor: scoreColor(s.score) }} />
                    </div>
                    {s.score_reason && (
                      <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '11px', color: '#444', marginTop: '2px' }}>
                        {s.score_reason}
                      </div>
                    )}
                  </div>

                  {/* Adresse */}
                  <div style={{ flex: 2, minWidth: 0, fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '13px', wordBreak: 'break-word' }}>
                    {s.adress?.formatted || t('prospection.unknown')}
                  </div>

                  {/* Pays */}
                  <div style={{ flex: 1, minWidth: 0, fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '13px' }}>
                    {s.pays || t('prospection.unknown')}
                  </div>

                  {/* Source de la suggestion */}
                  <div style={{ flex: 1, minWidth: 0, fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '13px' }}>
                    {s.source_url ? (
                      <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#000', textDecoration: 'underline', wordBreak: 'break-all' }}>
                        {t('prospection.openSource')}
                      </a>
                    ) : (
                      t('prospection.unknown')
                    )}
                  </div>

                  {/* Boutons : Supprimer, Déjà existant, Analyser */}
                  <div style={{ display: 'flex', gap: '6px', justifyContent: isMobile ? 'flex-end' : 'flex-end', width: isMobile ? '100%' : '270px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleRefuse(s)}
                      disabled={!!s.approved}
                      style={{
                        height: '30px', padding: '0 10px', border: '1px solid #000', borderRadius: '4px',
                        backgroundColor: s.approved === 'refused' ? '#b30000' : '#ff4444', color: '#fff',
                        cursor: s.approved ? 'not-allowed' : 'pointer', opacity: s.approved ? 0.6 : 1,
                        fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap',
                      }}
                    >
                      {t('prospection.refuse')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExisting(s)}
                      disabled={!!s.approved}
                      style={{
                        height: '30px', padding: '0 10px', border: '1px solid #000', borderRadius: '4px',
                        backgroundColor: s.approved === 'existing' ? '#996600' : '#ffcc00', color: '#000',
                        cursor: s.approved ? 'not-allowed' : 'pointer', opacity: s.approved ? 0.6 : 1,
                        fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap',
                      }}
                    >
                      {t('prospection.existing')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAnalyze(s)}
                      disabled={s.approved === 'approved'}
                      style={{
                        height: '30px', padding: '0 10px', border: '1px solid #000', borderRadius: '4px',
                        backgroundColor: s.approved === 'approved' ? '#007700' : '#00b35a', color: '#fff',
                        cursor: s.approved === 'approved' ? 'not-allowed' : 'pointer', opacity: s.approved === 'approved' ? 0.6 : 1,
                        fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap',
                      }}
                    >
                      {t('prospection.analyze')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Affichage par paquets de 50 : les 50 précédentes sont masquées au chargement des suivantes */}
            {visibleSuggestions.length > PAGE_SIZE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '15px 0' }}>
                <button
                  type="button"
                  onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                  disabled={pageIndex === 0}
                  style={{
                    height: '32px', padding: '0 20px', border: '1px solid #000', borderRadius: '4px',
                    backgroundColor: '#E5E5E4', cursor: pageIndex === 0 ? 'not-allowed' : 'pointer',
                    opacity: pageIndex === 0 ? 0.5 : 1,
                    fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
                  }}
                >
                  {t('prospection.prevPage')}
                </button>
                <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px' }}>
                  {t('prospection.pageCount', { page: pageIndex + 1, total: Math.ceil(visibleSuggestions.length / PAGE_SIZE) })}
                </span>
                <button
                  type="button"
                  onClick={() => setPageIndex(p => p + 1)}
                  disabled={pageEnd >= visibleSuggestions.length}
                  style={{
                    height: '32px', padding: '0 20px', border: '1px solid #000', borderRadius: '4px',
                    backgroundColor: '#E5E5E4', cursor: pageEnd >= visibleSuggestions.length ? 'not-allowed' : 'pointer',
                    opacity: pageEnd >= visibleSuggestions.length ? 0.5 : 1,
                    fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
                  }}
                >
                  {t('prospection.nextPage', { count: Math.min(PAGE_SIZE, visibleSuggestions.length - pageEnd) })}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* --- Section 2 : Recherche d'information / veille commerciale (IA à venir) --- */}
      <section style={{ marginTop: '40px' }}>
        <h3 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '17px', marginBottom: '10px' }}>
          {t('prospection.watchSection')}
        </h3>
        <p style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', color: '#333', marginBottom: '15px' }}>
          {t('prospection.watchDescription')}
        </p>
        <div
          style={{
            padding: '30px 20px', border: '2px dashed #bbb', borderRadius: '8px',
            backgroundColor: '#f5f5f5', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          }}
        >
          <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', color: '#555' }}>
            {t('prospection.watchPlaceholder')}
          </span>
        </div>
      </section>

      {/* Modale d'analyse (création de site, identique à Contacts) */}
      {showModal && (
        <>
          <div style={modalOverlayStyle} onClick={closeModal} />
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>{t('prospection.analyzeTitle')}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={modalLabelStyle}>{t('sites.siteName')}</label>
                <input
                  type="text"
                  value={newSiteData.noms}
                  onChange={handleSiteNameChange}
                  style={{ ...inputStyle, borderColor: siteNameError ? '#ff4444' : '#ddd' }}
                  placeholder={t('sites.siteNamePlaceholder')}
                />
                {siteNameError && <span style={errorStyle}>{siteNameError}</span>}
              </div>

              <div style={{ position: 'relative' }}>
                <label style={modalLabelStyle}>{t('sites.group')}</label>
                <input
                  type="text"
                  value={newSiteData.groupe}
                  onChange={(e) => handleSiteGroupSearch(e.target.value)}
                  onFocus={() => { setShowSiteGroupDropdown(true); setFilteredSiteGroupes(groupes); }}
                  style={inputStyle}
                  placeholder={t('common.select')}
                />
                {showSiteGroupDropdown && filteredSiteGroupes.length > 0 && (
                  <div style={dropdownStyle} onMouseDown={e => e.preventDefault()}>
                    {filteredSiteGroupes.map(groupe => (
                      <div
                        key={groupe.ID}
                        onClick={() => handleSelectSiteGroup(groupe)}
                        style={{ ...dropdownItemStyle, backgroundColor: newSiteData.groupe === groupe.nom_groupe ? '#f0f0f0' : 'transparent' }}
                      >
                        {groupe.nom_groupe}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={modalLabelStyle}>{t('sites.domain')}</label>
                <select
                  value={newSiteData.domaine}
                  onChange={(e) => setNewSiteData(prev => ({ ...prev, domaine: e.target.value }))}
                  style={inputStyle}
                >
                  {domainTags.map(tag => <option key={tag} value={tag}>{t('prospection.domains.' + tag)}</option>)}
                </select>
              </div>

              <div>
                <label style={modalLabelStyle}>{t('sites.color')}</label>
                <select
                  value={newSiteData.couleur}
                  onChange={(e) => setNewSiteData(prev => ({ ...prev, couleur: e.target.value }))}
                  style={inputStyle}
                >
                  {colorTags.map(tag => <option key={tag} value={tag}>{t('sites.colors.' + tag)}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={modalLabelStyle}>{t('sites.address')}</label>
              <Autocomplete onLoad={onAutocompleteLoad} onPlaceChanged={onAutocompletePlaceChanged}>
                <input
                  type="text"
                  value={newSiteData.adress.formatted}
                  onChange={(e) => setNewSiteData(prev => ({ ...prev, adress: { formatted: e.target.value } }))}
                  style={inputStyle}
                  placeholder={t('sites.addressPlaceholder')}
                />
              </Autocomplete>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={modalLabelStyle}>{t('sites.country')}</label>
              <input type="text" value={newSiteData.pays} readOnly style={{ ...inputStyle, backgroundColor: '#f5f5f5' }} placeholder={t('sites.countryAutoPlaceholder')} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={modalLabelStyle}>{t('sites.observations')}</label>
              <textarea
                value={newSiteData.observations}
                onChange={(e) => setNewSiteData(prev => ({ ...prev, observations: e.target.value }))}
                style={{ ...inputStyle, height: '100px', resize: 'vertical' }}
                placeholder={t('sites.observationsPlaceholder')}
              />
            </div>

            {siteSubmitMessage && (
              <div style={{
                padding: '10px', marginBottom: '15px', borderRadius: '4px',
                fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
                backgroundColor: siteSubmitMessage.isSuccess ? '#d4edda' : '#f8d7da',
                color: siteSubmitMessage.isSuccess ? '#155724' : '#721c24',
                border: `1px solid ${siteSubmitMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
                textAlign: 'center'
              }}>
                {siteSubmitMessage.text}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={closeModal} style={buttonStyle}>{t('common.cancel')}</button>
              <button
                type="button"
                onClick={handleAddSite}
                disabled={!newSiteData.noms.trim() || !!siteNameError || !newSiteData.groupe.trim() || !newSiteData.latitude.trim() || !newSiteData.longitude.trim() || isSiteSubmitting}
                style={{
                  ...buttonStyle,
                  opacity: (!newSiteData.noms.trim() || !!siteNameError || !newSiteData.groupe.trim() || !newSiteData.latitude.trim() || !newSiteData.longitude.trim() || isSiteSubmitting) ? 0.5 : 1,
                  cursor: (!newSiteData.noms.trim() || !!siteNameError || !newSiteData.groupe.trim() || !newSiteData.latitude.trim() || !newSiteData.longitude.trim() || isSiteSubmitting) ? 'not-allowed' : 'pointer'
                }}
              >
                {isSiteSubmitting ? t('sites.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Styles (cohérents avec Contacts.tsx)
const inputStyle = {
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '14px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  backgroundColor: '#fff',
  width: '100%',
  boxSizing: 'border-box' as const
};

const errorStyle = {
  color: '#ff4444',
  fontSize: '12px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200
};

const dropdownStyle = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  maxHeight: '200px',
  overflowY: 'auto',
  backgroundColor: '#fff',
  border: '1px solid #ddd',
  borderRadius: '4px',
  zIndex: 1000,
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
};

const dropdownItemStyle = {
  padding: '8px 10px',
  cursor: 'pointer',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px'
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
  justifyContent: 'center'
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
  backdropFilter: 'blur(5px)',
  zIndex: 999
};

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  backgroundColor: '#A6A6A6',
  borderRadius: '8px',
  padding: '20px',
  zIndex: 1000,
  width: 'min(560px, calc(100vw - 20px))',
  maxWidth: 'calc(100vw - 20px)',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
};

const listHeaderStyle: React.CSSProperties = {
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 'bold',
  fontSize: '13px',
  color: '#000',
};

const sortableHeaderStyle: React.CSSProperties = {
  ...listHeaderStyle,
  flex: 1,
  cursor: 'pointer',
  userSelect: 'none',
};

const modalTitleStyle: React.CSSProperties = {
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 'bold',
  fontSize: '20px',
  marginBottom: '20px',
  textAlign: 'center'
};

const modalLabelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px',
  marginBottom: '5px'
};
