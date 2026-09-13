import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow, Autocomplete } from '@react-google-maps/api';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { useUserZones } from '../lib/userZones';
import { Link } from 'react-router-dom';
import { useIsMobile, MOBILE_BREAKPOINT } from '../lib/useIsMobile';

// Types
interface Address {
  formatted?: string;
}

interface Site {
  id: string;
  created_date: string;
  updated_date: string;
  owner: string;
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

// Couleurs pour les tags
const colorTagColors: Record<string, { background: string; text: string }> = {
  'Non visités': { background: '#000000', text: '#FFFFFF' },
  'Visités': { background: '#008000', text: '#FFFFFF' },
  'Visités il y a +18mois': { background: '#FFA500', text: '#000000' },
  'A visiter': { background: '#FF0000', text: '#FFFFFF' },
  'Fermés': { background: '#0000FF', text: '#FFFFFF' },
};

// Formatage de date
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return "";
  try {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
};

const DEFAULT_MAP_CENTER = { lat: 46.8, lng: 1.5 };

export default function Sites() {
  // États principaux
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedColors, setSelectedColors] = useState<string[]>(['Non visités', 'Visités', 'Visités il y a +18mois', 'A visiter', 'Fermés']);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(['Ciment', 'Mineralurgie', 'Platre', 'Papeterie', 'Fertilisant', 'Autre']);
  const { t } = useTranslation();
  const { allowedCountries, loadingZones } = useUserZones();
  const isMobile = useIsMobile();
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(DEFAULT_MAP_CENTER);
  const [selectedSites, setSelectedSites] = useState<Site[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapDimensions, setMapDimensions] = useState({ width: 980, height: 490 });
  const initialZoom = 4;

  // États pour les groupes
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [filteredGroupes, setFilteredGroupes] = useState<Groupe[]>([]);

  const colorTags = ['Non visités', 'Visités', 'Visités il y a +18mois', 'A visiter', 'Fermés'];
  const domainTags = ['Ciment', 'Mineralurgie', 'Platre', 'Papeterie', 'Fertilisant', 'Autre'];

  // États pour les modales
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupData, setNewGroupData] = useState({ nom_groupe: '', site_web: '' });
  const [groupNameError, setGroupNameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);

  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editGroupData, setEditGroupData] = useState({ nom_groupe: '', site_web: '' });
  const [originalGroupName, setOriginalGroupName] = useState('');
  const [editGroupNameError, setEditGroupNameError] = useState('');
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);
  const [editSubmitMessage, setEditSubmitMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  // États pour la modale Ajouter Site
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

  // Initialiser l'Autocomplete pour l'adresse
  const onLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    setAddressAutocomplete(autocomplete);
  }, []);

  const onPlaceChanged = useCallback(() => {
    if (!addressAutocomplete) return;

    const place = addressAutocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;

    // Extraire le pays
    const countryComponent = place.address_components?.find(
      (component: any) => component.types.includes('country')
    );
    const country = countryComponent?.long_name || '';

    // Extraire la latitude et longitude
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

  // Vérifier si le nom du groupe existe déjà
  const checkGroupExists = useCallback(async (nom: string, excludeId?: string): Promise<boolean> => {
    if (!nom.trim()) return false;
    const { data } = await supabase
      .from('groupes')
      .select('ID')
      .ilike('nom_groupe', nom.trim())
      .neq('ID', excludeId || '')
      .maybeSingle();
    return !!data;
  }, []);

  // Vérifier si le nom du site existe déjà
  const checkSiteExists = useCallback(async (nom: string): Promise<boolean> => {
    if (!nom.trim()) return false;
    const { data } = await supabase
      .from('sites')
      .select('id')
      .ilike('noms', nom.trim())
      .maybeSingle();
    return !!data;
  }, []);

  // Récupérer tous les groupes
  const fetchGroupes = useCallback(async () => {
    const { data, error } = await supabase
      .from('groupes')
      .select('ID, nom_groupe, site_web')
      .order('nom_groupe', { ascending: true });
    if (error) console.error('Erreur:', error);
    return data || [];
  }, []);

  // Filtrer les groupes pour les dropdowns
  const handleGroupSearch = (value: string) => {
    setEditGroupData(prev => ({ ...prev, nom_groupe: value }));
    setFilteredGroupes(value === '' ? groupes : groupes.filter(g => g.nom_groupe.toLowerCase().includes(value.toLowerCase())));
  };

  const handleSiteGroupSearch = (value: string) => {
    setNewSiteData(prev => ({ ...prev, groupe: value }));
    setFilteredSiteGroupes(value === '' ? groupes : groupes.filter(g => g.nom_groupe.toLowerCase().includes(value.toLowerCase())));
  };

  // Sélectionner un groupe
  const handleSelectGroup = (groupe: Groupe) => {
    setEditGroupData({ nom_groupe: groupe.nom_groupe, site_web: groupe.site_web || '' });
    setOriginalGroupName(groupe.nom_groupe);
    setEditGroupNameError('');
    setShowGroupDropdown(false);
  };

  const handleSelectSiteGroup = (groupe: Groupe) => {
    setNewSiteData(prev => ({ ...prev, groupe: groupe.nom_groupe }));
    setShowSiteGroupDropdown(false);
  };

  // Vérifier si le formulaire de modification a changé
  const hasEditFormChanged = () => {
    const currentGroup = groupes.find(g => g.nom_groupe === originalGroupName);
    return editGroupData.nom_groupe !== originalGroupName ||
           editGroupData.site_web !== currentGroup?.site_web;
  };

  // Gestion du changement du nom du groupe
  const handleEditGroupNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEditGroupData(prev => ({ ...prev, nom_groupe: value }));
    setFilteredGroupes(value === '' ? groupes : groupes.filter(g => g.nom_groupe.toLowerCase().includes(value.toLowerCase())));
    setShowGroupDropdown(true);

    if (!value.trim()) {
      setEditGroupNameError('');
      return;
    }

    const currentGroup = groupes.find(g => g.nom_groupe === originalGroupName);
    if (value.trim().toLowerCase() === originalGroupName.toLowerCase()) {
      setEditGroupNameError('');
      return;
    }

    const exists = await checkGroupExists(value, currentGroup?.ID);
    setEditGroupNameError(exists ? t('sites.groupExists') : '');
  };

  // Gestion du changement du nom du site
  const handleSiteNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewSiteData(prev => ({ ...prev, noms: value }));
    if (!value.trim()) {
      setSiteNameError('');
      return;
    }
    const exists = await checkSiteExists(value);
    setSiteNameError(exists ? t('sites.siteExists') : '');
  };

  // Gestion de l'ajout d'un groupe
  const handleAddGroup = async () => {
    if (!newGroupData.nom_groupe.trim() || groupNameError) return;
    setIsSubmitting(true);
    setSubmitMessage(null);

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
      setSubmitMessage({ text: t('sites.groupAdded'), isSuccess: true });
      const updatedGroupes = await fetchGroupes();
      setGroupes(updatedGroupes);
      setFilteredGroupes(updatedGroupes);
      setTimeout(() => { setShowAddGroupModal(false); resetGroupForm(); }, 1000);
    } catch (error: any) {
      setSubmitMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gestion de la modification d'un groupe
  const handleUpdateGroup = async () => {
    if (!hasEditFormChanged() || editGroupNameError) return;
    setIsEditingSubmitting(true);
    setEditSubmitMessage(null);

    try {
      const currentGroup = groupes.find(g => g.nom_groupe === originalGroupName);
      if (!currentGroup) throw new Error('Groupe non trouvé');

      const now = new Date().toISOString();
      const formattedName = editGroupData.nom_groupe.trim();
      const formattedSiteWeb = editGroupData.site_web.trim();

      const updateData: any = { site_web: formattedSiteWeb, updated_date: now };
      if (formattedName.toLowerCase() !== originalGroupName.toLowerCase()) {
        updateData.nom_groupe = formattedName;
      }

      const { error: groupError } = await supabase
        .from('groupes')
        .update(updateData)
        .eq('ID', currentGroup.ID);
      if (groupError) throw groupError;

      if (formattedName.toLowerCase() !== originalGroupName.toLowerCase()) {
        const { error: contactsError } = await supabase
          .from('contacts')
          .update({ groupe: formattedName })
          .eq('groupe', originalGroupName);
        if (contactsError) throw contactsError;

        const { error: sitesError } = await supabase
          .from('sites')
          .update({ groupe: formattedName })
          .eq('groupe', originalGroupName);
        if (sitesError) throw sitesError;
      }

      setEditSubmitMessage({ text: t('sites.groupEdited'), isSuccess: true });
      const updatedGroupes = await fetchGroupes();
      setGroupes(updatedGroupes);
      setFilteredGroupes(updatedGroupes);
      await fetchSites();
      setTimeout(() => { setShowEditGroupModal(false); resetEditGroupForm(); }, 1000);
    } catch (error: any) {
      setEditSubmitMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  // Gestion de l'ajout d'un site
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
      await fetchSites();
      setTimeout(() => { setShowAddSiteModal(false); resetSiteForm(); }, 1000);
    } catch (error: any) {
      setSiteSubmitMessage({ text: `Erreur: ${error.message}`, isSuccess: false });
    } finally {
      setIsSiteSubmitting(false);
    }
  };

  // Réinitialiser les formulaires
  const resetGroupForm = () => {
    setNewGroupData({ nom_groupe: '', site_web: '' });
    setGroupNameError('');
    setSubmitMessage(null);
    setIsSubmitting(false);
  };

  const resetEditGroupForm = () => {
    setEditGroupData({ nom_groupe: '', site_web: '' });
    setOriginalGroupName('');
    setEditGroupNameError('');
    setEditSubmitMessage(null);
    setIsEditingSubmitting(false);
    setShowGroupDropdown(false);
  };

  const resetSiteForm = () => {
    setNewSiteData({
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
    setSiteNameError('');
    setSiteSubmitMessage(null);
    setIsSiteSubmitting(false);
    setShowSiteGroupDropdown(false);
    setFilteredSiteGroupes([]);
    setAddressAutocomplete(null);
  };

  // Ouvrir/Fermer les modales
  const handleOpenEditGroupModal = () => {
    setShowEditGroupModal(true);
    setShowGroupDropdown(false);
    resetEditGroupForm();
  };

  const handleOpenAddSiteModal = () => {
    setShowAddSiteModal(true);
    setShowSiteGroupDropdown(false);
    setFilteredSiteGroupes(groupes);
    resetSiteForm();
  };

  const handleCloseGroupModal = () => { setShowAddGroupModal(false); resetGroupForm(); };
  const handleCloseEditGroupModal = () => { setShowEditGroupModal(false); resetEditGroupForm(); };
  const handleCloseSiteModal = () => { setShowAddSiteModal(false); resetSiteForm(); };

  // Fonction de filtrage
  const matchesFilters = (site: Site) => {
    // Filtre par pays autorisés (zones de l'utilisateur)
    if (allowedCountries && !allowedCountries.includes(site.pays)) return false;
    if (searchText) {
      const lowerSearch = searchText.toLowerCase();
      const textMatch = (
        (site.noms && site.noms.toLowerCase().includes(lowerSearch)) ||
        (site.groupe && site.groupe.toLowerCase().includes(lowerSearch)) ||
        (site.observations && site.observations.toLowerCase().includes(lowerSearch)) ||
        (site.pays && site.pays.toLowerCase().includes(lowerSearch))
      );
      if (!textMatch) return false;
    }
    if (selectedColors.length > 0 && !selectedColors.includes(site.couleur)) return false;
    if (selectedDomains.length > 0 && !selectedDomains.includes(site.domaine)) return false;
    return true;
  };

  // Gestion des tags
  const toggleColorTag = (tag: string) => {
    setSelectedColors(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  const toggleDomainTag = (tag: string) => {
    setSelectedDomains(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  // Dimensions de la carte
  useEffect(() => {
    const updateDimensions = () => {
      if (mapContainerRef.current) {
        const width = Math.min(mapContainerRef.current.clientWidth, 980);
        const ratio = width < MOBILE_BREAKPOINT ? 1.0 : 0.5;
        setMapDimensions({ width, height: width * ratio });
      }
    };
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Récupération des données initiales
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError) console.error('Erreur:', authError);

        // Centre de carte défini pour cet utilisateur (depuis profiles)
        if (session?.user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('map_center_lat, map_center_lng')
            .eq('id', session.user.id)
            .single();
          if (!profileError && profile) {
            const lat = typeof profile.map_center_lat === 'number' ? profile.map_center_lat : parseFloat(profile.map_center_lat);
            const lng = typeof profile.map_center_lng === 'number' ? profile.map_center_lng : parseFloat(profile.map_center_lng);
            if (!isNaN(lat) && !isNaN(lng)) {
              setMapCenter({ lat, lng });
            }
          }
        }

        const { data: sitesData, error: sitesError } = await supabase
          .from('sites')
          .select('*')
          .order('created_date', { ascending: false });

        if (sitesError) {
          console.error('Erreur:', sitesError);
        } else {
          const validSites = sitesData?.filter(site => {
            const lat = parseFloat(site.latitude);
            const lng = parseFloat(site.longitude);
            return !isNaN(lat) && !isNaN(lng);
          }) || [];
          setAllSites(validSites);
        }

        const groupesData = await fetchGroupes();
        setGroupes(groupesData);
        setFilteredGroupes(groupesData);
        setFilteredSiteGroupes(groupesData);
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [fetchGroupes]);

  // Récupération des sites
  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .order('created_date', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else {
        const validSites = data?.filter(site => {
          const lat = parseFloat(site.latitude);
          const lng = parseFloat(site.longitude);
          return !isNaN(lat) && !isNaN(lng);
        }) || [];
        setAllSites(validSites);
      }
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fonction pour l'icône
  const getMarkerIcon = (couleur: string) => {
    const iconMap: Record<string, string> = {
      'Noir': 'https://ptmkcivmgnfczijlxtaf.supabase.co/storage/v1/object/public/markers/noir.png',
      'Non visités': 'https://ptmkcivmgnfczijlxtaf.supabase.co/storage/v1/object/public/markers/noir.png',
      'Visités': 'https://ptmkcivmgnfczijlxtaf.supabase.co/storage/v1/object/public/markers/vert.png',
      'Visités il y a +18mois': 'https://ptmkcivmgnfczijlxtaf.supabase.co/storage/v1/object/public/markers/jaune.png',
      'Visité il y a + 18mois': 'https://ptmkcivmgnfczijlxtaf.supabase.co/storage/v1/object/public/markers/jaune.png',
      'A visiter': 'https://ptmkcivmgnfczijlxtaf.supabase.co/storage/v1/object/public/markers/rouge.png',
      'Fermés': 'https://ptmkcivmgnfczijlxtaf.supabase.co/storage/v1/object/public/markers/bleu.png',
    };
    const url = iconMap[couleur] || iconMap['Visités il y a +18mois'];
    return {
      url: url,
      scaledSize: new google.maps.Size(35, 48),
      origin: new google.maps.Point(0, 0),
      anchor: new google.maps.Point(17.5, 48)
    };
  };

  const handleMarkerClick = (site: Site) => {
    setSelectedSites(prev => prev.some(s => s.id === site.id) ? prev.filter(s => s.id !== site.id) : [...prev, site]);
  };

  // InfoWindow
  const getInfoWindowContent = (site: Site) => (
    <div style={{ fontFamily: 'Barlow, sans-serif', lineHeight: '1.2', padding: '0px', maxWidth: '300px' }}>
      <div style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>
        {site.groupe} - {site.noms}
      </div>
      <div style={{ textAlign: 'center', fontSize: '13px', margin: '2px 0' }}>{site.nb_contact} {t(site.nb_contact > 1 ? 'sites.contactsCountPlural' : 'sites.contactsCount')}</div>
      <div style={{ textAlign: 'center', fontSize: '13px', margin: '2px 0' }}>{t('sites.lastVisit')}: {formatDate(site.datevisite) || t('common.never')}</div>
      <div style={{ textAlign: 'center', marginTop: '4px' }}><a href={`/sites/${site.id}`} target="_blank" style={{ fontSize: '13px' }}>{t('sites.seeMore')}</a></div>
    </div>
  );

  // Styles
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
    marginRight: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const tagBaseStyle = {
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

  const domainTagStyle = (isSelected: boolean) => ({
    ...tagBaseStyle,
    backgroundColor: '#E5E5E4',
    fontWeight: isSelected ? 'bold' : 200,
    color: '#000000',
  });

  const colorTagStyle = (tag: string, isSelected: boolean) => {
    const colors = colorTagColors[tag] || { background: '#E5E5E4', text: '#000000' };
    return {
      ...tagBaseStyle,
      backgroundColor: isSelected ? colors.background : '#E5E5E4',
      color: isSelected ? colors.text : '#000000',
      fontWeight: isSelected ? 'bold' : 200,
    };
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
    fontWeight: 200,
    marginTop: '5px'
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

  const matchingSitesCount = allSites.filter(matchesFilters).length;

  return (
    <div style={{ padding: '10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Carte Google Maps */}
      <div ref={mapContainerRef} style={{ width: 'calc(100% - 20px)', maxWidth: '980px', margin: '0 auto 20px', border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden' }}>
        <GoogleMap
          mapContainerStyle={{ width: `${mapDimensions.width}px`, height: `${mapDimensions.height}px` }}
          zoom={initialZoom}
          center={mapCenter}
          options={{ minZoom: initialZoom - 2, maxZoom: initialZoom + 15, mapTypeControl: true, streetViewControl: false, gestureHandling: "greedy", disableDefaultUI: false }}
        >
          {allSites.filter(matchesFilters).map((site) => (
            <Marker
              key={site.id}
              position={{ lat: parseFloat(site.latitude), lng: parseFloat(site.longitude) }}
              icon={getMarkerIcon(site.couleur)}
              onClick={() => handleMarkerClick(site)}
            />
          ))}

          {selectedSites.map((site) => (
            <InfoWindow
              key={site.id}
              position={{ lat: parseFloat(site.latitude), lng: parseFloat(site.longitude) }}
              options={{ pixelOffset: new google.maps.Size(0, -30), disableAutoPan: true }}
              onCloseClick={() => setSelectedSites(prev => prev.filter(s => s.id !== site.id))}
            >
              {getInfoWindowContent(site)}
            </InfoWindow>
          ))}
        </GoogleMap>
      </div>

      {/* Zone de recherche */}
      <div style={{
        width: 'calc(100% - 20px)',
        maxWidth: '980px',
        margin: '0 auto 20px',
        backgroundColor: '#A6A6A6',
        borderRadius: '8px',
        padding: '10px',
        boxSizing: 'border-box'
      }}>
        {isMobile ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', justifyContent: 'center' }}>
              <button style={{ ...buttonStyle, marginRight: 0 }} onClick={() => setShowAddGroupModal(true)}>{t('sites.addGroup')}</button>
              <button style={{ ...buttonStyle, marginRight: 0 }} onClick={handleOpenEditGroupModal}>{t('sites.editGroup')}</button>
              <button style={{ ...buttonStyle, marginRight: 0 }} onClick={handleOpenAddSiteModal}>{t('sites.addSite')}</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px', justifyContent: 'center' }}>
              {colorTags.map(tag => (
                <span
                  key={tag}
                  style={{ ...colorTagStyle(tag, selectedColors.includes(tag)), marginLeft: 0 }}
                  onClick={() => toggleColorTag(tag)}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.02)'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                >
                  {t('sites.colors.' + tag)}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px', justifyContent: 'center' }}>
              {domainTags.map(tag => (
                <span
                  key={tag}
                  style={{ ...domainTagStyle(selectedDomains.includes(tag)), marginLeft: 0 }}
                  onClick={() => toggleDomainTag(tag)}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.02)'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                >
                  {t('sites.domains.' + tag)}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder={t('sites.searchPlaceholder')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  height: '30px',
                  width: '100%',
                  maxWidth: '400px',
                  padding: '0 15px',
                  border: '1px solid #000',
                  borderRadius: '4px',
                  fontFamily: 'Barlow, sans-serif',
                  fontWeight: 200,
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  boxSizing: 'border-box' as const
                }}
              />
            </div>

            <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {t('sites.matchingCount', { count: matchingSitesCount })}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <button style={{ ...buttonStyle, marginRight: '10px' }} onClick={() => setShowAddGroupModal(true)}>{t('sites.addGroup')}</button>
                <button style={{ ...buttonStyle, marginRight: '10px' }} onClick={handleOpenEditGroupModal}>{t('sites.editGroup')}</button>
                <button style={{ ...buttonStyle, marginRight: 0 }} onClick={handleOpenAddSiteModal}>{t('sites.addSite')}</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end' }}>
                {colorTags.map(tag => (
                  <span
                    key={tag}
                    style={{ ...colorTagStyle(tag, selectedColors.includes(tag)), marginLeft: 0 }}
                    onClick={() => toggleColorTag(tag)}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.02)'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                  >
                    {t('sites.colors.' + tag)}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input
                type="text"
                placeholder={t('sites.searchPlaceholder')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  height: '30px',
                  width: '210px',
                  padding: '0 15px',
                  border: '1px solid #000',
                  borderRadius: '4px',
                  fontFamily: 'Barlow, sans-serif',
                  fontWeight: 200,
                  fontSize: '14px',
                  backgroundColor: '#fff'
                }}
              />
              <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', margin: '0 5px', whiteSpace: 'nowrap' }}>
                {t('sites.matchingCount', { count: matchingSitesCount })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end' }}>
                {domainTags.map(tag => (
                  <span
                    key={tag}
                    style={{ ...domainTagStyle(selectedDomains.includes(tag)), marginLeft: 0 }}
                    onClick={() => toggleDomainTag(tag)}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.02)'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                  >
                    {t('sites.domains.' + tag)}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Fiches de sites */}
      <div style={{ width: 'calc(100% - 20px)', maxWidth: '980px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {loading || loadingZones ? (
          <p style={{ gridColumn: '1 / -1', textAlign: 'center' }}>{t('sites.loading')}</p>
        ) : allSites.filter(matchesFilters).length === 0 ? (
          <p style={{ gridColumn: '1 / -1', textAlign: 'center' }}>{t('sites.noResults')}</p>
        ) : (
          allSites.filter(matchesFilters).slice(0, 20).map((site) => (
            <div
              key={site.id}
              style={{
                backgroundColor: '#A6A6A6',
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '120px',
                boxShadow: '2px 3px 2px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
            >
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '18px', textAlign: 'center' }}>{site.groupe} - {site.noms}</div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '10px 0', fontSize: '16px', textAlign: 'center' }}>{site.pays}</p>
              </div>
              <div style={{
                marginTop: 'auto',
                paddingTop: '10px',
                borderTop: '1px solid #eee',
                fontSize: '14px',
                color: '#555',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontWeight: 'bold' }}>{site.nb_contact} {t(site.nb_contact > 1 ? 'sites.contactsCountPlural' : 'sites.contactsCount')}</span>
                <Link
                  to={`/sites/${site.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...buttonStyle,
                    height: '25px',
                    padding: '0 10px',
                    fontSize: '12px',
                    marginLeft: 'auto',
                    marginRight: '0',
                    textDecoration: 'none',
                    color: 'black'
                  }}
                >
                  {t('common.open')}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modale Ajouter Groupe */}
      {showAddGroupModal && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(5px)',
              zIndex: 999,
            }}
            onClick={handleCloseGroupModal}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#A6A6A6',
              borderRadius: '8px',
              padding: '20px',
              zIndex: 1000,
              width: '400px',
              maxWidth: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '20px', marginBottom: '20px', textAlign: 'center' }}>
              {t('sites.addGroupTitle')}
            </h2>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('sites.groupName')}
              </label>
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
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('sites.websiteAddress')}
              </label>
              <input
                type="url"
                value={newGroupData.site_web}
                onChange={(e) => setNewGroupData(prev => ({ ...prev, site_web: e.target.value }))}
                style={inputStyle}
                placeholder={t('sites.websitePlaceholder')}
              />
            </div>
            {submitMessage && (
              <div style={{
                padding: '10px',
                marginBottom: '15px',
                borderRadius: '4px',
                fontFamily: 'Barlow, sans-serif',
                fontWeight: 200,
                fontSize: '14px',
                backgroundColor: submitMessage.isSuccess ? '#d4edda' : '#f8d7da',
                color: submitMessage.isSuccess ? '#155724' : '#721c24',
                border: `1px solid ${submitMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
                textAlign: 'center'
              }}>
                {submitMessage.text}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={handleCloseGroupModal} style={{ ...buttonStyle, backgroundColor: '#E5E5E4' }}>{t('common.cancel')}</button>
              <button
                type="button"
                onClick={handleAddGroup}
                disabled={!newGroupData.nom_groupe.trim() || !!groupNameError || isSubmitting}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#E5E5E4',
                  opacity: (!newGroupData.nom_groupe.trim() || !!groupNameError || isSubmitting) ? 0.5 : 1,
                  cursor: (!newGroupData.nom_groupe.trim() || !!groupNameError || isSubmitting) ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? t('sites.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modale Modifier Groupe */}
      {showEditGroupModal && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(5px)',
              zIndex: 999,
            }}
            onClick={handleCloseEditGroupModal}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#A6A6A6',
              borderRadius: '8px',
              padding: '20px',
              zIndex: 1000,
              width: '400px',
              maxWidth: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '20px', marginBottom: '20px', textAlign: 'center' }}>
              {t('sites.editGroupTitle')}
            </h2>
            <div style={{ marginBottom: '15px', position: 'relative' }}>
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('sites.groupName')}
              </label>
              <input
                type="text"
                value={editGroupData.nom_groupe}
                onChange={handleEditGroupNameChange}
                onFocus={() => setShowGroupDropdown(true)}
                style={{ ...inputStyle, borderColor: editGroupNameError ? '#ff4444' : '#ddd' }}
                placeholder={t('sites.groupSearchPlaceholder')}
              />
              {showGroupDropdown && filteredGroupes.length > 0 && (
                <div style={dropdownStyle} onMouseDown={e => e.preventDefault()}>
                  {filteredGroupes.map(groupe => (
                    <div
                      key={groupe.ID}
                      onClick={() => handleSelectGroup(groupe)}
                      style={{ ...dropdownItemStyle, backgroundColor: editGroupData.nom_groupe === groupe.nom_groupe ? '#f0f0f0' : 'transparent' }}
                    >
                      {groupe.nom_groupe}
                    </div>
                  ))}
                </div>
              )}
              {editGroupNameError && <span style={errorStyle}>{editGroupNameError}</span>}
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('sites.websiteAddress')}
              </label>
              <input
                type="url"
                value={editGroupData.site_web}
                onChange={(e) => setEditGroupData(prev => ({ ...prev, site_web: e.target.value }))}
                style={inputStyle}
                placeholder={t('sites.websitePlaceholder')}
              />
            </div>
            {editSubmitMessage && (
              <div style={{
                padding: '10px',
                marginBottom: '15px',
                borderRadius: '4px',
                fontFamily: 'Barlow, sans-serif',
                fontWeight: 200,
                fontSize: '14px',
                backgroundColor: editSubmitMessage.isSuccess ? '#d4edda' : '#f8d7da',
                color: editSubmitMessage.isSuccess ? '#155724' : '#721c24',
                border: `1px solid ${editSubmitMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
                textAlign: 'center'
              }}>
                {editSubmitMessage.text}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={handleCloseEditGroupModal} style={{ ...buttonStyle, backgroundColor: '#E5E5E4' }}>{t('common.cancel')}</button>
              <button
                type="button"
                onClick={handleUpdateGroup}
                disabled={!hasEditFormChanged() || !!editGroupNameError || isEditingSubmitting}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#E5E5E4',
                  opacity: (!hasEditFormChanged() || !!editGroupNameError || isEditingSubmitting) ? 0.5 : 1,
                  cursor: (!hasEditFormChanged() || !!editGroupNameError || isEditingSubmitting) ? 'not-allowed' : 'pointer'
                }}
              >
                {isEditingSubmitting ? t('sites.editing') : t('common.edit')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modale Ajouter Site */}
      {showAddSiteModal && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(5px)',
              zIndex: 999,
            }}
            onClick={handleCloseSiteModal}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#A6A6A6',
              borderRadius: '8px',
              padding: '20px',
              zIndex: 1000,
              width: '500px',
              maxWidth: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 'bold', fontSize: '20px', marginBottom: '20px', textAlign: 'center' }}>
              {t('sites.addSiteTitle')}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              {/* Nom du site */}
              <div>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('sites.siteName')}
                </label>
                <input
                  type="text"
                  value={newSiteData.noms}
                  onChange={handleSiteNameChange}
                  style={{ ...inputStyle, borderColor: siteNameError ? '#ff4444' : '#ddd' }}
                  placeholder={t('sites.siteNamePlaceholder')}
                />
                {siteNameError && <span style={errorStyle}>{siteNameError}</span>}
              </div>

              {/* Groupe */}
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('sites.group')}
                </label>
                <input
                  type="text"
                  value={newSiteData.groupe}
                  onChange={(e) => handleSiteGroupSearch(e.target.value)}
                  onFocus={() => {
                    setShowSiteGroupDropdown(true);
                    setFilteredSiteGroupes(groupes);
                  }}
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

              {/* Domaine */}
              <div>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('sites.domain')}
                </label>
                <select
                  value={newSiteData.domaine}
                  onChange={(e) => setNewSiteData(prev => ({ ...prev, domaine: e.target.value }))}
                  style={inputStyle}
                >
                  {domainTags.map(tag => (
                    <option key={tag} value={tag}>{t('sites.domains.' + tag)}</option>
                  ))}
                </select>
              </div>

              {/* Couleur */}
              <div>
                <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                  {t('sites.color')}
                </label>
                <select
                  value={newSiteData.couleur}
                  onChange={(e) => setNewSiteData(prev => ({ ...prev, couleur: e.target.value }))}
                  style={inputStyle}
                >
                  {colorTags.map(tag => (
                    <option key={tag} value={tag}>{t('sites.colors.' + tag)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Adresse avec Autocomplete Google */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('sites.address')}
              </label>
              <Autocomplete
                onLoad={onLoad}
                onPlaceChanged={onPlaceChanged}
              >
                <input
                  type="text"
                  value={newSiteData.adress.formatted}
                  onChange={(e) => setNewSiteData(prev => ({
                    ...prev,
                    adress: { formatted: e.target.value }
                  }))}
                  style={inputStyle}
                  placeholder={t('sites.addressPlaceholder')}
                />
              </Autocomplete>
            </div>

            {/* Pays (automatiquement rempli) */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('sites.country')}
              </label>
              <input
                type="text"
                value={newSiteData.pays}
                readOnly
                style={{ ...inputStyle, backgroundColor: '#f5f5f5' }}
                placeholder={t('sites.countryAutoPlaceholder')}
              />
            </div>

            {/* Observations */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' }}>
                {t('sites.observations')}
              </label>
              <textarea
                value={newSiteData.observations}
                onChange={(e) => setNewSiteData(prev => ({ ...prev, observations: e.target.value }))}
                style={{ ...inputStyle, height: '100px', resize: 'vertical' }}
                placeholder={t('sites.observationsPlaceholder')}
              />
            </div>

            {siteSubmitMessage && (
              <div style={{
                padding: '10px',
                marginBottom: '15px',
                borderRadius: '4px',
                fontFamily: 'Barlow, sans-serif',
                fontWeight: 200,
                fontSize: '14px',
                backgroundColor: siteSubmitMessage.isSuccess ? '#d4edda' : '#f8d7da',
                color: siteSubmitMessage.isSuccess ? '#155724' : '#721c24',
                border: `1px solid ${siteSubmitMessage.isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
                textAlign: 'center'
              }}>
                {siteSubmitMessage.text}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={handleCloseSiteModal} style={{ ...buttonStyle, backgroundColor: '#E5E5E4' }}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleAddSite}
                disabled={!newSiteData.noms.trim() || !!siteNameError || !newSiteData.groupe.trim() || !newSiteData.latitude.trim() || !newSiteData.longitude.trim() || isSiteSubmitting}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#E5E5E4',
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