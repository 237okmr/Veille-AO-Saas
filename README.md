# Cameroon Marchés Publics - Veille & Alertes AO (SaaS)

Plateforme SaaS intelligente de veille, de scoring IA et de ciblage des appels d'offres publics camerounais (ARMP, DGTCFM, Ministères, Collectivités territoriales décentralisées, Sociétés d'État).

---

## 🚀 Architecture Technique

- **Frontend** : React 19, TypeScript, Tailwind CSS, Lucide Icons, Theme Switcher (Clair / Sombre), Tableaux de bord analytiques.
- **Backend Proxy** : Node.js Express (`server.ts`). Le serveur sert de passerelle sécurisée entre l'interface utilisateur et votre Google Apps Script Web App pour éliminer les contraintes CORS, gérer les redirections 302 de Google, et injecter les jetons d'authentification Bearer.
- **API Distante** : Google Apps Script REST Web App.
- **Mode Sandbox / Simulation Intégré** : Si `API_URL` n'est pas encore définie, l'application active automatiquement son moteur de données simulées riche et réaliste du Cameroun pour permettre une validation visuelle et fonctionnelle instantanée.

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
3. Vous pouvez également cliquer sur le badge **« Mode API / Sandbox »** dans la barre supérieure de l'application pour tester en direct le ping de votre déploiement avec affichage de la latence en millisecondes.

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

## 👥 Comptes de Démonstration Intégrés

Pour tester immédiatement sans saisie manuelle, 2 boutons d'accès rapide sont disponibles sur l'écran d'accueil :

| Rôle | Email | Mot de passe | Description |
| :--- | :--- | :--- | :--- |
| **Administrateur** | `admin@marchespublics.cm` | `admin123` | Supervision globale, gestion clients & users, pipeline scraping ARMP |
| **Client Entreprise** | `client@cameroon-infra.cm` | `client123` | Dashboard, alertes scorées, DAO, profil IA & critères |

---

## 📄 Licence
Propriété exclusive de la plateforme de Veille des Marchés Publics Camerounais.
