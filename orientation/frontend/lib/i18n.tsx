"use client";

// Interface prête pour l'arabe (RTL) et l'anglais. Au MVP, les contenus du
// référentiel sont en français ; seuls les libellés d'interface sont traduits.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useStorageValue, writeStorage } from "./store";

export type Locale = "fr" | "ar" | "en";

const DICT: Record<Locale, Record<string, string>> = {
  fr: {
    appName: "Orientation 4.0",
    tagline: "Construis ton projet d'orientation, pas à pas.",
    login: "Se connecter",
    logout: "Se déconnecter",
    email: "Adresse e-mail",
    password: "Mot de passe",
    home: "Accueil",
    explorer: "Explorer",
    help: "Aide",
    myPaths: "Mes pistes",
    simulator: "Simulateur",
    wishes: "Mes vœux",
    notebook: "Carnet",
    sharing: "Partage",
    start: "Commencer",
    next: "Suivant",
    back: "Retour",
    save: "Enregistrer",
    demoBanner: "Démonstration locale — données et établissements fictifs, indicateurs à valider par le comité scientifique.",
    dyslexia: "Lecture facilitée",
  },
  ar: {
    appName: "التوجيه 4.0",
    tagline: "ابنِ مشروعك الدراسي والمهني خطوة بخطوة.",
    login: "تسجيل الدخول",
    logout: "تسجيل الخروج",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    home: "الرئيسية",
    explorer: "استكشاف",
    help: "مساعدة",
    myPaths: "مساراتي",
    simulator: "المحاكي",
    wishes: "اختياراتي",
    notebook: "الدفتر",
    sharing: "المشاركة",
    start: "ابدأ",
    next: "التالي",
    back: "رجوع",
    save: "حفظ",
    demoBanner: "عرض تجريبي محلي — بيانات ومؤسسات وهمية، والمؤشرات في انتظار مصادقة اللجنة العلمية.",
    dyslexia: "قراءة ميسرة",
  },
  en: {
    appName: "Orientation 4.0",
    tagline: "Build your study and career plan, step by step.",
    login: "Log in",
    logout: "Log out",
    email: "Email",
    password: "Password",
    home: "Home",
    explorer: "Explore",
    help: "Help",
    myPaths: "My paths",
    simulator: "Simulator",
    wishes: "My choices",
    notebook: "Notebook",
    sharing: "Sharing",
    start: "Start",
    next: "Next",
    back: "Back",
    save: "Save",
    demoBanner: "Local demo — fictitious data and schools, indicators pending scientific committee validation.",
    dyslexia: "Easy reading",
  },
};

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (k: string) => string;
  dyslexia: boolean;
  setDyslexia: (v: boolean) => void;
}

const I18nContext = createContext<Ctx>({ locale: "fr", setLocale: () => {}, t: (k) => k, dyslexia: false, setDyslexia: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const storedLocale = useStorageValue("orientation.locale");
  const locale: Locale = storedLocale && storedLocale in DICT ? (storedLocale as Locale) : "fr";
  const dyslexia = useStorageValue("orientation.dyslexia") === "1";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    document.documentElement.classList.toggle("dyslexia", dyslexia);
  }, [dyslexia]);

  const setLocale = (l: Locale) => writeStorage("orientation.locale", l);
  const setDyslexia = (v: boolean) => writeStorage("orientation.dyslexia", v ? "1" : "0");
  const t = (k: string) => DICT[locale][k] ?? DICT.fr[k] ?? k;
  return <I18nContext.Provider value={{ locale, setLocale, t, dyslexia, setDyslexia }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
