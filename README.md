# Market Advisor CM

Plateforme SaaS intelligente de veille et d'alertes sur les appels d'offres publics camerounais (ARMP, COLEPS, DGTCFM, ministères, mairies, FEICOM et bailleurs internationaux).

---

## 🚀 Architecture Technique

- **Frontend** : React 19, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons, support bilingue (Français / Anglais), radar interactif et tableaux de bord analytiques.
- **Backend Proxy** : Node.js Express (`server.ts`). Le serveur sert de passerelle sécurisée entre l'interface utilisateur et votre Google Apps Script Web App pour éliminer les contraintes CORS, gérer les redirections de Google, et injecter les jetons d'authentification Bearer.
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
