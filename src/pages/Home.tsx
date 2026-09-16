import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../lib/useIsMobile';

export default function Home() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <section style={heroStyle}>
          <h1 style={{ ...titleStyle, fontSize: isMobile ? '30px' : '48px' }}>{t('home.welcome')} <span style={jennyStyle}>JENNY</span></h1>
          <p style={{ ...subtitleStyle, fontSize: isMobile ? '18px' : '24px' }}>
            {t('home.subtitle')}
          </p>
        </section>

        <section style={featuresStyle}>
          <h2 style={{ ...sectionTitleStyle, fontSize: isMobile ? '22px' : '28px' }}>{t('home.organizeTitle')}</h2>
          <p style={{ ...textStyle, fontSize: isMobile ? '15px' : '18px' }}>
            {t('home.organizeText1')}
          </p>
          <p style={{ ...textStyle, fontSize: isMobile ? '15px' : '18px' }}>
            <span style={jennyStyle}>JENNY</span> {t('home.organizeText2')}
          </p>
        </section>

        <section style={featuresStyle}>
          <h2 style={{ ...sectionTitleStyle, fontSize: isMobile ? '22px' : '28px' }}>{t('home.recentTitle')}</h2>
          <ul style={{ ...listStyle, fontSize: isMobile ? '15px' : '18px' }}>
            {(t('home.recentItems', { returnObjects: true }) as string[]).map((item) => (
              <li key={item}>✅ {item}</li>
            ))}
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
  padding: '20px 30px',
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