export default function Home() {
  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <section style={heroStyle}>
          <h1 style={titleStyle}>Bienvenue sur <span style={jennyStyle}>JENNY</span></h1>
          <p style={subtitleStyle}>
            Votre partenaire essentiel pour optimiser la performance commerciale.
          </p>
        </section>

        <section style={featuresStyle}>
          <h2 style={sectionTitleStyle}>Organisez, planifiez, performez</h2>
          <p style={textStyle}>
            Structurez vos tâches, priorisez vos actions et planifiez vos visites de manière efficace.
          </p>
          <p style={textStyle}>
            <span style={jennyStyle}>JENNY</span> vous accompagne 24h/24 et 7j/7 pour rester concentré, organisé et toujours un coup d'avance.
          </p>
        </section>

        <section style={featuresStyle}>
          <h2 style={sectionTitleStyle}>Fonctionnalités ajoutées récement :</h2>
          <ul style={listStyle}>
            <li>✅ Version mobile optimisée et simplifiée</li>
            <li>✅ Désactivation des contacts (ex: départ d'une entreprise)</li>
            <li>✅ Compte des contacts par site</li>
            <li>✅ Historique des dernières visites pour chaque site</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

// Styles adaptés
const jennyStyle = {
  fontWeight: 'bold',
  fontStyle: 'italic',
};

// Espace réduit de moitié entre le header et le contenu
const containerStyle = {
  width: '100%',
  padding: '20px 30px', // ✅ Réduit de 40px à 20px (moitié)
  boxSizing: 'border-box',
  backgroundColor: '#E5E5E4',
  minHeight: 'calc(100vh - 180px)',
  display: 'flex',
  justifyContent: 'center',
};

const contentStyle = {
  maxWidth: '1000px',
  width: '100%',
};

const heroStyle = {
  textAlign: 'center',
  marginBottom: '40px',
};

const titleStyle = {
  fontSize: '48px',
  fontWeight: '200',
  marginBottom: '15px',
  color: '#000',
};

const subtitleStyle = {
  fontSize: '24px',
  fontWeight: '200',
  color: '#000',
  marginBottom: '10px',
};

const featuresStyle = {
  marginBottom: '50px',
};

const sectionTitleStyle = {
  fontSize: '28px',
  fontWeight: '400',
  color: '#000',
  marginBottom: '20px',
};

const textStyle = {
  fontSize: '18px',
  fontWeight: '200',
  color: '#000',
  marginBottom: '15px',
  lineHeight: '1.6',
};

const listStyle = {
  listStyle: 'none',
  padding: '0',
  fontSize: '18px',
  fontWeight: '200',
  color: '#000',
};