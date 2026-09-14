import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { extractContactFromText } from '../lib/aiContactExtract';
import { Autocomplete } from '@react-google-maps/api';
import { useIsMobile } from '../lib/useIsMobile';

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
  groupe: string;
  site: string;
  fonction: string;
  num_mobile: string;
  email: string;
  observations: string;
  num_fixe: string;
  langue: string;
  genre: string;
  contact_actif: boolean;
}

interface SiteOption {
  id: string;
  noms: string;
  groupe: string;
  pays: string;
}

export default function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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

  // États pour la modale d'édition d'un contact
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactFormData, setContactFormData] = useState({
    noms: '',
    prenom: '',
    groupe: '',
    site: '',
    fonction: '',
    num_mobile: '',
    email: '',
    observations: '',
    num_fixe: '',
    langue: '',
    genre: '',
    contact_actif: true
  });
  const [initialContactData, setInitialContactData] = useState<typeof contactFormData | null>(null);
  const [touchedContactFields, setTouchedContactFields] = useState<Set<string>>(new Set());
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [contactEmailError, setContactEmailError] = useState('');
  const [contactEmailExistsError, setContactEmailExistsError] = useState(false);
  const [isCheckingContactEmail, setIsCheckingContactEmail] = useState(false);
  const [contactConfirmMessage, setContactConfirmMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [useContactAIMode, setUseContactAIMode] = useState(false);
  const [isAnalyzingContactAI, setIsAnalyzingContactAI] = useState(false);
  const [allSites, setAllSites] = useState<SiteOption[]>([]);
  const [filteredContactSites, setFilteredContactSites] = useState<SiteOption[]>([]);
  const [showContactSiteDropdown, setShowContactSiteDropdown] = useState(false);
  const [filteredContactGroupes, setFilteredContactGroupes] = useState<Groupe[]>([]);
  const [showContactGroupeDropdown, setShowContactGroupeDropdown] = useState(false);

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
        setFilteredContactGroupes(groupesData || []);

        // Charger tous les sites pour la sélection dans la modale d'édition contact
        const { data: sitesData } = await supabase
          .from('sites')
          .select('id, noms, groupe, pays')
          .order('noms', { ascending: true });
        setAllSites(sitesData || []);

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

  // --- Modale d'édition d'un contact (validation identique à Contacts.tsx) ---

  const isValidContactEmail = (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  const hasContactEmailSpecialChars = (email: string): boolean => {
    const specialChars = /[^a-zA-Z0-9@._-]/;
    return specialChars.test(email);
  };

  const checkContactEmailExists = useCallback(async (email: string, excludeId?: string): Promise<boolean> => {
    if (!email || !isValidContactEmail(email) || hasContactEmailSpecialChars(email)) {
      return false;
    }
    const formattedEmail = email.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const { data, error } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', formattedEmail)
      .neq('id', excludeId || '')
      .maybeSingle();
    if (error) return false;
    return !!data;
  }, []);

  const checkContactEmailAvailability = useCallback(async (email: string) => {
    if (!email) {
      setContactEmailExistsError(false);
      return;
    }
    setIsCheckingContactEmail(true);
    const exists = await checkContactEmailExists(email, editingContactId || undefined);
    setContactEmailExistsError(exists);
    setIsCheckingContactEmail(false);
  }, [checkContactEmailExists, editingContactId]);

  // Analyse IA du contenu des observations via Mistral (Edge Function contact-extract).
  // Ne remplit que les champs encore vides du formulaire de contact.
  const analyzeContactWithAI = async (text: string) => {
    if (!text || !text.trim()) return;
    setIsAnalyzingContactAI(true);
    const extracted = await extractContactFromText(text);
    setIsAnalyzingContactAI(false);
    if (!extracted) return;

    const fields: (keyof typeof contactFormData)[] = ['noms', 'prenom', 'fonction', 'email', 'num_mobile', 'num_fixe', 'genre'];

    setContactFormData(prev => {
      const newFormData = { ...prev };
      fields.forEach(key => {
        const value = extracted[key as keyof typeof extracted];
        if (value && !newFormData[key]) {
          newFormData[key] = value;
        }
      });
      return newFormData;
    });

    // Vérifier la disponibilité de l'email extrait (s'il a pré-rempli un champ vide)
    const extractedEmail = extracted.email && !contactFormData.email ? extracted.email : '';
    if (extractedEmail) {
      // Marquer le champ email comme touché pour activer la bordure rouge en cas de doublon
      setTouchedContactFields(prev => new Set(prev).add('email'));
      checkContactEmailAvailability(extractedEmail);
    }
  };

  const handleContactPaste = (e: React.ClipboardEvent) => {
    if (!useContactAIMode) return;
    const pastedText = e.clipboardData.getData('text');
    const combined = `${contactFormData.observations}${contactFormData.observations ? '\n' : ''}${pastedText}`;
    analyzeContactWithAI(combined);
  };

  const handleContactAnalyze = () => {
    if (!useContactAIMode || !contactFormData.observations.trim()) return;
    analyzeContactWithAI(contactFormData.observations);
  };

  const handleContactEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setContactFormData(prev => ({ ...prev, email: value }));
    setContactErrors(prev => {
      const next = { ...prev };
      if (value && !isValidContactEmail(value)) {
        next.email = t('contacts.invalidEmail');
      } else if (value && hasContactEmailSpecialChars(value)) {
        next.email = t('contacts.unauthorizedChars');
      } else {
        delete next.email;
      }
      return next;
    });
    setContactEmailError('');
    setContactEmailExistsError(false);
    if (value && isValidContactEmail(value) && !hasContactEmailSpecialChars(value)) {
      checkContactEmailAvailability(value);
    }
  };

  const areContactRequiredFieldsFilled = () => {
    const requiredFields = ['noms', 'prenom', 'fonction', 'groupe', 'site', 'langue', 'email', 'genre'];
    return requiredFields.every(field => contactFormData[field as keyof typeof contactFormData]);
  };

  const hasContactFormChanged = initialContactData
    ? Object.keys(contactFormData).some(key => contactFormData[key as keyof typeof contactFormData] !== initialContactData[key as keyof typeof initialContactData])
    : false;

  const validateContactForm = (): boolean => {
    const requiredFields = ['noms', 'prenom', 'fonction', 'groupe', 'site', 'langue', 'email', 'genre'];
    const newErrors: Record<string, string> = {};
    requiredFields.forEach(field => {
      if (!contactFormData[field as keyof typeof contactFormData]) {
        newErrors[field] = t('contacts.required');
      }
    });
    if (contactFormData.email) {
      if (!isValidContactEmail(contactFormData.email)) {
        newErrors.email = t('contacts.invalidEmail');
      } else if (hasContactEmailSpecialChars(contactFormData.email)) {
        newErrors.email = t('contacts.emailContainsChars');
      }
    }
    setContactErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatContactDataForSave = (data: typeof contactFormData) => ({
    ...data,
    email: data.email.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    noms: data.noms.toUpperCase(),
    prenom: data.prenom.charAt(0).toUpperCase() + data.prenom.slice(1).toLowerCase()
  });

  const handleOpenEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    const initial = {
      noms: contact.noms || '',
      prenom: contact.prenom || '',
      groupe: contact.groupe || '',
      site: contact.site || '',
      fonction: contact.fonction || '',
      num_mobile: contact.num_mobile || '',
      email: contact.email || '',
      observations: contact.observations || '',
      num_fixe: contact.num_fixe || '',
      langue: contact.langue || '',
      genre: contact.genre || '',
      contact_actif: contact.contact_actif
    };
    setContactFormData(initial);
    setInitialContactData(initial);
    setTouchedContactFields(new Set());
    setContactErrors({});
    setContactEmailError('');
    setContactEmailExistsError(false);
    setContactConfirmMessage(null);
  };

  const resetContactForm = () => {
    setEditingContactId(null);
    setContactFormData({
      noms: '', prenom: '', groupe: '', site: '', fonction: '',
      num_mobile: '', email: '', observations: '', num_fixe: '',
      langue: '', genre: '', contact_actif: true
    });
    setInitialContactData(null);
    setTouchedContactFields(new Set());
    setContactErrors({});
    setContactEmailError('');
    setContactEmailExistsError(false);
    setContactConfirmMessage(null);
    setUseContactAIMode(false);
    setIsAnalyzingContactAI(false);
  };

  const handleContactGroupeSearch = (value: string) => {
    setContactFormData(prev => ({ ...prev, groupe: value, site: '' }));
    if (value === '') {
      setFilteredContactGroupes(groupes);
    } else {
      setFilteredContactGroupes(groupes.filter(g =>
        g.nom_groupe.toLowerCase().includes(value.toLowerCase())
      ));
    }
    setShowContactGroupeDropdown(true);
  };

  const selectContactGroupe = (groupe: Groupe) => {
    setContactFormData(prev => ({ ...prev, groupe: groupe.nom_groupe, site: '' }));
    setShowContactGroupeDropdown(false);
  };

  const handleContactSiteSearch = (value: string) => {
    setContactFormData(prev => ({ ...prev, site: value }));
    if (value === '' || !contactFormData.groupe) {
      setFilteredContactSites([]);
    } else {
      setFilteredContactSites(allSites.filter(s =>
        s.groupe === contactFormData.groupe &&
        s.noms.toLowerCase().includes(value.toLowerCase())
      ));
    }
    setShowContactSiteDropdown(true);
  };

  const selectContactSite = (site: SiteOption) => {
    setContactFormData(prev => ({ ...prev, site: site.noms }));
    setShowContactSiteDropdown(false);
  };

  const handleSubmitContactEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateContactForm() || !editingContactId) return;
    if (!hasContactFormChanged || !areContactRequiredFieldsFilled() || contactEmailExistsError) return;
    try {
      const formattedData = formatContactDataForSave(contactFormData);
      const contactData = { ...formattedData, updated_date: new Date().toISOString() };
      const { error } = await supabase
        .from('contacts')
        .update(contactData)
        .eq('id', editingContactId);
      if (error) {
        setContactConfirmMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
        return;
      }
      setContactConfirmMessage({ text: t('contacts.contactEdited'), isSuccess: true });
      resetContactForm();
      if (site) await fetchContacts(site.noms);
    } catch (err: any) {
      setContactConfirmMessage({ text: `Erreur inattendue: ${err.message}`, isSuccess: false });
    }
  };

  // Enregistrer les modifications (site)
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
    padding: '10px',
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
      <div style={{ ...headerStyle, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '10px' : 0, alignItems: isMobile ? 'center' : 'center' }}>
        <Link to="/sites" style={{ ...buttonStyle, alignSelf: isMobile ? 'flex-start' : 'center', flex: isMobile ? undefined : 1, textAlign: isMobile ? undefined : 'left' }}>
          {t('siteDetail.backToSites')}
        </Link>

        <div style={{ ...titleContainerStyle, textAlign: 'center', flex: isMobile ? undefined : 2, minWidth: 0, overflow: 'hidden' }}>
          <h1 style={{ ...titleStyle, fontSize: isMobile ? '18px' : '24px', whiteSpace: isMobile ? undefined : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{site.groupe} - {site.noms}</h1>
        </div>

        <div style={{ ...buttonContainerStyle, flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', flex: isMobile ? undefined : 1 }}>
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
        <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
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

        <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
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

        <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
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
                <button style={modifyButtonStyle} onClick={() => handleOpenEditContact(contact)}>{t('siteDetail.edit')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale d'édition d'un contact */}
      {editingContactId && (
        <>
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(5px)',
            zIndex: 999
          }} onClick={resetContactForm} />
          <form
            onSubmit={handleSubmitContactEdit}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#A6A6A6',
              borderRadius: '8px',
              padding: '20px',
              zIndex: 1000,
              width: 'min(960px, calc(100vw - 20px))',
              maxWidth: 'calc(100vw - 20px)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              boxSizing: 'border-box'
            }}
          >
            {/* En-tête avec titre et contact actif */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '10px' : 0, marginBottom: '15px' }}>
              <h2 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '18px', margin: 0 }}>
                {t('contacts.editTitle')}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={contactFormData.contact_actif}
                    onChange={(e) => setContactFormData({ ...contactFormData, contact_actif: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  {t('contacts.activeContact')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useContactAIMode}
                    onChange={(e) => setUseContactAIMode(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  {t('contacts.aiMode')}
                </label>
              </div>
            </div>

            {/* Grille principale: champs à gauche, observations à droite */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 1fr', gap: '15px' }}>
              {/* Colonne gauche */}
              <div>
                {/* Ligne 1: Nom / Prénom */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.lastName')}</label>
                    <input
                      type="text"
                      value={contactFormData.noms}
                      onChange={(e) => setContactFormData({ ...contactFormData, noms: e.target.value })}
                      onBlur={() => setTouchedContactFields(prev => new Set(prev).add('noms'))}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', borderColor: (touchedContactFields.has('noms') && !contactFormData.noms) ? '#ff4444' : '#ddd' }}
                    />
                    {touchedContactFields.has('noms') && !contactFormData.noms && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.firstName')}</label>
                    <input
                      type="text"
                      value={contactFormData.prenom}
                      onChange={(e) => setContactFormData({ ...contactFormData, prenom: e.target.value })}
                      onBlur={() => setTouchedContactFields(prev => new Set(prev).add('prenom'))}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', borderColor: (touchedContactFields.has('prenom') && !contactFormData.prenom) ? '#ff4444' : '#ddd' }}
                    />
                    {touchedContactFields.has('prenom') && !contactFormData.prenom && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                  </div>
                </div>

                {/* Ligne 2: Fonction / Genre */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.function')}</label>
                    <input
                      type="text"
                      value={contactFormData.fonction}
                      onChange={(e) => setContactFormData({ ...contactFormData, fonction: e.target.value })}
                      onBlur={() => setTouchedContactFields(prev => new Set(prev).add('fonction'))}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', borderColor: (touchedContactFields.has('fonction') && !contactFormData.fonction) ? '#ff4444' : '#ddd' }}
                    />
                    {touchedContactFields.has('fonction') && !contactFormData.fonction && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.genre')}</label>
                    <select
                      value={contactFormData.genre}
                      onChange={(e) => setContactFormData({ ...contactFormData, genre: e.target.value })}
                      onBlur={() => setTouchedContactFields(prev => new Set(prev).add('genre'))}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', borderColor: (touchedContactFields.has('genre') && !contactFormData.genre) ? '#ff4444' : '#ddd' }}
                    >
                      <option value="">{t('contacts.select')}</option>
                      <option value="Homme">{t('contacts.genres.Homme')}</option>
                      <option value="Femme">{t('contacts.genres.Femme')}</option>
                      <option value="Autre">{t('contacts.genres.Autre')}</option>
                    </select>
                    {touchedContactFields.has('genre') && !contactFormData.genre && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                  </div>
                </div>

                {/* Ligne 3: Groupe / Tel fixe */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.group')}</label>
                    <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={contactFormData.groupe}
                        onChange={(e) => handleContactGroupeSearch(e.target.value)}
                        onBlur={() => { setShowContactGroupeDropdown(false); setTouchedContactFields(prev => new Set(prev).add('groupe')); }}
                        onFocus={() => { setShowContactGroupeDropdown(true); setTouchedContactFields(prev => new Set(prev).add('groupe')); }}
                        style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: 'auto', flex: 1, borderColor: (touchedContactFields.has('groupe') && !contactFormData.groupe) ? '#ff4444' : '#ddd' }}
                      />
                      {showContactGroupeDropdown && filteredContactGroupes.length > 0 && (
                        <div style={dropdownStyle} onMouseDown={(e) => e.preventDefault()}>
                          {filteredContactGroupes.map(groupe => (
                            <div key={groupe.ID} onClick={() => selectContactGroupe(groupe)} style={dropdownItemStyle}>{groupe.nom_groupe}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    {touchedContactFields.has('groupe') && !contactFormData.groupe && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.fixe')}</label>
                    <input
                      type="tel"
                      value={contactFormData.num_fixe}
                      onChange={(e) => setContactFormData({ ...contactFormData, num_fixe: e.target.value })}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Ligne 4: Site / Tel mobile */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.site')}</label>
                    <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={contactFormData.site}
                        onChange={(e) => handleContactSiteSearch(e.target.value)}
                        onBlur={() => { setShowContactSiteDropdown(false); setTouchedContactFields(prev => new Set(prev).add('site')); }}
                        onFocus={() => { if (contactFormData.groupe) setShowContactSiteDropdown(true); setTouchedContactFields(prev => new Set(prev).add('site')); }}
                        disabled={!contactFormData.groupe}
                        style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, width: 'auto', flex: 1, borderColor: (touchedContactFields.has('site') && !contactFormData.site) ? '#ff4444' : '#ddd', backgroundColor: !contactFormData.groupe ? '#f5f5f5' : '#fff' }}
                      />
                      {showContactSiteDropdown && contactFormData.groupe && filteredContactSites.length > 0 && (
                        <div style={dropdownStyle} onMouseDown={(e) => e.preventDefault()}>
                          {filteredContactSites.map(site => (
                            <div key={site.id} onClick={() => selectContactSite(site)} style={dropdownItemStyle}>{site.noms}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    {touchedContactFields.has('site') && !contactFormData.site && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.mobile')}</label>
                    <input
                      type="tel"
                      value={contactFormData.num_mobile}
                      onChange={(e) => setContactFormData({ ...contactFormData, num_mobile: e.target.value })}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Ligne 5: Langue / Email */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.language')}</label>
                    <select
                      value={contactFormData.langue}
                      onChange={(e) => setContactFormData({ ...contactFormData, langue: e.target.value })}
                      onBlur={() => setTouchedContactFields(prev => new Set(prev).add('langue'))}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', borderColor: (touchedContactFields.has('langue') && !contactFormData.langue) ? '#ff4444' : '#ddd' }}
                    >
                      <option value="">{t('contacts.select')}</option>
                      <option value="Français">{t('contacts.languages.Français')}</option>
                      <option value="Anglais">{t('contacts.languages.Anglais')}</option>
                      <option value="Espagnol">{t('contacts.languages.Espagnol')}</option>
                    </select>
                    {touchedContactFields.has('langue') && !contactFormData.langue && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>{t('contacts.email')}</label>
                    <input
                      type="email"
                      value={contactFormData.email}
                      onChange={handleContactEmailChange}
                      onBlur={async () => {
                        setTouchedContactFields(prev => new Set(prev).add('email'));
                        if (contactFormData.email && !isValidContactEmail(contactFormData.email)) {
                          setContactErrors({ ...contactErrors, email: t('contacts.invalidEmail') });
                        } else if (contactFormData.email && hasContactEmailSpecialChars(contactFormData.email)) {
                          setContactErrors({ ...contactErrors, email: t('contacts.unauthorizedChars') });
                        } else if (contactFormData.email && isValidContactEmail(contactFormData.email) && !hasContactEmailSpecialChars(contactFormData.email)) {
                          await checkContactEmailAvailability(contactFormData.email);
                        }
                      }}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', borderColor: (touchedContactFields.has('email') && (!contactFormData.email || contactErrors.email || contactEmailExistsError)) ? '#ff4444' : '#ddd' }}
                    />
                    {touchedContactFields.has('email') && !contactFormData.email && <span style={{ color: '#ff4444', fontSize: '12px' }}>{t('contacts.required')}</span>}
                    {contactErrors.email && <span style={{ color: '#ff4444', fontSize: '12px' }}>{contactErrors.email}</span>}
                    {contactEmailError && <span style={{ color: '#ff4444', fontSize: '12px' }}>{contactEmailError}</span>}
                  </div>
                </div>
              </div>

              {/* Colonne droite: Observations */}
              <div>
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px' }}>{t('contacts.observations')}</label>
                    {useContactAIMode && (
                      <button
                        type="button"
                        onClick={handleContactAnalyze}
                        disabled={isAnalyzingContactAI || !contactFormData.observations.trim()}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontFamily: 'Barlow, sans-serif',
                          fontWeight: 200,
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: '#000',
                          color: '#fff',
                          cursor: isAnalyzingContactAI || !contactFormData.observations.trim() ? 'not-allowed' : 'pointer',
                          opacity: isAnalyzingContactAI || !contactFormData.observations.trim() ? 0.5 : 1,
                        }}
                      >
                        {isAnalyzingContactAI ? t('contacts.analyzing') : t('contacts.analyze')}
                      </button>
                    )}
                  </div>
                  <textarea
                    value={contactFormData.observations}
                    onChange={(e) => setContactFormData({ ...contactFormData, observations: e.target.value })}
                    onPaste={handleContactPaste}
                    style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', height: '260px', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Message de confirmation */}
            {contactConfirmMessage && contactConfirmMessage.text && (
              <div style={{
                padding: '10px', margin: '10px 0', borderRadius: '4px',
                fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
                backgroundColor: contactConfirmMessage.isSuccess ? '#d4edda' : '#f8d7da',
                color: contactConfirmMessage.isSuccess ? '#155724' : '#721c24',
                border: `1px solid ${contactConfirmMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`
              }}>
                {contactConfirmMessage.text}
              </div>
            )}

            {/* Boutons Modifier et Annuler */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={!hasContactFormChanged || !areContactRequiredFieldsFilled() || contactEmailExistsError || isCheckingContactEmail}
                  style={{
                    height: '30px', padding: '0 15px', border: '1px solid black', borderRadius: '4px',
                    backgroundColor: '#E5E5E4', cursor: hasContactFormChanged && areContactRequiredFieldsFilled() && !contactEmailExistsError ? 'pointer' : 'not-allowed',
                    fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    opacity: hasContactFormChanged && areContactRequiredFieldsFilled() && !contactEmailExistsError ? 1 : 0.5
                  }}
                >
                  {isCheckingContactEmail ? t('contacts.checking') : t('contacts.edit')}
                </button>
                {contactEmailExistsError && (
                  <span style={{ color: 'red', fontSize: '14px', fontWeight: 'bold' }}>{t('contacts.alreadyExists')}</span>
                )}
              </div>
              <button
                type="button"
                onClick={resetContactForm}
                style={{ height: '30px', padding: '0 15px', border: '1px solid black', borderRadius: '4px', backgroundColor: '#E5E5E4', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {t('contacts.cancel')}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}