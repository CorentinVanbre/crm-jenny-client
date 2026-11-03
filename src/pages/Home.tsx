import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useIsMobile } from '../lib/useIsMobile';

const RECENT_ITEMS_SHOWN = 8;

export default function Home() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const recentItems = (t('help.recentItems', { returnObjects: true }) as string[]).slice(0, RECENT_ITEMS_SHOWN);
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
          <ul style={{ ...textStyle, fontSize: isMobile ? '14px' : '16px', paddingLeft: '20px', lineHeight: 1.6 }}>
            {recentItems.map((item) => (
              <li key={item} style={{ marginBottom: '8px' }}>
                ✅ {item}
              </li>
            ))}
          </ul>
          <p style={{ ...textStyle, fontSize: isMobile ? '13px' : '15px' }}>
            <Link to="/help" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
              {t('home.recentSeeAll')}
            </Link>
          </p>
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
  backgroundColor: 'var(--accent-primary)',
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
  color: 'var(--text-primary)',
};

const subtitleStyle = {
  fontSize: '24px',
  fontWeight: '200',
  color: 'var(--text-primary)',
  marginBottom: '10px',
};

const featuresStyle = {
  marginBottom: '50px',
};

const sectionTitleStyle = {
  fontSize: '28px',
  fontWeight: '400',
  color: 'var(--text-primary)',
  marginBottom: '20px',
};

const textStyle = {
  fontSize: '18px',
  fontWeight: '200',
  color: 'var(--text-primary)',
  marginBottom: '15px',
  lineHeight: '1.6',
};