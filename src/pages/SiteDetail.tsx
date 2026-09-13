import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Autocomplete } from '@react-google-maps/api';

// Types
interface Address {
  formatted?: string;
}

interface Site {
  id: string;
  groupe: string;
  noms: string;
  adress: Address;
  pays: string;
  latitude: string;
  longitude: string;
  couleur: string;
  domaine: string;
  observations: string;
  datevisite: string;
  nb_contact: number;
  dates_visites: string[];
}

interface Groupe {
  ID: string;
  nom_groupe: string;
  site_web?: string;
}

interface Contact {
  id: string;
  noms: string;
  prenom: string;
  fonction: string;
  email: string;
  num_mobile: string;
  num_fixe: string;
  observations: string;
  contact_actif: boolean;
  site: string;
}

export default function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Données du formulaire
  const [formData, setFormData] = useState<Omit<Site, 'id' | 'nb_contact' | 'latitude' | 'longitude' | 'dates_visites'> & { dates_visites?: string[] }>({
    groupe: '',
    noms: '',
    adress: { formatted: '' },
    pays: '',
    couleur: '',
    domaine: '',
    observations: '',
    datevisite: '',
  });

  // États pour les groupes
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [filteredGroupes, setFilteredGroupes] = useState<Groupe[]>([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  // États pour les contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const [originalDatevisite, setOriginalDatevisite] = useState<string>('');
  const [originalGroupe, setOriginalGroupe] = useState<string>('');
  const [isModified, setIsModified] = useState(false);
  const [addressAutocomplete, setAddressAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);

  // Charger le site et les groupes
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);
      setIsModified(false);

      try {
        // Charger les groupes
        const { data: groupesData, error: groupesError } = await supabase
          .from('groupes')
          .select('ID, nom_groupe')
          .order('nom_groupe', { ascending: true });

        if (groupesError) throw groupesError;
        setGroupes(groupesData || []);
        setFilteredGroupes(groupesData || []);

        // Charger le site
        const { data: siteData, error: siteError } = await supabase
          .from('sites')
          .select('*')
          .eq('id', id)
          .single();

        if (siteError) throw siteError;

        if (siteData) {
          setSite(siteData);
          setFormData({
            groupe: siteData.groupe || '',
            noms: siteData.noms || '',
            adress: { formatted: siteData.adress?.formatted || '' },
            pays: siteData.pays || '',
            couleur: siteData.couleur || '',
            domaine: siteData.domaine || '',
            observations: siteData.observations || '',
            datevisite: siteData.datevisite || '',
          });
          setOriginalDatevisite(siteData.datevisite || '');
          setOriginalGroupe(siteData.groupe || '');

          // Charger les contacts du site
          await fetchContacts(siteData.noms);
        }
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Charger les contacts du site
  const fetchContacts = async (siteName: string) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .ilike('site', siteName);

      if (error) throw error;
      setContacts(data || []);
    } catch (err: any) {
      console.error('Erreur lors du chargement des contacts:', err.message);
    }
  };

  // Filtrer les groupes
  const handleGroupSearch = (value: string) => {
    setFormData(prev => ({ ...prev, groupe: value }));
    if (value === '') {
      setFilteredGroupes(groupes);
    } else {
      setFilteredGroupes(groupes.filter(g =>
        g.nom_groupe.toLowerCase().includes(value.toLowerCase())
      ));
    }
    setShowGroupDropdown(true);
    if (!isEditing) {
      setIsModified(false);
    }
  };

  // Sélectionner un groupe
  const handleSelectGroup = (groupe: Groupe) => {
    setFormData(prev => ({ ...prev, groupe: groupe.nom_groupe }));
    setShowGroupDropdown(false);
    setIsModified(true);
  };

  // Initialiser l'Autocomplete pour l'adresse
  const onLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    setAddressAutocomplete(autocomplete);
  }, []);

  const onPlaceChanged = useCallback(() => {
    if (!addressAutocomplete) return;

    const place = addressAutocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;

    const countryComponent = place.address_components?.find(
      (component: any) => component.types.includes('country')
    );
    const country = countryComponent?.long_name || '';

    setFormData(prev => ({
      ...prev,
      adress: { formatted: place.formatted_address || '' },
      pays: country,
    }));
    setIsModified(true);
  }, [addressAutocomplete]);

  // Gestion des changements pour couleur et date
  const handleColorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setFormData(prev => ({
      ...prev,
      couleur: value
    }));
    setIsModified(true);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData(prev => ({
      ...prev,
      datevisite: value
    }));
    setIsModified(true);
  };

  const handleObservationsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target;
    setFormData(prev => ({
      ...prev,
      observations: value
    }));
    setIsModified(true);
  };

  // Gestion des changements pour les autres champs (en mode édition)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setIsModified(true);
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      adress: { formatted: e.target.value }
    }));
    setIsModified(true);
  };

  // Enregistrer les modifications
  const handleSave = async () => {
    if (!site) return;

    setSaveMessage(null);

    try {
      const updateData: any = {
        couleur: formData.couleur,
        observations: formData.observations,
        updated_date: new Date().toISOString(),
      };

      if (formData.datevisite !== originalDatevisite) {
        updateData.datevisite = formData.datevisite;
        if (originalDatevisite) {
          const newDatesVisites = [...(site.dates_visites || []), originalDatevisite];
          updateData.dates_visites = newDatesVisites;
        }
      }

      if (formData.groupe !== originalGroupe && isEditing) {
        updateData.groupe = formData.groupe;
        const { error: contactsError } = await supabase
          .from('contacts')
          .update({ groupe: formData.groupe })
          .ilike('site', site.noms);
        if (contactsError) throw contactsError;
        await fetchContacts(site.noms);
      }

      if (isEditing) {
        updateData.noms = formData.noms;
        updateData.domaine = formData.domaine;
        updateData.adress = formData.adress;
        updateData.pays = formData.pays;
      }

      const { error: updateError } = await supabase
        .from('sites')
        .update(updateData)
        .eq('id', site.id);

      if (updateError) throw updateError;

      const { data: updatedSite } = await supabase
        .from('sites')
        .select('*')
        .eq('id', site.id)
        .single();

      if (updatedSite) {
        setSite(updatedSite);
        setFormData({
          groupe: updatedSite.groupe || '',
          noms: updatedSite.noms || '',
          adress: { formatted: updatedSite.adress?.formatted || '' },
          pays: updatedSite.pays || '',
          couleur: updatedSite.couleur || '',
          domaine: updatedSite.domaine || '',
          observations: updatedSite.observations || '',
          datevisite: updatedSite.datevisite || '',
        });
        setOriginalDatevisite(updatedSite.datevisite || '');
        setOriginalGroupe(updatedSite.groupe || '');
        setIsModified(false);
        setIsEditing(false);
      }

      setSaveMessage({ text: t('siteDetail.saveSuccess'), isSuccess: true });
    } catch (err: any) {
      setSaveMessage({ text: `Erreur: ${err.message}`, isSuccess: false });
    }
  };

  // Activer/Désactiver le mode édition
  const handleEdit = () => {
    setIsEditing(!isEditing);
    setIsModified(true);
  };

  // Annuler les modifications
  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsModified(false);
    if (site) {
      setFormData({
        groupe: site.groupe || '',
        noms: site.noms || '',
        adress: { formatted: site.adress?.formatted || '' },
        pays: site.pays || '',
        couleur: site.couleur || '',
        domaine: site.domaine || '',
        observations: site.observations || '',
        datevisite: site.datevisite || '',
      });
      setOriginalDatevisite(site.datevisite || '');
      setOriginalGroupe(site.groupe || '');
    }
  };

  // Copier les emails dans le presse-papiers (uniquement contacts actifs)
  const handleCopyEmails = async () => {
    const activeContacts = contacts.filter(c => c.contact_actif && c.email);
    const emails = activeContacts.map(contact => contact.email);

    if (emails.length === 0) {
      setCopyMessage(t('siteDetail.noActiveEmail'));
      setTimeout(() => setCopyMessage(null), 2000);
      return;
    }

    const emailsString = emails.join(' ; ');

    try {
      await navigator.clipboard.writeText(emailsString);
      setCopyMessage(t('siteDetail.emailsCopied'));
      setTimeout(() => setCopyMessage(null), 2000);
    } catch (err) {
      setCopyMessage(t('siteDetail.copyError'));
      setTimeout(() => setCopyMessage(null), 2000);
    }
  };

  // Vérifier si le nom du site existe déjà
  const checkSiteNameExists = useCallback(async (nom: string, excludeId?: string): Promise<boolean> => {
    if (!nom.trim()) return false;

    const { data, error } = await supabase
      .from('sites')
      .select('id')
      .ilike('noms', nom.trim())
      .neq('id', excludeId || '')
      .maybeSingle();

    return !!data;
  }, []);

  // Formatage de la date
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return t('siteDetail.never');
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  };

  // Couleur d'affichage de la date de visite selon la valeur de `couleur`
  const getVisitDateColor = (couleur: string | undefined): string => {
    switch ((couleur || '').toLowerCase()) {
      case 'visités':
        return '#008000';
      case 'visités il y a +18mois':
      case 'visités il ya +18mois':
        return '#CCCC00';
      case 'a visiter':
        return '#FF0000';
      default:
        return '#000000';
    }
  };

  // Conversion de `dates_visites` en tableau de chaînes
  const parseDatesVisites = (value: any): string[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>{t('siteDetail.loading')}</div>;
  if (error) return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>{error}</div>;
  if (!site) return <div style={{ padding: '20px', textAlign: 'center' }}>{t('siteDetail.notFound')}</div>;

  // Styles
  const containerStyle = {
    padding: '20px',
    maxWidth: '980px',
    margin: '0 auto',
    fontFamily: 'Barlow, sans-serif'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    width: '100%'
  };

  const titleContainerStyle = {
    textAlign: 'center',
    flex: 1
  };

  const titleStyle = {
    fontWeight: 'bold',
    fontSize: '24px',
    margin: 0
  };

  const buttonContainerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'flex-end'
  };

  // Style de base pour les boutons
  const baseButtonStyle = {
    padding: '10px 20px',
    border: '1px solid black',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    textDecoration: 'none',
    color: 'black',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E5E4',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#d1d1d1'
    }
  };

  const buttonStyle = {
    ...baseButtonStyle,
  };

  // Style pour le bouton désactivé (comme dans Contacts.tsx)
  const disabledButtonStyle = {
    ...baseButtonStyle,
    backgroundColor: '#f5f5f5',
    opacity: 0.5,
    cursor: 'not-allowed',
    ':hover': {
      backgroundColor: '#f5f5f5'
    }
  };

  const formContainerStyle = {
    backgroundColor: '#A6A6A6',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  };

  const formRowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
    marginBottom: '15px'
  };

  const formFieldStyle = {
    marginBottom: '15px'
  };

  const labelStyle = {
    display: 'block',
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    fontSize: '14px',
    marginBottom: '5px'
  };

  const inputStyle = {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    backgroundColor: isEditing ? '#fff' : '#f5f5f5',
    width: '100%',
    boxSizing: 'border-box' as const
  };

  const selectStyle = {
    ...inputStyle,
    cursor: isEditing ? 'pointer' : 'not-allowed'
  };

  const textareaStyle = {
    ...inputStyle,
    height: '100px',
    resize: 'vertical'
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

  const messageStyle = (isSuccess: boolean) => ({
    padding: '10px',
    marginBottom: '15px',
    borderRadius: '4px',
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    fontSize: '14px',
    backgroundColor: isSuccess ? '#d4edda' : '#f8d7da',
    color: isSuccess ? '#155724' : '#721c24',
    border: `1px solid ${isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
    textAlign: 'center'
  });

  const copyButtonStyle = {
    ...baseButtonStyle,
    padding: '0 15px',
    height: '30px'
  };

  // Liste des couleurs et domaines
  const colorOptions = ['Non visités', 'Visités', 'Visités il y a +18mois', 'A visiter', 'Fermés'];
  const domainOptions = ['Ciment', 'Mineralurgie', 'Platre', 'Papeterie', 'Fertilisant', 'Autre'];

  // Style pour les cartes de visite
  const cardStyle = {
    backgroundColor: '#A6A6A6',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    boxShadow: '1px 1px 1px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column'
  };

  const cardTextStyle = {
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    fontSize: '14px',
    margin: '5px 0'
  };

  const modifyButtonStyle = {
    height: '25px',
    padding: '0 10px',
    border: '1px solid black',
    borderRadius: '4px',
    backgroundColor: '#E5E5E4',
    cursor: 'pointer',
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 200,
    fontSize: '12px',
    marginLeft: 'auto',
    marginRight: '0',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#d1d1d1'
    }
  };

  const contactsHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    gridColumn: '1 / -1'
  };

  return (
    <div style={containerStyle}>
      {/* En-tête avec boutons et titre centré */}
      <div style={headerStyle}>
        <Link to="/sites" style={buttonStyle}>
          {t('siteDetail.backToSites')}
        </Link>

        <div style={titleContainerStyle}>
          <h1 style={titleStyle}>{site.groupe} - {site.noms}</h1>
        </div>

        <div style={buttonContainerStyle}>
          {isEditing ? (
            <button onClick={handleCancelEdit} style={buttonStyle}>
              {t('siteDetail.cancel')}
            </button>
          ) : (
            <button onClick={handleEdit} style={buttonStyle}>
              {t('siteDetail.edit')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isModified}
            style={isModified ? buttonStyle : disabledButtonStyle}
          >
            {t('siteDetail.save')}
          </button>
        </div>
      </div>

      {/* Formulaire pré-rempli (données du site) */}
      <div style={formContainerStyle}>
        <div style={formRowStyle}>
          <div style={formFieldStyle}>
            <label style={labelStyle}>{t('siteDetail.name')}</label>
            <input
              type="text"
              name="noms"
              value={formData.noms}
              onChange={handleInputChange}
              disabled={!isEditing}
              style={inputStyle}
            />
          </div>

          <div style={{ ...formFieldStyle, position: 'relative' }}>
            <label style={labelStyle}>{t('siteDetail.group')}</label>
            <input
              type="text"
              value={formData.groupe}
              onChange={handleGroupSearch}
              onFocus={() => {
                setShowGroupDropdown(true);
                setFilteredGroupes(groupes);
              }}
              disabled={!isEditing}
              style={{
                ...inputStyle,
                backgroundColor: isEditing ? '#fff' : '#f5f5f5'
              }}
              placeholder={t('siteDetail.groupSearchPlaceholder')}
            />
            {isEditing && showGroupDropdown && filteredGroupes.length > 0 && (
              <div style={dropdownStyle} onMouseDown={e => e.preventDefault()}>
                {filteredGroupes.map(groupe => (
                  <div
                    key={groupe.ID}
                    onClick={() => handleSelectGroup(groupe)}
                    style={{
                      ...dropdownItemStyle,
                      backgroundColor: formData.groupe === groupe.nom_groupe ? '#f0f0f0' : 'transparent'
                    }}
                  >
                    {groupe.nom_groupe}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={formRowStyle}>
          <div style={formFieldStyle}>
            <label style={labelStyle}>{t('siteDetail.domain')}</label>
            <select
              name="domaine"
              value={formData.domaine}
              onChange={handleInputChange}
              disabled={!isEditing}
              style={selectStyle}
            >
              {domainOptions.map(option => (
                <option key={option} value={option}>{t('siteDetail.domains.' + option)}</option>
              ))}
            </select>
          </div>

          <div style={formFieldStyle}>
            <label style={labelStyle}>{t('siteDetail.color')}</label>
            <select
              name="couleur"
              value={formData.couleur}
              onChange={handleColorChange}
              style={selectStyle}
            >
              {colorOptions.map(option => (
                <option key={option} value={option}>{t('siteDetail.colors.' + option)}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={formRowStyle}>
          <div style={formFieldStyle}>
            <label style={labelStyle}>{t('siteDetail.country')}</label>
            <input
              type="text"
              name="pays"
              value={formData.pays}
              onChange={handleInputChange}
              disabled={!isEditing}
              style={inputStyle}
            />
          </div>

          <div style={formFieldStyle}>
            <label style={labelStyle}>{t('siteDetail.visitDate')}</label>
            <input
              type="date"
              name="datevisite"
              value={formData.datevisite}
              onChange={handleDateChange}
              style={{
                ...inputStyle,
                color: getVisitDateColor(formData.couleur),
                fontWeight: 'bold'
              }}
            />
          </div>
        </div>

        <div style={formFieldStyle}>
          <label style={labelStyle}>{t('siteDetail.address')}</label>
          {isEditing ? (
            <Autocomplete
              onLoad={onLoad}
              onPlaceChanged={onPlaceChanged}
            >
              <input
                type="text"
                value={formData.adress.formatted}
                onChange={handleAddressChange}
                style={inputStyle}
                placeholder={t('siteDetail.addressPlaceholder')}
              />
            </Autocomplete>
          ) : (
            <input
              type="text"
              value={formData.adress.formatted}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#f5f5f5' }}
            />
          )}
        </div>

        <div style={formFieldStyle}>
          <label style={labelStyle}>{t('siteDetail.observations')}</label>
          <textarea
            name="observations"
            value={formData.observations}
            onChange={handleObservationsChange}
            style={textareaStyle}
          />
        </div>
      </div>

      {/* Message de confirmation */}
      {saveMessage && (
        <div style={messageStyle(saveMessage.isSuccess)}>
          {saveMessage.text}
        </div>
      )}

      {/* Historique des visites - pleine largeur */}
      {(() => {
        const dates = parseDatesVisites(site.dates_visites);
        if (dates.length === 0) return null;
        return (
          <div style={formContainerStyle}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px', fontWeight: 'bold' }}>
              {t('siteDetail.visitHistory')}
            </h2>
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              fontFamily: 'Barlow, sans-serif',
              fontSize: '14px'
            }}>
              {[...dates]
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                .map((date, index) => (
                  <li key={index} style={{ marginBottom: '5px' }}>
                    {formatDate(date)}
                  </li>
                ))}
            </ul>
          </div>
        );
      })()}

      {/* En-tête des contacts avec bouton Copier emails */}
      {contacts.length > 0 && (
        <div style={contactsHeaderStyle}>
          <h2 style={{
            fontFamily: 'Barlow, sans-serif',
            fontWeight: 'bold',
            fontSize: '18px',
            margin: 0
          }}>
            {t('siteDetail.siteContacts')}
          </h2>
          <button
            onClick={handleCopyEmails}
            style={copyButtonStyle}
          >
            {t('siteDetail.copyEmails')}
          </button>
        </div>
      )}

      {/* Message de copie */}
      {copyMessage && (
        <div style={{
          marginBottom: '15px',
          fontFamily: 'Barlow, sans-serif',
          fontSize: '14px',
          color: '#155724',
          fontWeight: 200,
          textAlign: 'right'
        }}>
          {copyMessage}
        </div>
      )}

      {/* Cartes de visite des contacts */}
      {contacts.length > 0 && (
        <div style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px'
        }}>
          {contacts.map((contact) => (
            <div
              key={contact.id}
              style={cardStyle}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              <h3 style={{
                fontFamily: 'Barlow, sans-serif',
                fontWeight: 'bold',
                fontSize: '16px',
                marginBottom: '10px',
                textAlign: 'center'
              }}>
                {contact.prenom} {contact.noms}
              </h3>
              <p style={cardTextStyle}><strong>{t('siteDetail.function')}:</strong> {contact.fonction}</p>
              <p style={cardTextStyle}><strong>{t('siteDetail.email')}:</strong> {contact.email}</p>
              {contact.num_mobile && <p style={cardTextStyle}><strong>{t('siteDetail.mobile')}:</strong> {contact.num_mobile}</p>}
              {contact.num_fixe && <p style={cardTextStyle}><strong>{t('siteDetail.fixe')}:</strong> {contact.num_fixe}</p>}

              <div style={{
                marginTop: 'auto',
                paddingTop: '10px',
                borderTop: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <p style={{
                  ...cardTextStyle,
                  color: contact.contact_actif ? '#008000' : '#FF0000',
                  margin: 0
                }}>
                  <strong>{t('siteDetail.status')}:</strong> {contact.contact_actif ? t('siteDetail.active') : t('siteDetail.inactive')}
                </p>
                <button style={modifyButtonStyle}>{t('siteDetail.edit')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}