# Jenny CRM — Archive du projet & contexte

Ce document archive l'ensemble des discussions et décisions du projet « Mode visite IA »
et sert de contexte de référence pour toute évolution future du site.

---

## 1. Stack technique

- **Front** : React 18 + TypeScript + Vite
- **Carte** : `@react-google-maps/api` (LoadScript dans `src/components/GoogleMapsWrapper.tsx`,
  libraries `places`, wrap de l'app dans App.tsx)
- **Backend** : Supabase (auth, base, RLS), migrations dans `supabase/migrations/`
- **i18n** : react-i18next, fichiers `src/i18n/fr.json` / `en.json`
- **Routing** : react-router v7
- **API Google** : Maps JavaScript, Directions (Distance Matrix non autorisée par la clé
  → repli automatique sur Directions puis estimation locale)

## 2. Fonctionnalité « Mode visite IA » — historique complet

### Phase 1 — Fonctionnalité initiale (PR #37, fusionné)
Depuis la carte des Sites, cocher « Mode visite IA » (overlay en bas à gauche de la carte)
puis cliquer des pins → bouton de génération d'un projet de voyage :
- Départ de Lille (ou ville d'origine du profil)
- Train privilégié, sinon avion via CRL (voiture) / Lille-Lesquin / CDG-ORY (train)
- Arrivée au hub (gare/aéroport) le plus stratégique, voiture de location locale
- Ordre de visite optimisé (plus proche voisin + contraintes)
- Réunions de 2h par défaut, début ≥ 8h30, dernier RDV ≤ 15h, bascule jour+1
- Retour par le même hub
- Enregistrement du voyage → page **Visite** (l'utilisateur ne voit que ses voyages, RLS)
- Étapes manuelles, réordonnancement des visites, date/heure par étape

### Phase 2 — Préférences & UX (PR #37 + suivants)
- Préférences de voyage liées au profil, éditables en haut de la page Visite :
  ville d'origine, gares et aéroports à privilégier (saisie libre, monde entier),
  durée standard de réunion (1h–8h)
- Renommage d'une étape à l'ajout, puis à tout moment (✎)
- Date de début de trajet propagée sur les étapes (surcharge possible par étape)
- Carte dynamique du trajet (mise à jour au réordonnancement)
- Seules les visites clients sont réordonnables ; les déplacements s'adaptent

### Phase 3 — Corrections et PDF
- Bug date de départ (jour J-1) corrigé
- Numérotation des sites sur la carte identique au programme (1, 2, 3…)
- Trajets obsolètes supprimés au réordonnancement (ancien bug des +5000 km)
- Pas de 15 min sur les select d'heures
- Durée de réunion personnalisable par site (défaut 2h)
- **Export PDF** : roadbook complet + carte, charte graphique Jenny,
  « Développé par Corentin VANBREMEERSCH - 2026 » dans l'entête,
  carte zoomée automatiquement sur le trajet (fitBounds)
- Traductions FR (InfoWindow, « see more » → « voir plus », etc.)

### Phase 4 — Hub intelligent & train national (PR #45, fusionné)
- Pays multi-aéroports, gardes de distance (train ≤ 600 km, outre-mer > 3000 km → hub local)
- Correspondance train nationale : Lille → St Pancras → Derby → voiture (Angleterre)
- Fix affichage durées (Math.round → fmtDurationHM)

### Phase 5 — Intégration Google Directions (PR #46 + #47)
- `src/lib/googleDirections.ts` : DirectionsService (Maps JS) — parsing `routes[0].legs[0]`
  (bug historique : lecture de `res.legs`), cache mémoire par coordonnées arrondies,
  attente du runtime maps (~5 s), repli transit→driving sur ZERO_RESULTS
- DistanceMatrix d'abord, Directions en repli (clé actuelle : Directions OK, Matrix refusé)
- Diagnostic dans le modal (nb OK/échecs, dernier statut/appel) — sans mention Google visible
- Durées réelles persistées sur les étapes (`legKm`/`legMinutes`)

### Phase 6 — Page Visite : manipulations d'étapes (PR #47)
- Étapes manuelles déplaçables librement (flèches ↑↓), renommage de toute étape
- Au réordonnancement des visites : les étapes manuelles sont **conservées**
  (rattachées à la réunion précédente), les trajets recalculés
- Cache des liaisons : seuls les trajets **modifiés** sont recalculés via l'API,
  les durées réelles déjà obtenues sont réutilisées
- Horaires pré-remplis depuis le trajet calculé ; cascade d'ajustement
  quand l'utilisateur change une heure ou une durée (contraintes 8h30/15h respectées,
  étapes à horaire fixe = nouveaux points d'ancrage)
- Clé i18n `common.confirm` manquante corrigée (« Confirmer »)

### Phase 7 — Logique de voyage avancée (PR #47, en cours)
- **Retour par un hub différent** : préférence « Autoriser un retour par une autre
  gare/aéroport » ; si autorisé et un hub est ≥ 40 % plus proche du dernier site,
  le retour l'utilise (gare/aéroport + agence de retour de location)
- **Route > 5h depuis l'origine → train puis location** (gare du pays la mieux placée)
- **Regroupement géographique** (clusterSites) : fusion de sites proches (< 500 km)
  même de pays différents — ex. France + Suisse frontaliers = 1 voyage
  (train Lille → Genève-Cornavin, location, 4 visites, retour)
- **Voiture directe** pour sites ≤ 150 km (ex. Tournai : voiture Lille → Tournai,
  pas de train/avion ni location)
- **Irlande** : garde insulaire (pas de hub ferroviaire britannique), aéroports
  irlandais/nord-irlandais ajoutés (Dublin, Shannon, Cork, Belfast) →
  Dublin + Belfast + Athlone = 1 voyage avion via Dublin
- Gares suisses ajoutées (Genève-Cornavin, Lausanne, Zurich, Bâle)
- **Préférences gares/aéroports** : pool persistant + sélection/désélection
  par clic (✓), suppression individuelle par ✕ ; colonnes Supabase
  `selected_stations`, `selected_airports`, `allow_different_return_hub`

## 3. Base de données (migrations à exécuter)

- `0003_visit_trips.sql` — table visit_trips (RLS : utilisateur = propriétaire)
- `0004_visit_preferences.sql` — préférences de voyage par utilisateur
- `0005_visit_prefs_meeting_minutes.sql` — durée standard de réunion
- `0006_visit_prefs_return_hub.sql` — pool sélectionnable
  (`selected_stations`, `selected_airports` jsonb) + `allow_different_return_hub` bool

## 4. Conventions de développement

- **Chaque mise à jour significative** doit être ajoutée dans
  `help.recentItems` (page Home) — fr + en
- tsc : erreurs préexistantes TS2322 exclues ; ESLint : doit être propre
  sur les nouveaux fichiers (6 `no-explicit-any` préexistants dans Sites.tsx)
- Tests runtime : compilation TS vers /tmp, stub `googleDirections`
  (`drivingLeg/transitLeg → null`) + `global.window = { google: undefined }`
- Certains fichiers sont compactés sur une seule ligne : préférer des scripts
  python avec correspondance exacte + assertions
- Interpolation i18n : `{{var}}` (pas `{var}`)
- Fusion des PR via CLI impossible → l'utilisateur fusionne manuellement
  via l'interface GitHub

## 5. Fichiers clés

- `src/lib/tripPlanner.ts` — moteur de planification (planTripAsync,
  rebuildTripSteps, cascadeAfterEdit, clusterSites, pickHub, pickReturnHub)
- `src/lib/googleDirections.ts` — Directions + diagnostic
- `src/pages/Visite.tsx` — page voyages (préférences, étapes, PDF)
- `src/pages/Sites.tsx` — carte + mode visite IA + modal de proposition
- `src/i18n/fr.json` / `en.json` — traductions + help.recentItems

## 6. État actuel (dernier commit : ace4259)

PR #47 (branche `vibe/visite-directions-diag-f3f547`) contient :
parsing Directions corrigé, mentions Google retirées, étapes manuelles
(déplacement + renommage + conservation au réordonnancement), cache de liaisons,
cascade d'horaires, retour par hub différent, règle 5h train, clustering
multi-pays (France+Suisse, Irlande), voiture directe proche, sélection
gares/aéroports avec suppression. En attente de fusion manuelle par l'utilisateur.

## 7. Propositions d'évolution (non implémentées)

Priorités suggérées :
1. **Export calendrier (.ics)** depuis la page Visite
2. **Rappels de visite** (email/notification)
3. **Compte-rendu de visite** par site (transforme l'outil en vrai CRM)
Autres : contacts/appel depuis l'InfoWindow, pipeline de prospection,
partage de voyage en lecture seule, visites récurrentes, estimation de coûts,
suggestion d'hôtels (Places API), recherche globale, PWA/mobile, statistiques.
