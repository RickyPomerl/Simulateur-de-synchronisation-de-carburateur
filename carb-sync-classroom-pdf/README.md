
# Simulateur — Version classe (Examen + CSV/PDF)

## Fonctionnalités
- Synchronisation 2/4 carbus, dépressions en kPa / inHg.
- Pannes: prise d'air, durite fendue, vis collée.
- **Mode examen**: verrouillage (4 carbus, kPa, tolérance 1.0 kPa, 1200 tr/min).
- **Exports**: CSV + **PDF** (rapport élève).

## Démarrage local
```bash
npm install
npm run dev
```

## Déploiement Vercel
1. Poussez ce dossier sur **GitHub** (nouveau dépôt).
2. Ouvrez **vercel.com/new** → *Import Git Repository* → sélectionnez le dépôt.
3. Framework: **Vite** (détection auto). Build: `npm run build`. Output: `dist`.
4. **Deploy** → Vercel fournit un **lien public** immédiatement.

---
© 2026-03-05
