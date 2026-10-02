# Market Advisor CM

Plateforme SaaS intelligente de veille et d'alertes sur les appels d'offres publics camerounais (ARMP, COLEPS, DGTCFM, ministères, mairies, FEICOM et bailleurs internationaux).

---

## 🎨 Design System & Ergonomie

La charte visuelle et ergonomique de l'espace connecté (administrateur et abonnés) repose sur un socle unifié de jetons et de composants réutilisables.

### 1. Marque Unique & Identité
- **Nom officiel de marque** : `Market Advisor CM`.
- **Composant officiel** : `LogoMarketAdvisor` (`src/components/brand/LogoMarketAdvisor.tsx`), combinant l'emblème radar stylisé, la typographie titre `Plus Jakarta Sans` et la pastille pays `CM`.

### 2. Jetons de Design (`src/index.css`)
- **Fonds et structure** : `page` (`#F8FAFC`), `surface` (`#FFFFFF`), `ligne` (`#E2E8F0`), `champ` (`#7C8CA3`), `onglets` (`#F1F5F9`).
- **Typographie et contrastes** : `encre` (`#0F172A`), `discret` (`#64748B`), police `Inter` (corps), police `Plus Jakarta Sans` (titres et chiffres clés).
- **Teintes d'accent & Alignement Teal** : `teal` / `ok` (`#00695C`), `teal-800` (`#004D40`), `ok-fond` (`#E6F4F1`), `focus` (`#1D6FE0`), `emeraude` (`#10B981`), `cyan` (`#0284C7`), `erreur` (`#B3261E`), `erreur-fond` (`#FCEBE9`).
- **Rayons & Ombres** : `radius-carte` (`16px`), `radius-champ` (`12px`), `radius-pilule` (`9999px`), `shadow-hud`.

### 3. Règle Transversale Intangible
- **Thème clair uniquement** : La plateforme fonctionne exclusivement en thème clair pour garantir une lisibilité optimale en contexte professionnel. Aucun mode sombre ni sélecteur de thème n'est supporté ; aucune classe `dark:` n'est autorisée.

---

## 🚀 Architecture Technique

- **Frontend** : React 19, TypeScript, Tailwind CSS v4, Lucide Icons, support bilingue (Français / Anglais), radar interactif et tableaux de bord analytiques.
- **Backend Proxy** : Node.js Express (`server.ts`). Le serveur sert de passerelle sécurisée entre l'interface utilisateur et votre Web App Google Apps Script pour éliminer les contraintes CORS, gérer les redirections 302 de Google, et injecter les jetons d'authentification Bearer.
- **API Distante & Base de Données** : Google Apps Script REST Web App connectée au Google Sheets de production.
- **Gestion de l'indisponibilité** : Lorsque la variable `API_URL` n'est pas configurée, les routes API de données répondent HTTP 503 (Service momentanément indisponible) afin d'assurer une totale honnêteté vis-à-vis des données réelles de production.

---

## ⚙️ Configuration des Variables d'Environnement

Le proxy Express s'appuie sur deux variables d'environnement principales :

### 1. `API_URL` (Obligatoire pour les données réelles)
URL d'exécution de la Web App Google Apps Script de production ou de test.

```env
API_URL="https://script.google.com/macros/s/AKfycb...VOTRE_DEPLOYMENT_ID.../exec"
```

### 2. `PROXY_SHARED_SECRET` (Facultatif / Recommandé)
Secret partagé transmis par le proxy pour sécuriser et authentifier les échanges avec le script Google Apps Script distant (`PropertiesService.getScriptProperties()`).

```env
PROXY_SHARED_SECRET="VOTRE_SECRET_PARTAGE"
```

### Exemple de fichier `.env` local :
```env
PORT=3000
API_URL="https://script.google.com/macros/s/AKfycb...VOTRE_DEPLOYMENT_ID.../exec"
PROXY_SHARED_SECRET="VOTRE_SECRET_PARTAGE"
```

---

## 📊 Modules Applicatifs

- **Radar Public & Accueil** : Surveillance interactive des marchés avec points pleins (montants chiffrés) et points creux (sans montant), calcul des échéances au fuseau `Africa/Douala` (UTC+1).
- **Avis Collectés (Admin)** : Consultation exhaustive en lecture seule des avis collectés sur les plateformes nationales et internationales avec filtrage multi-critères, facettes dynamiques et pagination.
- **Alertes Clients** : Gestion et suivi des notifications générées par le moteur de scoring IA, paramétrage des seuils de pertinence et exportations CSV conformes.
- **Supervision & Diagnostic** : Outil intégré de diagnostic réseau testant les maillons de communication avec Google Apps Script.

---

## 📄 Licence
Propriété exclusive de la plateforme Market Advisor CM.
