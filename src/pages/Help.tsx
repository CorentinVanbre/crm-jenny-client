import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../lib/useIsMobile';

type HelpPage = {
  title: string;
  description: string;
  features: string[];
};

export default function Help() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const pages = t('help.pages', { returnObjects: true }) as HelpPage[];

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <section style={heroStyle}>
          <h1 style={{ ...titleStyle, fontSize: isMobile ? '26px' : '36px' }}>{t('help.title')}</h1>
          <p style={{ ...subtitleStyle, fontSize: isMobile ? '15px' : '18px' }}>{t('help.subtitle')}</p>
        </section>
        {pages.map((page) => (
          <section key={page.title} style={sectionStyle}>
            <h2 style={{ ...sectionTitleStyle, fontSize: isMobile ? '20px' : '24px' }}>{page.title}</h2>
            <p style={{ ...textStyle, fontSize: isMobile ? '15px' : '16px' }}>{page.description}</p>
            <ul style={listStyle}>
              {page.features.map((feature) => (
                <li key={feature} style={{ ...listItemStyle, fontSize: isMobile ? '14px' : '16px' }}>
                  • {feature}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  width: '100%',
  padding: '20px 30px',
  boxSizing: 'border-box',
  backgroundColor: '#E5E5E4',
  minHeight: 'calc(100vh - 180px)',
  display: 'flex',
  justifyContent: 'center',
};

const contentStyle: CSSProperties = {
  maxWidth: '1000px',
  width: '100%',
};

const heroStyle: CSSProperties = {
  textAlign: 'center',
  marginBottom: '40px',
};

const titleStyle: CSSProperties = {
  fontWeight: '200',
  color: '#000',
  marginBottom: '15px',
};

const subtitleStyle: CSSProperties = {
  fontWeight: '200',
  color: '#000',
};

const sectionStyle: CSSProperties = {
  marginBottom: '40px',
  backgroundColor: '#fff',
  border: '1px solid #000',
  borderRadius: '4px',
  padding: '20px 25px',
};

const sectionTitleStyle: CSSProperties = {
  fontWeight: '400',
  color: '#000',
  marginBottom: '15px',
};

const textStyle: CSSProperties = {
  fontWeight: '200',
  color: '#000',
  marginBottom: '15px',
  lineHeight: '1.6',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const listItemStyle: CSSProperties = {
  fontWeight: '200',
  color: '#000',
  marginBottom: '8px',
  lineHeight: '1.5',
};
