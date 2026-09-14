import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { useUserZones } from '../lib/userZones';
import { useIsMobile } from '../lib/useIsMobile';
import { extractContactFromText } from '../lib/aiContactExtract';
import { Autocomplete } from '@react-google-maps/api';

// Types
interface Site {
  id: string;
  noms: string;
  groupe: string;
  pays: string;
}

interface Groupe {
  ID: string;
  nom_groupe: string;
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
  owner: string;
  created_date: string;
}

export default function Contacts() {
  const { t } = useTranslation();
  // États pour les données
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailError, setEmailError] = useState('');
  const [filteredSites, setFilteredSites] = useState<Site[]>([]);
  const [filteredGroupes, setFilteredGroupes] = useState<Groupe[]>([]);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [showGroupeDropdown, setShowGroupeDropdown] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [useAIMode, setUseAIMode] = useState(false);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const { allowedCountries, loadingZones } = useUserZones();

  // Modale Ajouter Groupe
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupData, setNewGroupData] = useState({ nom_groupe: '', site_web: '' });
  const [groupNameError, setGroupNameError] = useState('');
  const [isGroupSubmitting, setIsGroupSubmitting] = useState(false);
  const [groupSubmitMessage, setGroupSubmitMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);

  // Modale Ajouter Site
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [newSiteData, setNewSiteData] = useState({
    noms: '',
    groupe: '',
    pays: '',
    adress: { formatted: '' },
    latitude: '',
    longitude: '',
    couleur: 'Non visités',
    domaine: 'Ciment',
    observations: '',
  });
  const [siteNameError, setSiteNameError] = useState('');
  const [isSiteSubmitting, setIsSiteSubmitting] = useState(false);
  const [siteSubmitMessage, setSiteSubmitMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [showSiteGroupDropdown, setShowSiteGroupDropdown] = useState(false);
  const [filteredSiteGroupes, setFilteredSiteGroupes] = useState<Groupe[]>([]);
  const [addressAutocomplete, setAddressAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const colorTags = ['Non visités', 'Visités', 'Visités il y a +18mois', 'A visiter', 'Fermés'];
  const domainTags = ['Ciment', 'Mineralurgie', 'Platre', 'Papeterie', 'Fertilisant', 'Autre'];
  const isMobile = useIsMobile();

  // Map site (nom) -> pays, pour filtrer les contacts par zone
  const sitePaysMap: Record<string, string> = {};
  allSites.forEach(s => { sitePaysMap[s.noms] = s.pays; });

  // États pour le mode édition
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [initialFormData, setInitialFormData] = useState<typeof formData | null>(null);
  const [emailExistsError, setEmailExistsError] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  // Fonction pour récupérer TOUS les contacts (avec pagination)
  const fetchAllContacts = useCallback(async (): Promise<Contact[]> => {
    let allContacts: Contact[] = [];
    let offset = 0;
    const batchSize = 1000; // Taille maximale autorisée par requête Supabase
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_date', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error('Erreur lors de la récupération des contacts:', error);
        hasMore = false;
      } else if (data && data.length > 0) {
        allContacts = [...allContacts, ...data];
        offset += batchSize;
        hasMore = data.length === batchSize; // Si on a un lot complet, il y en a peut-être plus
      } else {
        hasMore = false;
      }
    }

    return allContacts;
  }, []);

  // Validation email
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  const hasSpecialChars = (email: string): boolean => {
    const specialChars = /[^a-zA-Z0-9@._-]/;
    return specialChars.test(email);
  };

  // Vérifier si l'email existe dans la base de données
  const checkEmailExists = useCallback(async (email: string, excludeId?: string): Promise<boolean> => {
    if (!email || !isValidEmail(email) || hasSpecialChars(email)) {
      return false;
    }

    const formattedEmail = email.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const { data, error } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', formattedEmail)
      .neq('id', excludeId || '')
      .maybeSingle();

    return !!data;
  }, []);

  // Vérifier la disponibilité de l'email
  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email) {
      setEmailExistsError(false);
      return;
    }

    setIsCheckingEmail(true);
    const exists = await checkEmailExists(email, editingContactId || undefined);
    setEmailExistsError(exists);
    setIsCheckingEmail(false);
  }, [checkEmailExists, editingContactId]);

  // Vérifier si le formulaire a été modifié
  const hasFormChanged = initialFormData
    ? Object.keys(formData).some(key => formData[key as keyof typeof formData] !== initialFormData[key as keyof typeof initialFormData])
    : false;

  // Vérifier si tous les champs obligatoires sont remplis
  const areAllRequiredFieldsFilled = () => {
    const requiredFields = ['noms', 'prenom', 'fonction', 'groupe', 'site', 'langue', 'email', 'genre'];
    return requiredFields.every(field => formData[field as keyof typeof formData]);
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
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
    setTouchedFields(new Set());
    setErrors({});
    setEmailError('');
    setConfirmationMessage(null);
    setEditingContactId(null);
    setInitialFormData(null);
    setEmailExistsError(false);
    setIsAnalyzingAI(false);
  };

  // Analyse IA du contenu des observations via Mistral (Edge Function contact-extract).
  // Ne remplit que les champs encore vides du formulaire.
  const analyzeWithAI = async (text: string) => {
    if (!text || !text.trim()) return;
    setIsAnalyzingAI(true);
    const extracted = await extractContactFromText(text);
    setIsAnalyzingAI(false);
    if (!extracted) return;

    const fields: (keyof typeof formData)[] = ['noms', 'prenom', 'fonction', 'email', 'num_mobile', 'num_fixe', 'genre'];

    setFormData(prev => {
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
    const extractedEmail = extracted.email && !formData.email ? extracted.email : '';
    if (extractedEmail) {
      // Marquer le champ email comme touché pour activer la bordure rouge en cas de doublon
      setTouchedFields(prev => new Set(prev).add('email'));
      checkEmailAvailability(extractedEmail);
    }
  };

  // Gestion du collage dans observations (mode IA : analyse après collage)
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!useAIMode) {
      return;
    }

    const pastedText = e.clipboardData.getData('text');
    // On concatène au texte déjà présent dans observations pour une analyse complète
    const combined = `${formData.observations}${formData.observations ? '\n' : ''}${pastedText}`;
    analyzeWithAI(combined);
  };

  // Bouton "Analyser" : relance l'IA sur le contenu actuel des observations
  const handleAnalyze = () => {
    if (!useAIMode || !formData.observations.trim()) return;
    analyzeWithAI(formData.observations);
  };

    // Fonction de recherche pour les cartes
  const matchesSearch = (contact: Contact) => {
    // Filtre par pays autorisés (zones de l'utilisateur)
    if (allowedCountries) {
      const pays = sitePaysMap[contact.site];
      if (!allowedCountries.includes(pays)) return false;
    }

    if (showOnlyActive && !contact.contact_actif) {
      return false;
    }

    if (!searchText) return true;
    const lowerSearch = searchText.toLowerCase();
    return (
      (contact.noms && contact.noms.toLowerCase().includes(lowerSearch)) ||
      (contact.prenom && contact.prenom.toLowerCase().includes(lowerSearch)) ||
      (contact.groupe && contact.groupe.toLowerCase().includes(lowerSearch)) ||
      (contact.site && contact.site.toLowerCase().includes(lowerSearch)) ||
      (contact.num_mobile && contact.num_mobile.includes(lowerSearch)) ||
      (contact.num_fixe && contact.num_fixe.includes(lowerSearch)) ||
      (contact.fonction && contact.fonction.toLowerCase().includes(lowerSearch)) ||
      (contact.email && contact.email.toLowerCase().includes(lowerSearch)) ||
      (contact.observations && contact.observations.toLowerCase().includes(lowerSearch))
    );
  };

  // Récupérer les données
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(currentUser);

        const [sitesData, groupesData, contactsData] = await Promise.all([
          supabase.from('sites').select('id, noms, groupe, pays').order('noms', { ascending: true }),
          supabase.from('groupes').select('ID, nom_groupe').order('nom_groupe', { ascending: true }),
          fetchAllContacts() // ✅ Utilisation de la pagination
        ]);

        setAllSites(sitesData.data || []);
        setGroupes(groupesData.data || []);
        setAllContacts(contactsData || []);
        setContacts(contactsData?.slice(0, 20) || []);
        setFilteredGroupes(groupesData.data || []);
      } catch (error) {
        console.error('Erreur:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [fetchAllContacts]);

  // Filtrer les sites par groupe
  useEffect(() => {
    if (formData.groupe) {
      setFilteredSites(allSites.filter(site => site.groupe === formData.groupe));
    } else {
      setFilteredSites([]);
    }
  }, [formData.groupe, allSites]);

  // Filtrer les contacts en fonction de la recherche et du filtre actif
  useEffect(() => {
    const filtered = allContacts
      .filter(matchesSearch)
      .slice(0, 20);
    setContacts(filtered);
  }, [searchText, showOnlyActive, allContacts]);

  // Gestion des dropdowns
  const handleGroupeSearch = (value: string) => {
    setFormData({ ...formData, groupe: value });
    if (value === '') {
      setFilteredGroupes(groupes);
    } else {
      setFilteredGroupes(groupes.filter(groupe =>
        groupe.nom_groupe.toLowerCase().includes(value.toLowerCase())
      ));
    }
  };

  const handleSiteSearch = (value: string) => {
    setFormData({ ...formData, site: value });
    if (formData.groupe) {
      setFilteredSites(allSites.filter(site =>
        site.groupe === formData.groupe &&
        site.noms.toLowerCase().includes(value.toLowerCase())
      ));
    }
  };

  const selectGroupe = (groupe: Groupe) => {
    setFormData({
      ...formData,
      groupe: groupe.nom_groupe,
      site: ''
    });
    setShowGroupeDropdown(false);
  };

  const selectSite = (site: Site) => {
    setFormData({ ...formData, site: site.noms });
    setShowSiteDropdown(false);
  };

  // ---------- MODALE AJOUTER GROUPE ----------
  const checkGroupExists = async (nom: string): Promise<boolean> => {
    if (!nom.trim()) return false;
    const { data } = await supabase
      .from('groupes')
      .select('ID')
      .ilike('nom_groupe', nom.trim())
      .maybeSingle();
    return !!data;
  };

  const resetGroupForm = () => {
    setNewGroupData({ nom_groupe: '', site_web: '' });
    setGroupNameError('');
    setGroupSubmitMessage(null);
    setIsGroupSubmitting(false);
  };

  const handleCloseGroupModal = () => { setShowAddGroupModal(false); resetGroupForm(); };

  const handleAddGroup = async () => {
    if (!newGroupData.nom_groupe.trim() || groupNameError) return;
    setIsGroupSubmitting(true);
    setGroupSubmitMessage(null);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('groupes').insert([{
        nom_groupe: newGroupData.nom_groupe.trim(),
        site_web: newGroupData.site_web.trim(),
        ID: crypto.randomUUID(),
        owner: (await supabase.auth.getUser()).data.user?.id || null,
        created_date: now,
        updated_date: now
      }]);
      if (error) throw error;
      setGroupSubmitMessage({ text: t('sites.groupAdded'), isSuccess: true });
      const { data: groupesData } = await supabase
        .from('groupes')
        .select('ID, nom_groupe')
        .order('nom_groupe', { ascending: true });
      setGroupes(groupesData || []);
      setFilteredGroupes(groupesData || []);
      setFormData(prev => ({ ...prev, groupe: newGroupData.nom_groupe.trim() }));
      setTimeout(() => { setShowAddGroupModal(false); resetGroupForm(); }, 1000);
    } catch (error: any) {
      setGroupSubmitMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
    } finally {
      setIsGroupSubmitting(false);
    }
  };

  // ---------- MODALE AJOUTER SITE ----------
  const checkSiteExists = async (nom: string): Promise<boolean> => {
    if (!nom.trim()) return false;
    const { data } = await supabase
      .from('sites')
      .select('id')
      .ilike('noms', nom.trim())
      .maybeSingle();
    return !!data;
  };

  const resetSiteForm = () => {
    setNewSiteData({
      noms: '', groupe: '', pays: '', adress: { formatted: '' },
      latitude: '', longitude: '', couleur: 'Non visités', domaine: 'Ciment', observations: '',
    });
    setSiteNameError('');
    setSiteSubmitMessage(null);
    setIsSiteSubmitting(false);
    setShowSiteGroupDropdown(false);
    setFilteredSiteGroupes([]);
    setAddressAutocomplete(null);
  };

  const handleCloseSiteModal = () => { setShowAddSiteModal(false); resetSiteForm(); };

  const handleOpenAddSiteModal = () => {
    setShowAddSiteModal(true);
    setFilteredSiteGroupes(groupes);
    setNewSiteData(prev => ({ ...prev, groupe: formData.groupe }));
    resetSiteForm();
    setNewSiteData(prev => ({ ...prev, groupe: formData.groupe }));
  };

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
    const lat = place.geometry.location.lat().toString();
    const lng = place.geometry.location.lng().toString();
    setNewSiteData(prev => ({
      ...prev,
      adress: { formatted: place.formatted_address || '' },
      pays: country,
      latitude: lat,
      longitude: lng
    }));
  }, [addressAutocomplete]);

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

  const handleAddSite = async () => {
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
      setSiteSubmitMessage({ text: t('sites.siteAdded'), isSuccess: true });
      const { data: sitesData } = await supabase
        .from('sites')
        .select('id, noms, groupe, pays')
        .order('noms', { ascending: true });
      setAllSites(sitesData || []);
      setFormData(prev => ({ ...prev, site: newSiteData.noms.trim(), groupe: newSiteData.groupe.trim() }));
      setTimeout(() => { setShowAddSiteModal(false); resetSiteForm(); }, 1000);
    } catch (error: any) {
      setSiteSubmitMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
    } finally {
      setIsSiteSubmitting(false);
    }
  };

  // Formater les données avant enregistrement
  const formatDataForSave = (data: typeof formData) => {
    return {
      ...data,
      noms: data.noms.toUpperCase(),
      prenom: data.prenom.charAt(0).toUpperCase() + data.prenom.slice(1).toLowerCase(),
      email: data.email.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    };
  };

  // Validation du formulaire
  const validateForm = (): boolean => {
    const requiredFields = ['noms', 'prenom', 'fonction', 'groupe', 'site', 'langue', 'email', 'genre'];
    const newErrors: Record<string, string> = {};

    requiredFields.forEach(field => {
      if (!formData[field as keyof typeof formData]) {
        newErrors[field] = t('contacts.required');
      }
    });

    if (formData.email) {
      if (!isValidEmail(formData.email)) {
        newErrors.email = t('contacts.invalidEmail');
      } else if (hasSpecialChars(formData.email)) {
        newErrors.email = t('contacts.emailContainsChars');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Charger un contact pour modification
  const handleEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setInitialFormData({ ...formData });
    setFormData({
      noms: contact.noms,
      prenom: contact.prenom,
      groupe: contact.groupe,
      site: contact.site,
      fonction: contact.fonction,
      num_mobile: contact.num_mobile,
      email: contact.email,
      observations: contact.observations,
      num_fixe: contact.num_fixe,
      langue: contact.langue,
      genre: contact.genre,
      contact_actif: contact.contact_actif
    });
    setTouchedFields(new Set());
    setErrors({});
    setEmailError('');
    setConfirmationMessage(null);
    setEmailExistsError(false);
  };

  // Gestion du changement d'email
  const handleEmailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, email: value });

    if (value && !isValidEmail(value)) {
      setErrors({ ...errors, email: t('contacts.invalidEmail') });
    } else if (value && hasSpecialChars(value)) {
      setErrors({ ...errors, email: t('contacts.unauthorizedChars') });
    } else {
      const newErrors = { ...errors };
      delete newErrors.email;
      setErrors(newErrors);
    }

    // Vérifier si l'email existe déjà
    if (value && isValidEmail(value) && !hasSpecialChars(value)) {
      await checkEmailAvailability(value);
    } else {
      setEmailExistsError(false);
    }
  };

  // Soumettre le formulaire (ajout ou modification)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmationMessage(null);

    if (!validateForm()) {
      setConfirmationMessage({ text: t('contacts.fillAllRequired'), isSuccess: false });
      return;
    }

    // Vérifier une dernière fois si l'email existe
    if (formData.email && isValidEmail(formData.email) && !hasSpecialChars(formData.email)) {
      await checkEmailAvailability(formData.email);
    }

    if (emailExistsError) {
      return;
    }

    try {
      const formattedData = formatDataForSave(formData);
      const contactData = {
        ...formattedData,
        owner: user?.id,
        updated_date: new Date().toISOString()
      };

      const { error } = editingContactId
        ? await supabase
            .from('contacts')
            .update(contactData)
            .eq('id', editingContactId)
        : await supabase
            .from('contacts')
            .insert([{ ...contactData, id: crypto.randomUUID(), created_date: new Date().toISOString() }]);

      if (error) {
        console.error('Erreur:', error);
        setConfirmationMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
      } else {
        const successMessage = editingContactId
          ? t('contacts.contactEdited')
          : t('contacts.contactSaved');
        setConfirmationMessage({ text: successMessage, isSuccess: true });
        resetForm();
        // Recharger tous les contacts
        const allContacts = await fetchAllContacts();
        setAllContacts(allContacts || []);
      }
    } catch (error: any) {
      console.error('Erreur:', error);
      setConfirmationMessage({ text: `Erreur inattendue: ${error.message}`, isSuccess: false });
    }
  };

  // Compteur de contacts correspondants
  const matchingContactsCount = allContacts.filter(matchesSearch).length;

  return (
    <div style={{ padding: '10px', width: 'calc(100% - 20px)', maxWidth: '980px', margin: '0 auto', boxSizing: 'border-box' }}>
      {editingContactId && <div style={modalOverlayStyle} onClick={resetForm} />}
      <form onSubmit={handleSubmit} style={editingContactId ? { ...formContainerStyle, ...editModalFormStyle } : formContainerStyle} onClick={e => e.stopPropagation()}>
        {/* En-tête avec titre, contact actif et mode IA */}
        <div style={{ ...formHeaderStyle, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '10px' : 0 }}>
          <h2 style={{...formTitleStyle, fontWeight: 'bold'}}>
            {editingContactId ? t('contacts.editTitle') : t('contacts.addTitle')}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <label style={contactActifLabelStyle}>
              <input
                type="checkbox"
                checked={formData.contact_actif}
                onChange={(e) => setFormData({ ...formData, contact_actif: e.target.checked })}
                style={checkboxStyle}
              />
              {t('contacts.activeContact')}
            </label>
            <label style={contactActifLabelStyle}>
              <input
                type="checkbox"
                checked={useAIMode}
                onChange={(e) => setUseAIMode(e.target.checked)}
                style={checkboxStyle}
              />
              {t('contacts.aiMode')}
            </label>
          </div>
        </div>

        {/* Grille principale */}
        <div style={{ ...mainGridStyle, gridTemplateColumns: isMobile ? '1fr' : '3fr 1fr' }}>
          {/* Colonne gauche */}
          <div style={leftColumnStyle}>
            {/* Ligne 1: Nom / Prénom */}
            <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.lastName')}</label>
                <input
                  type="text"
                  value={formData.noms}
                  onChange={(e) => setFormData({ ...formData, noms: e.target.value })}
                  onBlur={() => setTouchedFields(prev => new Set(prev).add('noms'))}
                  style={{
                    ...inputStyle,
                    borderColor: (touchedFields.has('noms') && !formData.noms) ? '#ff4444' : '#ddd'
                  }}
                />
                {touchedFields.has('noms') && !formData.noms && <span style={errorStyle}>{t('contacts.required')}</span>}
              </div>

              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.firstName')}</label>
                <input
                  type="text"
                  value={formData.prenom}
                  onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                  onBlur={() => setTouchedFields(prev => new Set(prev).add('prenom'))}
                  style={{
                    ...inputStyle,
                    borderColor: (touchedFields.has('prenom') && !formData.prenom) ? '#ff4444' : '#ddd'
                  }}
                />
                {touchedFields.has('prenom') && !formData.prenom && <span style={errorStyle}>{t('contacts.required')}</span>}
              </div>
            </div>

            {/* Ligne 2: Fonction / Genre */}
            <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.function')}</label>
                <input
                  type="text"
                  value={formData.fonction}
                  onChange={(e) => setFormData({ ...formData, fonction: e.target.value })}
                  onBlur={() => setTouchedFields(prev => new Set(prev).add('fonction'))}
                  style={{
                    ...inputStyle,
                    borderColor: (touchedFields.has('fonction') && !formData.fonction) ? '#ff4444' : '#ddd'
                  }}
                />
                {touchedFields.has('fonction') && !formData.fonction && <span style={errorStyle}>{t('contacts.required')}</span>}
              </div>

              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.genre')}</label>
                <select
                  value={formData.genre}
                  onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                  onBlur={() => setTouchedFields(prev => new Set(prev).add('genre'))}
                  style={{
                    ...inputStyle,
                    borderColor: (touchedFields.has('genre') && !formData.genre) ? '#ff4444' : '#ddd'
                  }}
                >
                  <option value="">{t('contacts.select')}</option>
                  <option value="Homme">{t('contacts.genres.Homme')}</option>
                  <option value="Femme">{t('contacts.genres.Femme')}</option>
                  <option value="Autre">{t('contacts.genres.Autre')}</option>
                </select>
                {touchedFields.has('genre') && !formData.genre && <span style={errorStyle}>{t('contacts.required')}</span>}
              </div>
            </div>

            {/* Ligne 3: Groupe / Tel fixe */}
            <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.group')}</label>
                <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={formData.groupe}
                    onChange={(e) => handleGroupeSearch(e.target.value)}
                    onBlur={() => {
                      setShowGroupeDropdown(false);
                      setTouchedFields(prev => new Set(prev).add('groupe'));
                    }}
                    onFocus={() => {
                      setShowGroupeDropdown(true);
                      setTouchedFields(prev => new Set(prev).add('groupe'));
                    }}
                    style={{
                      ...inputStyle,
                      width: 'auto',
                      flex: 1,
                      borderColor: (touchedFields.has('groupe') && !formData.groupe) ? '#ff4444' : '#ddd'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddGroupModal(true)}
                    style={addButtonStyle}
                    title={t('sites.addGroup')}
                  >+</button>
                  {showGroupeDropdown && filteredGroupes.length > 0 && (
                    <div style={dropdownStyle} onMouseDown={(e) => e.preventDefault()}>
                      {filteredGroupes.map(groupe => (
                        <div
                          key={groupe.ID}
                          onClick={() => selectGroupe(groupe)}
                          style={dropdownItemStyle}
                        >
                          {groupe.nom_groupe}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {touchedFields.has('groupe') && !formData.groupe && <span style={errorStyle}>{t('contacts.required')}</span>}
              </div>

              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.fixe')}</label>
                <input
                  type="tel"
                  value={formData.num_fixe}
                  onChange={(e) => setFormData({ ...formData, num_fixe: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Ligne 4: Site / Tel mobile */}
            <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.site')}</label>
                <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={formData.site}
                    onChange={(e) => handleSiteSearch(e.target.value)}
                    onBlur={() => {
                      setShowSiteDropdown(false);
                      setTouchedFields(prev => new Set(prev).add('site'));
                    }}
                    onFocus={() => {
                      if (formData.groupe) {
                        setShowSiteDropdown(true);
                      }
                      setTouchedFields(prev => new Set(prev).add('site'));
                    }}
                    disabled={!formData.groupe}
                    style={{
                      ...inputStyle,
                      width: 'auto',
                      flex: 1,
                      borderColor: (touchedFields.has('site') && !formData.site) ? '#ff4444' : '#ddd',
                      backgroundColor: !formData.groupe ? '#f5f5f5' : '#fff'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleOpenAddSiteModal}
                    style={addButtonStyle}
                    title={t('sites.addSite')}
                  >+</button>
                  {showSiteDropdown && formData.groupe && filteredSites.length > 0 && (
                    <div style={dropdownStyle} onMouseDown={(e) => e.preventDefault()}>
                      {filteredSites.map(site => (
                        <div
                          key={site.id}
                          onClick={() => selectSite(site)}
                          style={dropdownItemStyle}
                        >
                          {site.noms}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {touchedFields.has('site') && !formData.site && <span style={errorStyle}>{t('contacts.required')}</span>}
              </div>

              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.mobile')}</label>
                <input
                  type="tel"
                  value={formData.num_mobile}
                  onChange={(e) => setFormData({ ...formData, num_mobile: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Ligne 5: Langue / Email */}
            <div style={{ ...formRowStyle, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.language')}</label>
                <select
                  value={formData.langue}
                  onChange={(e) => setFormData({ ...formData, langue: e.target.value })}
                  onBlur={() => setTouchedFields(prev => new Set(prev).add('langue'))}
                  style={{
                    ...inputStyle,
                    borderColor: (touchedFields.has('langue') && !formData.langue) ? '#ff4444' : '#ddd'
                  }}
                >
                  <option value="">{t('contacts.select')}</option>
                  <option value="Français">{t('contacts.languages.Français')}</option>
                  <option value="Anglais">{t('contacts.languages.Anglais')}</option>
                  <option value="Espagnol">{t('contacts.languages.Espagnol')}</option>
                </select>
                {touchedFields.has('langue') && !formData.langue && <span style={errorStyle}>{t('contacts.required')}</span>}
              </div>

              <div style={formFieldStyle}>
                <label style={labelStyle}>{t('contacts.email')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={handleEmailChange}
                  onBlur={async () => {
                    setTouchedFields(prev => new Set(prev).add('email'));
                    if (formData.email && !isValidEmail(formData.email)) {
                      setErrors({ ...errors, email: t('contacts.invalidEmail') });
                    } else if (formData.email && hasSpecialChars(formData.email)) {
                      setErrors({ ...errors, email: t('contacts.unauthorizedChars') });
                    } else if (formData.email && isValidEmail(formData.email) && !hasSpecialChars(formData.email)) {
                      await checkEmailAvailability(formData.email);
                    }
                  }}
                  style={{
                    ...inputStyle,
                    borderColor: (touchedFields.has('email') && (!formData.email || errors.email || emailExistsError)) ? '#ff4444' : '#ddd'
                  }}
                />
                {touchedFields.has('email') && !formData.email && <span style={errorStyle}>{t('contacts.required')}</span>}
                {errors.email && <span style={errorStyle}>{errors.email}</span>}
                {emailError && <span style={errorStyle}>{emailError}</span>}
              </div>
            </div>
          </div>

          {/* Colonne droite: Observations */}
          <div style={rightColumnStyle}>
            <div style={formFieldStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={labelStyle}>{t('contacts.observations')}</label>
                {useAIMode && (
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={isAnalyzingAI || !formData.observations.trim()}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontFamily: 'Barlow, sans-serif',
                      fontWeight: 200,
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: '#000',
                      color: '#fff',
                      cursor: isAnalyzingAI || !formData.observations.trim() ? 'not-allowed' : 'pointer',
                      opacity: isAnalyzingAI || !formData.observations.trim() ? 0.5 : 1,
                    }}
                  >
                    {isAnalyzingAI ? t('contacts.analyzing') : t('contacts.analyze')}
                  </button>
                )}
              </div>
              <textarea
                value={formData.observations}
                onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                onPaste={handlePaste}
                style={{ ...inputStyle, height: '260px', resize: 'vertical' }}
              />
            </div>
          </div>
        </div>

        {/* Message de confirmation */}
        {confirmationMessage && confirmationMessage.text && (
          <div style={{
            padding: '10px',
            margin: '10px 0',
            borderRadius: '4px',
            fontFamily: 'Barlow, sans-serif',
            fontWeight: 200,
            fontSize: '14px',
            backgroundColor: confirmationMessage.isSuccess ? '#d4edda' : '#f8d7da',
            color: confirmationMessage.isSuccess ? '#155724' : '#721c24',
            border: `1px solid ${confirmationMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`
          }}>
            {confirmationMessage.text}
          </div>
        )}

        {/* Boutons Enregistrer/Modifier et Réinitialiser/Annuler */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="submit"
              style={{
                ...buttonStyle,
                margin: 0,
                opacity: (editingContactId ? hasFormChanged && areAllRequiredFieldsFilled() && !emailExistsError : areAllRequiredFieldsFilled() && !emailExistsError) ? 1 : 0.5,
                cursor: (editingContactId ? hasFormChanged && areAllRequiredFieldsFilled() && !emailExistsError : areAllRequiredFieldsFilled() && !emailExistsError) ? 'pointer' : 'not-allowed'
              }}
              disabled={editingContactId ? !hasFormChanged || !areAllRequiredFieldsFilled() || emailExistsError : !areAllRequiredFieldsFilled() || emailExistsError || isCheckingEmail}
            >
              {isCheckingEmail ? t('contacts.checking') : (editingContactId ? t('contacts.edit') : t('contacts.save'))}
            </button>
            {emailExistsError && (
              <span style={{ color: 'red', fontSize: '14px', fontWeight: 'bold' }}>{t('contacts.alreadyExists')}</span>
            )}
          </div>
          <button
            type="button"
            onClick={resetForm}
            style={buttonStyle}
          >
            {editingContactId ? t('contacts.cancel') : t('contacts.reset')}
          </button>
        </div>
      </form>

      {/* Liste des contacts */}
      <div style={{ marginTop: '30px' }}>
        <h2 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '18px', marginBottom: '15px' }}>{t('contacts.listTitle')}</h2>

        {/* Barre de recherche avec compteur et filtre actif */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '10px', marginBottom: '15px' }}>
          <input
            type="text"
            placeholder={t('contacts.searchPlaceholder')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              flex: 1,
              width: isMobile ? '100%' : 'auto',
              maxWidth: isMobile ? 'none' : '400px',
              boxSizing: 'border-box' as const,
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontFamily: 'Barlow, sans-serif',
              fontWeight: 200,
              fontSize: '14px'
            }}
          />
          <span style={{
            fontFamily: 'Barlow, sans-serif',
            fontWeight: 200,
            fontSize: '14px',
            whiteSpace: 'nowrap'
          }}>
            {t('contacts.matchingCount', { count: matchingContactsCount })}
          </span>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'Barlow, sans-serif',
            fontWeight: 200,
            fontSize: '14px',
            whiteSpace: 'nowrap'
          }}>
            <input
              type="checkbox"
              checked={showOnlyActive}
              onChange={(e) => setShowOnlyActive(e.target.checked)}
              style={checkboxStyle}
            />
            {t('contacts.activeOnly')}
          </label>
        </div>

        {loading || loadingZones ? (
          <p>{t('contacts.loading')}</p>
        ) : contacts.length === 0 ? (
          <p>{t('contacts.noResults')}</p>
        ) : (
          <div style={gridStyle}>
            {contacts.map((contact) => (
              <div
                key={contact.id}
                style={cardStyle}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                }}
              >
                <h3 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '16px', marginBottom: '10px', textAlign: 'center' }}>
                  {contact.prenom} {contact.noms}
                </h3>
                <p style={cardTextStyle}><strong>{t('contacts.functionLabel')}:</strong> {contact.fonction}</p>
                <p style={cardTextStyle}><strong>{t('contacts.groupLabel')}:</strong> {contact.groupe}</p>
                <p style={cardTextStyle}><strong>{t('contacts.siteLabel')}:</strong> {contact.site}</p>
                <p style={cardTextStyle}><strong>{t('contacts.emailLabel')}:</strong> {contact.email}</p>
                {contact.num_mobile && <p style={cardTextStyle}><strong>{t('contacts.mobileLabel')}:</strong> {contact.num_mobile}</p>}
                {contact.num_fixe && <p style={cardTextStyle}><strong>{t('contacts.fixeLabel')}:</strong> {contact.num_fixe}</p>}

                {/* Ligne blanche avec statut et bouton Modifier */}
                <div style={{
                  marginTop: 'auto',
                  paddingTop: '10px',
                  borderTop: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <p style={{
                    ...cardTextStyle,
                    color: contact.contact_actif ? '#008000' : '#FF0000',
                    margin: 0
                  }}>
                    <strong>{t('contacts.statusLabel')}:</strong> {contact.contact_actif ? t('contacts.active') : t('contacts.inactive')}
                  </p>
                  <button
                    onClick={() => handleEditContact(contact)}
                    style={modifyButtonStyle}
                  >
                    {t('contacts.edit')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modale Ajouter Groupe */}
      {showAddGroupModal && (
        <>
          <div style={modalOverlayStyle} onClick={handleCloseGroupModal} />
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>{t('sites.addGroupTitle')}</h2>
            <div style={{ marginBottom: '15px' }}>
              <label style={modalLabelStyle}>{t('sites.groupName')}</label>
              <input
                type="text"
                value={newGroupData.nom_groupe}
                onChange={async (e) => {
                  const value = e.target.value;
                  setNewGroupData(prev => ({ ...prev, nom_groupe: value }));
                  if (!value.trim()) { setGroupNameError(''); return; }
                  const exists = await checkGroupExists(value);
                  setGroupNameError(exists ? t('sites.groupExists') : '');
                }}
                style={{ ...inputStyle, borderColor: groupNameError ? '#ff4444' : '#ddd' }}
                placeholder={t('sites.groupNamePlaceholder')}
              />
              {groupNameError && <span style={errorStyle}>{groupNameError}</span>}
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={modalLabelStyle}>{t('sites.websiteAddress')}</label>
              <input
                type="url"
                value={newGroupData.site_web}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, site_web: e.target.value }))}
                style={inputStyle}
                placeholder={t('sites.websitePlaceholder')}
              />
            </div>
            {groupSubmitMessage && (
              <div style={{
                padding: '10px', marginBottom: '15px', borderRadius: '4px',
                fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px',
                backgroundColor: groupSubmitMessage.isSuccess ? '#d4edda' : '#f8d7da',
                color: groupSubmitMessage.isSuccess ? '#155724' : '#721c24',
                border: `1px solid ${groupSubmitMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
                textAlign: 'center'
              }}>
                {groupSubmitMessage.text}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={handleCloseGroupModal} style={buttonStyle}>{t('common.cancel')}</button>
              <button
                type="button"
                onClick={handleAddGroup}
                disabled={!newGroupData.nom_groupe.trim() || !!groupNameError || isGroupSubmitting}
                style={{
                  ...buttonStyle,
                  opacity: (!newGroupData.nom_groupe.trim() || !!groupNameError || isGroupSubmitting) ? 0.5 : 1,
                  cursor: (!newGroupData.nom_groupe.trim() || !!groupNameError || isGroupSubmitting) ? 'not-allowed' : 'pointer'
                }}
              >
                {isGroupSubmitting ? t('sites.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modale Ajouter Site */}
      {showAddSiteModal && (
        <>
          <div style={modalOverlayStyle} onClick={handleCloseSiteModal} />
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>{t('sites.addSiteTitle')}</h2>

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
                  {domainTags.map(tag => <option key={tag} value={tag}>{t('sites.domains.' + tag)}</option>)}
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
              <button type="button" onClick={handleCloseSiteModal} style={buttonStyle}>{t('common.cancel')}</button>
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

// Styles
const formContainerStyle = {
  backgroundColor: '#A6A6A6',
  padding: '10px',
  borderRadius: '8px',
  marginBottom: '30px',
  boxSizing: 'border-box',
  width: '100%'
};

const formHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '10px'
};

const formTitleStyle = {
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '18px',
  margin: 0
};

const contactActifLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px'
};

const checkboxStyle = {
  width: '16px',
  height: '16px'
};

const mainGridStyle = {
  display: 'grid',
  gridTemplateColumns: '3fr 1fr',
  gap: '10px'
};

const leftColumnStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const rightColumnStyle = {
  display: 'flex',
  flexDirection: 'column'
};

const formRowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px'
};

const formFieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px'
};

const labelStyle = {
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px'
};

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

const modifyButtonStyle = {
  height: '25px',
  padding: '0 10px',
  border: '1px solid black',
  borderRadius: '4px',
  backgroundColor: '#E5E5E4',
  cursor: 'pointer',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '12px'
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '20px',
  alignItems: 'start'
};

const cardStyle = {
  backgroundColor: '#A6A6A6',
  border: '1px solid #ddd',
  borderRadius: '8px',
  padding: '10px',
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

const addButtonStyle: React.CSSProperties = {
  width: '38px',
  height: '38px',
  flexShrink: 0,
  border: '1px solid black',
  borderRadius: '4px',
  backgroundColor: '#E5E5E4',
  cursor: 'pointer',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 700,
  fontSize: '20px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1
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

const editModalFormStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 1000,
  width: 'min(960px, calc(100vw - 20px))',
  maxWidth: 'calc(100vw - 20px)',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
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