export interface Continent {
  continent: string;
  pays: string[];
}

export const CONTINENTS: Continent[] = [
  {
    continent: 'Amérique du Nord',
    pays: ['Canada', 'États-Unis', 'Mexique', 'Bermudes', 'Groenland', 'Saint-Pierre-et-Miquelon'],
  },
  {
    continent: 'Amérique Centrale',
    pays: [
      'Belize', 'Costa Rica', 'Salvador', 'Guatemala', 'Honduras', 'Nicaragua', 'Panama',
      'Antigua-et-Barbuda', 'Bahamas', 'Barbade', 'Cuba', 'Dominique', 'Republique dominicaine',
      'Grenade', 'Haïti', 'Jamaïque', 'Saint-Christophe-et-Nieves', 'Sainte-Lucie',
      'Saint-Vincent-et-les-Grenadines', 'Trinite-et-Tobago',
    ],
  },
  {
    continent: 'Amérique du Sud',
    pays: ['Argentine', 'Bolivie', 'Brésil', 'Chili', 'Colombie', 'Équateur', 'Guyana', 'Paraguay', 'Pérou', 'Suriname', 'Uruguay', 'Venezuela'],
  },
  {
    continent: 'Océanie',
    pays: ['Australie', 'Fidji', 'Kiribati', 'Îles Marshall', 'Micronesie', 'Nauru', 'Nouvelle-Zelande', 'Palaos', 'Papouasie-Nouvelle-Guinee', 'Salomon', 'Samoa', 'Tonga', 'Tuvalu', 'Vanuatu'],
  },
  {
    continent: 'Europe',
    pays: [
      'Albanie', 'Allemagne', 'Andorre', 'Autriche', 'Belgique', 'Bielorussie', 'Bosnie-Herzegovine',
      'Bulgarie', 'Chypre', 'Croatie', 'Danemark', 'Espagne', 'Estonie', 'Finlande', 'France',
      'Grèce', 'Hongrie', 'Irlande', 'Islande', 'Italie', 'Kosovo', 'Lettonie', 'Liechtenstein',
      'Lituanie', 'Luxembourg', 'Macedoine du Nord', 'Malte', 'Moldavie', 'Monaco', 'Monténégro',
      'Norvege', 'Pays-Bas', 'Pologne', 'Portugal', 'République tchèque', 'Roumanie', 'Royaume-Uni',
      'Saint-Marin', 'Serbie', 'Slovaquie', 'Slovenie', 'Suède', 'Suisse', 'Ukraine', 'Vatican',
    ],
  },
  {
    continent: 'Moyen-Orient',
    pays: [
      'Arabie saoudite', 'Bahreïn', 'Émirats arabes unis', 'Iran', 'Irak', 'Israël', 'Jordanie',
      'Koweït', 'Liban', 'Oman', 'Palestine', 'Qatar', 'Syrie', 'Yémen',
    ],
  },
  {
    continent: 'Asie',
    pays: [
      'Afghanistan', 'Arménie', 'Azerbaïdjan', 'Bangladesh', 'Bhoutan', 'Birmanie (Myanmar)',
      'Brunei', 'Cambodge', 'Chine', 'Coree du Nord', 'Coree du Sud', 'Géorgie', 'Inde',
      'Indonésie', 'Japon', 'Kazakhstan', 'Kirghizistan', 'Laos', 'Malaisie', 'Maldives',
      'Mongolie', 'Népal', 'Ouzbékistan', 'Pakistan', 'Philippines', 'Russie', 'Singapour',
      'Sri Lanka', 'Tadjikistan', 'Taïwan', 'Thaïlande', 'Timor oriental', 'Turquie',
      'Turkmenistan', 'Viêt Nam',
    ],
  },
  {
    continent: 'Afrique',
    pays: [
      'Afrique du Sud', 'Algérie', 'Angola', 'Bénin', 'Botswana', 'Burkina Faso', 'Burundi',
      'Cap-Vert', 'Cameroun', 'Comores', 'Congo (Brazzaville)', 'Congo (RDC / Kinshasa)',
      'Côte d\'Ivoire', 'Djibouti', 'Égypte', 'Érythrée', 'Eswatini (ex-Swaziland)', 'Éthiopie',
      'Gabon', 'Gambie', 'Ghana', 'Guinee', 'Guinée équatoriale', 'Guinée-Bissau', 'Kenya',
      'Lesotho', 'Liberia', 'Libye', 'Madagascar', 'Malawi', 'Mali', 'Maroc', 'Maurice',
      'Mauritanie', 'Mozambique', 'Namibie', 'Niger', 'Nigeria', 'Ouganda', 'Rwanda',
      'Sao Tome-et-Principe', 'Sénégal', 'Seychelles', 'Sierra Leone', 'Somalie', 'Soudan',
      'Soudan du Sud', 'Tanzanie', 'Tchad', 'Togo', 'Tunisie', 'Zambie', 'Zimbabwe',
    ],
  },
];

// Liste plate de tous les pays (utile pour le filtrage)
export const ALL_COUNTRIES: string[] = CONTINENTS.flatMap(c => c.pays);