import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../lib/useIsMobile';

type HelpTheme = {
  title: string;
  features: string[];
};

type HelpPage = {
  title: string;
  description: string;
  themes: HelpTheme[];
};

type SearchHit = {
  page: HelpPage;
  theme: HelpTheme;
  score: number;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function computeScore(haystack: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
    if (haystack.startsWith(keyword)) score += 2;
  }
  return score;
}

export default function Help() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const pages = t('help.pages', { returnObjects: true }) as HelpPage[];

  const [query, setQuery] = useState('');
  const [openPages, setOpenPages] = useState<Set<number>>(new Set());
  const [openThemes, setOpenThemes] = useState<Set<string>>(new Set());

  const togglePage = (index: number) => {
    setOpenPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleTheme = (page: HelpPage, theme: HelpTheme, open = !isThemeOpen(page, theme)) => {
    const key = `${page.title}::${theme.title}`;
    setOpenThemes((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
    setOpenPages((prev) => {
      const next = new Set(prev);
      const pageIndex = pages.findIndex((p) => p.title === page.title);
      if (open && pageIndex !== -1) next.add(pageIndex);
      return next;
    });
  };

  function isThemeOpen(page: HelpPage, theme: HelpTheme): boolean {
    return openThemes.has(`${page.title}::${theme.title}`);
  }

  const allThemeKeys = useMemo(
    () =>
      pages.flatMap((page, pageIndex) =>
        page.themes.map((theme) => ({ pageIndex, page, theme, key: `${page.title}::${theme.title}` }))
      ),
    [pages]
  );

  const expandAll = () => {
    setOpenPages(new Set(pages.map((_, index) => index)));
    setOpenThemes(new Set(allThemeKeys.map((item) => item.key)));
  };

  const collapseAll = () => {
    setOpenPages(new Set());
    setOpenThemes(new Set());
  };

  const searchHits = useMemo<SearchHit[]>(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const keywords = normalize(trimmed).split(/\s+/).filter(Boolean);
    const hits: SearchHit[] = [];
    for (const page of pages) {
      for (const theme of page.themes) {
        const pageTitle = normalize(page.title);
        const themeTitle = normalize(theme.title);
        const featuresText = normalize(theme.features.join(' '));
        let score = 0;
        score += computeScore(themeTitle, keywords) * 10;
        score += computeScore(pageTitle, keywords) * 3;
        score += computeScore(featuresText, keywords);
        if (score > 0) hits.push({ page, theme, score });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }, [query, pages]);

  const showSearchResults = query.trim().length >= 2;

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <section style={heroStyle}>
          <h1 style={{ ...titleStyle, fontSize: isMobile ? '26px' : '36px' }}>{t('help.title')}</h1>
          <p style={{ ...subtitleStyle, fontSize: isMobile ? '15px' : '18px' }}>{t('help.subtitle')}</p>
        </section>

        <section style={searchSectionStyle}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('help.searchPlaceholder')}
            style={searchInputStyle}
          />
        </section>

        {showSearchResults ? (
          <section style={{ ...sectionStyle, padding: '15px 20px' }}>
            <h2 style={{ ...sectionTitleStyle, fontSize: isMobile ? '17px' : '20px', marginBottom: '12px' }}>
              {t('help.searchResults')}
            </h2>
            {searchHits.length === 0 ? (
              <p style={textStyle}>{t('help.searchNoResults')}</p>
            ) : (
              searchHits.map((hit) => (
                <button
                  key={`${hit.page.title}::${hit.theme.title}`}
                  onClick={() => toggleTheme(hit.page, hit.theme, !isThemeOpen(hit.page, hit.theme))}
                  style={resultButtonStyle}
                >
                  {isThemeOpen(hit.page, hit.theme) ? '▾ ' : '▸ '}
                  <strong>{hit.theme.title}</strong>
                  <span style={resultPageStyle}> — {hit.page.title}</span>
                  {isThemeOpen(hit.page, hit.theme) && (
                    <ul style={listStyle}>
                      {hit.theme.features.map((feature) => (
                        <li key={feature} style={listItemStyle}>
                          • {feature}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              ))
            )}
          </section>
        ) : (
          <>
            <div style={toolbarStyle}>
              <button onClick={expandAll} style={toolbarButtonStyle}>
                {t('help.expandAll')}
              </button>
              <button onClick={collapseAll} style={toolbarButtonStyle}>
                {t('help.collapseAll')}
              </button>
            </div>

            {pages.map((page, pageIndex) => {
              const isPageOpen = openPages.has(pageIndex);
              return (
                <section key={page.title} style={sectionStyle}>
                  <button onClick={() => togglePage(pageIndex)} style={pageButtonStyle}>
                    <span style={{ ...pageTitleStyle, fontSize: isMobile ? '18px' : '22px' }}>
                      {isPageOpen ? '▾' : '▸'} {page.title}
                    </span>
                    <span style={{ ...pageDescriptionStyle, fontSize: isMobile ? '13px' : '15px' }}>{page.description}</span>
                  </button>
                  {isPageOpen && (
                    <div style={themesContainerStyle}>
                      {page.themes.map((theme) => {
                        const isThemeOpenNow = isThemeOpen(page, theme);
                        return (
                          <div key={theme.title} style={themeBlockStyle}>
                            <button
                              onClick={() => toggleTheme(page, theme)}
                              style={{ ...themeButtonStyle, fontSize: isMobile ? '15px' : '17px' }}
                            >
                              {isThemeOpenNow ? '▾' : '▸'} {theme.title}
                            </button>
                            {isThemeOpenNow && (
                              <ul style={listStyle}>
                                {theme.features.map((feature) => (
                                  <li key={feature} style={listItemStyle}>
                                    • {feature}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
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
  marginBottom: '30px',
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

const searchSectionStyle: CSSProperties = {
  marginBottom: '25px',
};

const searchInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 15px',
  fontSize: '16px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 300,
  border: '1px solid #000',
  borderRadius: '4px',
  backgroundColor: '#fff',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: '10px',
  marginBottom: '20px',
};

const toolbarButtonStyle: CSSProperties = {
  background: '#A6A6A6',
  border: '1px solid #000',
  borderRadius: '4px',
  color: '#000',
  cursor: 'pointer',
  fontSize: '15px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 300,
  padding: '8px 14px',
};

const sectionStyle: CSSProperties = {
  marginBottom: '20px',
  backgroundColor: '#fff',
  border: '1px solid #000',
  borderRadius: '4px',
  padding: '15px 20px',
};

const sectionTitleStyle: CSSProperties = {
  fontWeight: '400',
  color: '#000',
  marginBottom: '15px',
  textAlign: 'left',
};

const pageButtonStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
};

const pageTitleStyle: CSSProperties = {
  fontWeight: '400',
  color: '#000',
};

const pageDescriptionStyle: CSSProperties = {
  fontWeight: '200',
  color: '#444',
};

const themesContainerStyle: CSSProperties = {
  marginTop: '15px',
  borderTop: '1px solid #ddd',
  paddingTop: '10px',
};

const themeBlockStyle: CSSProperties = {
  marginBottom: '10px',
};

const themeButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '6px 0',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 400,
  color: '#000',
};

const resultButtonStyle: CSSProperties = {
  display: 'block',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid #eee',
  padding: '10px 0',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 300,
  color: '#000',
};

const resultPageStyle: CSSProperties = {
  color: '#555',
  fontWeight: 200,
};

const textStyle: CSSProperties = {
  fontWeight: '200',
  color: '#000',
  marginBottom: '10px',
  lineHeight: '1.6',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  padding: '8px 0 4px 10px',
  margin: 0,
};

const listItemStyle: CSSProperties = {
  fontWeight: '200',
  color: '#000',
  marginBottom: '8px',
  lineHeight: '1.5',
};
