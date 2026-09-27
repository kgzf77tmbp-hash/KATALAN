# KATALAN V3 — vraie architecture de plateforme

## Ce qui est inclus
- Frontend KATALAN responsive
- Backend Node.js / Express
- PostgreSQL
- Inscription / connexion avec mot de passe hashé
- Sessions JWT en cookie HTTP-only
- Publication d'annonces avec photo
- Statut de modération `pending / approved / rejected`
- Recherche, catégorie et ville
- Favoris
- Contact WhatsApp
- API d'administration
- Protection des routes utilisateur/admin

## Lancer en local
1. Installer Node.js 18+ et PostgreSQL.
2. Créer une base PostgreSQL.
3. Copier `.env.example` vers `.env` et renseigner `DATABASE_URL` et `JWT_SECRET`.
4. Exécuter `schema.sql` dans PostgreSQL.
5. `npm install`
6. `npm start`
7. Ouvrir http://localhost:3000

## Première connexion admin
Le projet contient les variables ADMIN_EMAIL / ADMIN_PASSWORD comme repères de configuration, mais ne crée volontairement pas un compte administrateur automatiquement.
Créer un utilisateur puis lui attribuer le rôle `admin` directement dans PostgreSQL :
UPDATE users SET role='admin' WHERE email='...';

## Déploiement
Le projet est conçu pour un hébergeur Node + PostgreSQL (Render, Railway, Fly.io, VPS, etc.).
Pour la production, il est recommandé d'utiliser un stockage objet (S3/Cloudinary/Supabase Storage) plutôt que le dossier local `public/uploads`, car certains hébergeurs n'offrent pas de disque persistant.

## Important
Cette archive est prête à être déployée, mais elle n'est pas encore publiée sur un domaine public : les identifiants d'hébergement, base de données et stockage appartiennent au propriétaire du projet et doivent être configurés.
