import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import el from "./locales/el.json";

const STORAGE_KEY = "app.language";
const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
const initialLng = saved === "el" ? "el" : "en";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, el: { translation: el } },
  lng: initialLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, lng === "el" ? "el" : "en");
  }
});

export default i18n;
