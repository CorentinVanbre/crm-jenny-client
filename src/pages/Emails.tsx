import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { useUserZones } from '../lib/userZones';
import { CONTINENTS } from '../lib/countries';
import { useIsMobile } from '../lib/useIsMobile';

interface Site {
  id: string;
  noms: string;
  groupe: string;
  pays: string;
}

interface Contact {
  id: string;
  noms: string;
  prenom: string;
  groupe: string;
  site: string;
  email: string;
  langue: string;
  contact_actif: boolean;
}

const LANGUAGES = ['Français', 'Anglais', 'Espagnol'] as const;
type Language = (typeof LANGUAGES)[number];

export default function Emails() {
  const { t } = useTranslation();
  const { allowedCountries, loadingZones } = useUserZones();
  const isMobile = useIsMobile();

  const [allSites, setAllSites] = useState<Site[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(new Set(LANGUAGES));
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());

  const [results, setResults] = useState<string[]>([]);
  const [hasFetched, setHasFetched] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const isAdmin = allowedCountries === null;

  const assignedCountries = useMemo<string[]>(() => {
    if (isAdmin) return CONTINENTS.flatMap(c => c.pays);
    return allowedCountries || [];
  }, [allowedCountries, isAdmin]);

  const assignedSet = useMemo(() => new Set(assignedCountries), [assignedCountries]);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const [sitesRes, contactsRes] = await Promise.all([
        supabase.from('sites').select('id, noms, groupe, pays'),
        supabase.from('contacts').select('id, noms, prenom, groupe, site, email, langue, contact_actif'),
      ]);

      if (sitesRes.error) throw sitesRes.error;
      if (contactsRes.error) throw contactsRes.error;

      setAllSites(sitesRes.data || []);
      setAllContacts(contactsRes.data || []);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (loadingZones) return;
    setSelectedCountries(new Set(assignedCountries));
  }, [loadingZones, assignedCountries]);

  const sitePaysMap = useMemo(() => {
    const map: Record<string, string> = {};
    allSites.forEach(s => {
      map[s.noms] = s.pays;
    });
    return map;
  }, [allSites]);

  const filteredContacts = useMemo(() => {
    if (loadingData || loadingZones) return [];

    const countryFilter = (pays: string) => {
      if (!isAdmin) {
        if (!assignedSet.has(pays)) return false;
      }
      if (selectedCountries.size > 0 && !selectedCountries.has(pays)) return false;
      return true;
    };

    return allContacts.filter(c => {
      if (!c.email) return false;
      const pays = sitePaysMap[c.site] || '';
      if (!countryFilter(pays)) return false;
      if (selectedLanguages.size > 0 && !selectedLanguages.has(c.langue as Language)) return false;
      return true;
    });
  }, [
    allContacts,
    sitePaysMap,
    loadingData,
    loadingZones,
    isAdmin,
    assignedSet,
    selectedCountries,
    selectedLanguages,
  ]);

  const countByLanguage = useMemo(() => {
    const counts: Record<Language, number> = { Français: 0, Anglais: 0, Espagnol: 0 };
    if (loadingData || loadingZones) return counts;

    allContacts.forEach(c => {
      if (!c.email) return;
      const pays = sitePaysMap[c.site] || '';
      if (!isAdmin && !assignedSet.has(pays)) return;
      if (c.langue in counts) {
        counts[c.langue as Language] += 1;
      }
    });
    return counts;
  }, [allContacts, sitePaysMap, loadingData, loadingZones, isAdmin, assignedSet]);

  const totalAssignedContacts = useMemo(
    () => LANGUAGES.reduce(
      (sum, lang) => (selectedLanguages.has(lang) ? sum + countByLanguage[lang] : sum),
      0
    ),
    [countByLanguage, selectedLanguages]
  );

  const toggleLanguage = (lang: Language) => {
    setSelectedLanguages(prev => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang);
      else next.add(lang);
      return next;
    });
  };

  const toggleCountry = (pays: string) => {
    setSelectedCountries(prev => {
      const next = new Set(prev);
      if (next.has(pays)) next.delete(pays);
      else next.add(pays);
      return next;
    });
  };

  const continentState = (pays: string[]): 'all' | 'none' | 'partial' => {
    const selectable = pays.filter(p => assignedSet.has(p));
    if (selectable.length === 0) return 'none';
    const count = selectable.filter(p => selectedCountries.has(p)).length;
    if (count === 0) return 'none';
    if (count === selectable.length) return 'all';
    return 'partial';
  };

  const toggleContinent = (pays: string[]) => {
    const selectable = pays.filter(p => assignedSet.has(p));
    if (selectable.length === 0) return;
    const state = continentState(pays);
    setSelectedCountries(prev => {
      const next = new Set(prev);
      if (state === 'all') {
        selectable.forEach(p => next.delete(p));
      } else {
        selectable.forEach(p => next.add(p));
      }
      return next;
    });
  };

  const selectAllCountries = () => {
    setSelectedCountries(new Set(assignedCountries));
  };

  const deselectAllCountries = () => {
    setSelectedCountries(new Set());
  };

  const handleFetch = () => {
    setFetching(true);
    setError(null);
    setHasFetched(true);
    try {
      const emails = filteredContacts.map(c => c.email).filter(Boolean);
      const unique = Array.from(new Set(emails));
      setResults(unique);
    } catch (err: any) {
      setError(err.message || String(err));
      setResults([]);
    } finally {
      setFetching(false);
    }
  };

  const handleCopy = async () => {
    if (results.length === 0) {
      setCopyMsg(t('emails.noEmailsToCopy'));
      setTimeout(() => setCopyMsg(null), 2000);
      return;
    }
    const text = results.join(' ; ');
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg(t('emails.copySuccess'));
    } catch {
      setCopyMsg(t('emails.copyError'));
    }
    setTimeout(() => setCopyMsg(null), 2000);
  };

  const busy = loadingZones || loadingData;
  const copySuccessMsg = copyMsg && (copyMsg.includes('!') || copyMsg.toLowerCase().includes('success'));

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>{t('emails.title')}</h1>

      {error && <div style={messageStyle(false)}>{t('emails.error', { message: error })}</div>}

      {busy ? (
        <p style={mutedStyle}>{t('emails.loading')}</p>
      ) : assignedCountries.length === 0 ? (
        <div style={cardStyle}>
          <p style={mutedStyle}>{t('emails.noZones')}</p>
        </div>
      ) : (
        <>
          <div style={cardStyle}>
            <div style={{ ...langRowStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
              <span style={sectionLabelStyle}>{t('emails.languages')} ({t('emails.byLanguage')})</span>
              <div style={tagsRowStyle}>
                {LANGUAGES.map(lang => {
                  const active = selectedLanguages.has(lang);
                  return (
                    <span
                      key={lang}
                      style={langTagStyle(active)}
                      onClick={() => toggleLanguage(lang)}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.02)'}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                    >
                      {lang} ({countByLanguage[lang]})
                    </span>
                  );
                })}
              </div>
            </div>
            <p style={mutedStyle}>
              {t('emails.totalContacts', { count: totalAssignedContacts })}
            </p>
          </div>

          <div style={cardStyle}>
            <div style={{ ...resultsHeaderStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleFetch}
                  disabled={fetching}
                  style={fetching ? disabledButtonStyle : buttonStyle}
                >
                  {fetching ? t('emails.fetching') : t('emails.fetch')}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={results.length === 0}
                  style={results.length === 0 ? disabledButtonStyle : buttonStyle}
                >
                  {t('emails.copy')}
                </button>
              </div>
              <span style={mutedStyle}>
                {t('emails.emailsCount', { count: results.length })}
              </span>
            </div>

            {copyMsg && (
              <div style={messageStyle(!!copySuccessMsg)}>{copyMsg}</div>
            )}

            <textarea
              readOnly
              value={hasFetched ? results.join(' ; ') : ''}
              placeholder={hasFetched && results.length === 0 ? t('emails.noEmails') : ''}
              style={resultsAreaStyle}
            />
          </div>

          <div style={cardStyle}>
            <div style={{ ...countriesHeaderStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
              <h2 style={sectionTitleStyle}>{t('emails.countries')}</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={selectAllCountries} style={buttonStyle}>
                  {t('emails.selectAll')}
                </button>
                <button type="button" onClick={deselectAllCountries} style={buttonStyle}>
                  {t('emails.deselectAll')}
                </button>
              </div>
            </div>

            {CONTINENTS.map(({ continent, pays }) => {
              const selectable = pays.filter(p => assignedSet.has(p));
              const state = continentState(pays);
              const continentDisabled = selectable.length === 0;
              return (
                <div key={continent} style={continentBlockStyle}>
                  <div style={continentHeaderStyle}>
                    <input
                      type="checkbox"
                      ref={el => { if (el) el.indeterminate = state === 'partial'; }}
                      checked={state === 'all'}
                      onChange={() => toggleContinent(pays)}
                      disabled={continentDisabled}
                      style={{ marginRight: '8px', cursor: continentDisabled ? 'not-allowed' : 'pointer' }}
                    />
                    <strong>{continent}</strong>
                    <span style={countStyle}>
                      ({selectable.filter(p => selectedCountries.has(p)).length}/{selectable.length})
                    </span>
                  </div>
                  <div style={{ ...countriesGridStyle, gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 200}px, 1fr))` }}>
                    {pays.map(p => {
                      const isAssigned = assignedSet.has(p);
                      return (
                        <label
                          key={p}
                          style={isAssigned ? countryLabelStyle : disabledCountryLabelStyle}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCountries.has(p)}
                            onChange={() => toggleCountry(p)}
                            disabled={!isAssigned}
                            style={{ marginRight: '6px', cursor: isAssigned ? 'pointer' : 'not-allowed' }}
                          />
                          {p}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

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
  margin: 0,
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 'bold',
  fontSize: '15px',
};

const mutedStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#666',
  marginTop: '8px',
  marginBottom: '4px',
};

const langRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  marginBottom: '5px',
};

const tagsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

const tagBaseStyle: React.CSSProperties = {
  height: '30px',
  padding: '0 12px',
  border: '1px solid black',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px',
  marginLeft: '2px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  transition: 'transform 0.2s ease',
};

const langTagStyle = (isSelected: boolean): React.CSSProperties => ({
  ...tagBaseStyle,
  backgroundColor: '#E5E5E4',
  fontWeight: isSelected ? 'bold' : 200,
  color: '#000000',
});

const resultsHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  marginBottom: '15px',
};

const resultsAreaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px',
  minHeight: '120px',
  resize: 'vertical',
  backgroundColor: '#f9f9f9',
};

const countriesHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  marginBottom: '15px',
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

const disabledCountryLabelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 200,
  fontFamily: 'Barlow, sans-serif',
  display: 'flex',
  alignItems: 'center',
  cursor: 'not-allowed',
  color: '#aaa',
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
