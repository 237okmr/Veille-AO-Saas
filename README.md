# Market Advisor CM

Plateforme SaaS intelligente de veille et d'alertes sur les appels d'offres publics camerounais (ARMP, COLEPS, DGTCFM, ministères, mairies, FEICOM et bailleurs internationaux).

---

## 🎨 Design System (Application Connectée)

La charte visuelle et ergonomique de l'espace connecté (administrateur et abonnés) repose sur un socle unifié de jetons et de composants réutilisables.

### 1. Marque Unique & Identité
- **Nom officiel de marque** : `Market Advisor CM` (sans variante textuelle ni désuète).
- **Composant officiel** : `LogoMarketAdvisor` (`src/components/brand/LogoMarketAdvisor.tsx`), disponible en tailles `md` et `sm`, combinant l'emblème radar stylisé, la typographie titre `Plus Jakarta Sans` et la pastille pays `CM`.

### 2. Jetons de Design (`src/index.css`)
- **Couleurs de fond et structure** :
  - `page` (`#F8FAFC`) : fond global de l'application.
  - `surface` (`#FFFFFF`) : fond des cartes, modales et menus.
  - `ligne` (`#E2E8F0`) : bordures douces et séparateurs.
  - `champ` (`#7C8CA3`) : bordure des champs et éléments interactifs au repos.
  - `onglets` (`#F1F5F9`) : état de survol discret et fonds secondaires.
- **Typographie et contrastes** :
  - `encre` (`#0F172A`) : texte principal à fort contraste.
  - `discret` (`#64748B`) : textes secondaires, aides et métadonnées.
  - `font-corps` : police `Inter` pour la lisibilité de lecture.
  - `font-titre` : police `Plus Jakarta Sans` pour les titres et chiffres clés.
- **Teintes d'accent & Alignement Teal** :
  - `teal` / `ok` (`#00695C`) : couleur primaire institutionnelle (alignée sur `teal-700`).
  - `teal-800` (`#004D40`) : nuance profonde pour les états actifs ou contrastés.
  - `ok-fond` (`#E6F4F1`) : fond doux pour badges et sélections actives.
  - `focus` (`#1D6FE0`) : anneau de focus standard (3 px) garantissant l'accessibilité clavier.
  - `emeraude` (`#10B981`) & `cyan` (`#0284C7`) : signaux opérationnels.
  - `erreur` (`#B3261E`) et `erreur-fond` (`#FCEBE9`) : états critiques et suppressions.
- **Rayons & Ombres** :
  - `radius-carte` (`16px`) : boîtes de contenu principales.
  - `radius-champ` (`12px`) : boutons, champs de saisie et listes déroulantes.
  - `radius-pilule` (`9999px`) : badges d'état et filtres rapides.
  - `shadow-hud` : ombre diffuse et aérienne réservée aux conteneurs surélevés.

### 3. Briques Communes (`src/components/ui/`)
- **`Card`** : Conteneur structurant avec fond surface, bordure de ligne et coins arrondis à 16 px.
- **`PageHeader`** : En-tête de page standardisé avec titre sémantique `h2`, description calibrée, badge contextuel et zone d'actions.
- **`KpiCard`** : Indicateur métrique chiffré (`tabular-nums`), avec gestion du chargement et mode bouton interactif accessible.
- **`Button`** : Bouton d'action institutionnel proposant 4 variantes (`primaire`, `secondaire`, `discret`, `danger`) et retour de chargement intégré.
- **`ChampTexte` & `ChampListe`** : Champs de formulaire accessibles liant systématiquement label, aide contextuelle et messages d'erreur.
- **`Badge` & `tonPourStatutAlerte`** : Pastilles d'état en forme de pilule traduisant instantanément le statut des alertes (`ENVOYÉ`, `EN_ATTENTE`, `REPORTÉ`, `EXPIRÉ`, `DOUBLON`).

### 4. Règles Transversales Intangibles
- **Thème clair exclusif** : La plateforme fonctionne uniquement en mode clair pour garantir une lisibilité optimale en milieu professionnel ; aucune classe `dark:` n'est autorisée.
- **Usage strict du bouton latérite** : La couleur latérite (`cta` `#B4451F`) est exclusivement réservée au bouton « Demander un accès pilote » de la page d'accueil et ne doit pas être utilisée dans l'espace connecté.

---

## 🚀 Architecture Technique

- **Frontend** : React 19, TypeScript, Tailwind CSS v4, Lucide Icons, support bilingue (Français / Anglais), radar interactif et tableaux de bord analytiques.
- **Backend Proxy** : Node.js Express (`server.ts`). Le serveur sert de passerelle sécurisée entre l'interface utilisateur et votre Google Apps Script Web App pour éliminer les contraintes CORS, gérer les redirections de Google, et injecter les jetons d'authentification Bearer.
- **API Distante** : Google Apps Script REST Web App.
- **Mode Sandbox / Simulation Intégré** : Si `API_URL` n'est pas encore définie, l'application active automatiquement son moteur de données simulées riche et réaliste du Cameroun pour permettre une validation visuelle et fonctionnelle instantanée.

---

## 📊 Supervision des Alertes Clients (Administrateur)

La plateforme propose un module complet de gestion et de consultation des alertes attribuées aux entreprises clientes :

- **Accès & Navigation** : Accessible directement depuis le menu latéral **« Alertes clients »** ainsi que par un clic sur la carte KPI **« Alertes Ciblées »** du tableau de bord d'administration.
- **Consultation par Entreprise** : Sélection séquentielle d'un client dans la liste alphabétique afin de préserver les quotas d'exécution du backend.
- **Filtres Avancés & Fiables** : Filtrage combiné par recherche textuelle (titre, avis, maître d'ouvrage), par statut de transmission (`ENVOYÉ`, `EN_ATTENTE`, `REPORTÉ`, `EXPIRÉ`, `DOUBLON`) et par seuil de score sémantique (≥ 3.0 à ≥ 4.5).
- **Exportation CSV Excel (FR)** : Téléchargement direct d'un fichier CSV formaté pour Excel en français (séparateur point-virgule, encodage UTF-8 BOM, dates/heures au fuseau horaire `Africa/Douala` UTC+1, et protection contre l'injection de formules). L'export est séquentiel et plafonné à 5 000 lignes avec possibilité d'annulation en cours d'exécution.
- **Évolutions futures (Backlog)** : Une vue consolidée de tous les clients simultanément ainsi qu'une page dédiée aux « Avis collectés » nécessiteront de nouvelles routes d'agrégation côté Google Apps Script, qui seront validées séparément.

---

## ⚙️ 1. Configuration de la Variable d'Environnement `API_URL`

### Dans Google AI Studio (Secrets / Environment)
1. Ouvrez le panneau **Settings** ou **Secrets** dans Google AI Studio.
2. Ajoutez la variable d'environnement :
   ```env
   API_URL="https://script.google.com/macros/s/AKfycb...VOTRE_DEPLOYMENT_ID.../exec"
   ```
3. L'application rechargera automatiquement la cible du proxy.

### En Local (`.env`)
Créez un fichier `.env` à la racine (en copiant `.env.example`) :
```env
API_URL="https://script.google.com/macros/s/VOTRE_DEPLOYMENT_ID/exec"
PORT=3000
```

---

## 🔄 2. Basculement entre API PROD et API TEST

Pour alterner entre votre déploiement de **Production** et votre déploiement de **Test (HEAD ou staging)** dans Google Apps Script :

1. **Version Production** (Version figée / déploiement stable) :
   ```env
   API_URL="https://script.google.com/macros/s/AKfycb...PROD_ID.../exec"
   ```
2. **Version Test** (Dernière version du code testée en continu) :
   ```env
   API_URL="https://script.google.com/macros/s/AKfycb...DEV_TEST_ID.../exec"
   ```

---

## 🚀 3. Publication sur Cloud Run

1. Vérifiez que la compilation fonctionne sans erreur :
   ```bash
   npm run build
   ```
2. Dans Google AI Studio, cliquez sur le bouton **« Publish »** (ou **« Déployer »**).
3. AI Studio va automatiquement :
   - Construire le bundle frontend dans le répertoire `dist/`.
   - Lancer le serveur de production Express via `tsx server.ts` sur le port 3000.
   - Injecter les variables d'environnement configurées (`API_URL`, `APP_URL`).
4. Votre application SaaS sera immédiatement accessible sur son URL Cloud Run sécurisée en HTTPS.

---

## 📄 Licence
Propriété exclusive de la plateforme Market Advisor CM.
