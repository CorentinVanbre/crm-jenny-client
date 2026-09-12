import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import i18n from '../i18n';

export default function LanguageSync({ children }: { children: ReactNode }) {
  const { i18n: i18nInstance } = useTranslation();

  useEffect(() => {
    const applyLang = (lang?: string) => {
      const lng = lang === 'en' ? 'en' : 'fr';
      i18n.changeLanguage(lng);
      i18nInstance.changeLanguage(lng);
      localStorage.setItem('lang', lng);
    };

    // Au chargement : lire user_metadata
    supabase.auth.getSession().then(({ data: { session } }) => {
      const metaLang = (session?.user?.user_metadata as Record<string, unknown>)?.langue as string | undefined;
      applyLang(metaLang);
    });

    // Au changement de session (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const metaLang = (session?.user?.user_metadata as Record<string, unknown>)?.langue as string | undefined;
      applyLang(metaLang);
    });

    return () => subscription.unsubscribe();
  }, [i18nInstance]);

  return <>{children}</>;
}