# 9. Notes, limites et recommandations pour le rapport PFE

## 9.1 Fonctionnalit?s r?alis?es

Les fonctionnalit?s suivantes disposent d'une impl?mentation visible dans le d?p?t :

- Authentification JWT et pages de connexion.
- V?rification 2FA c?t? auth.
- Guards Angular et contr?le d'acc?s par r?le.
- Gestion des entreprises, utilisateurs, r?les, d?partements et ?quipes.
- Affectation RH owner, manager et ?quipe selon endpoints disponibles.
- Gestion des employ?s et profils.
- Pointage arriv?e/d?part, historique et pr?sence ?quipe/globale.
- Horaires de travail, mod?les horaires et affectations.
- Cong?s, soldes, validations manager/RH.
- Autorisations, t?l?travail et workflows associ?s.
- Documents RH, demandes, traitement RH et g?n?ration assist?e.
- R?unions et planning RH partiel.
- Dashboards par r?le.
- Notifications et communication interne temps r?el.
- Chatbot AI `/v2/chat` avec agents, ToolRegistry, confirmations et ResponseGuard.
- Commande vocale `/v2/voice` avec STT, TTS optionnel et routage vers les m?mes outils.
- RAG politique RH avec citations obligatoires.
- Observabilit? AI avec health deep, m?triques et Braintrust.

## 9.2 Fonctionnalit?s en cours ou partielles

| Fonctionnalit? | Justification |
|---|---|
| Absences | Pages et services existent, mais le mod?le m?tier para?t int?gr? aux workflows RH plut?t qu'? une entit? d?di?e claire. |
| Heures suppl?mentaires | Entit? `Overtime` pr?sente, exposition fonctionnelle compl?te ? confirmer. |
| Planning RH | Endpoints backend pr?sents, mais certains outils AI ou parcours de cr?ation restent partiels. |
| Audit global | Entit?s audit pr?sentes dans organisation et communication ; exploitation transversale ? consolider. |
| Cr?ation r?union via chatbot | Backend et frontend r?union existent ; ?criture chatbot non confirm?e comme compl?tement c?bl?e. |
| Analytics avanc?es | Plusieurs statistiques existent ; pr?dictif ou analyses avanc?es restent non v?rifi?s. |

## 9.3 Fonctionnalit?s ? compl?ter

| Fonctionnalit? | Motif |
|---|---|
| Recrutement | Aucun module complet v?rifi?. |
| Formation | Aucun module complet v?rifi?. |
| Signature ?lectronique | Non observ?e comme processus op?rationnel complet. |
| Sauvegarde/restauration DB via interface admin | Non expos?e comme fonctionnalit? applicative. |
| Correction manuelle avanc?e du pointage via AI | Aucune endpoint de correction manuelle s?re n'a ?t? v?rifi?e pour l'ex?cution AI directe. |
| Gestion pr?dictive des risques RH | Non impl?ment?e comme module m?tier valid?. |

## 9.4 Recommandations UML

- Conserver les acteurs globaux limit?s aux profils utilisateurs r?els.
- Pr?senter l'IA et la voix dans les diagrammes de classes, s?quences et architecture, mais pas comme acteurs.
- Pour le diagramme de classes global, ?viter de surcharger la figure finale : exporter une version globale synth?tique, puis d?tailler par sprint.
- Utiliser des packages PlantUML pour s?parer Organisation, RH, Pr?sence, Communication et IA/Vocal.
- Ajouter sous chaque diagramme une phrase expliquant ce qu'il couvre et les limites ?ventuelles.

## 9.5 Recommandations LaTeX

- Convertir les grands tableaux du backlog en `longtable` avec colonnes `p{}`.
- D?couper le Product Backlog si n?cessaire par release ou module pour ?viter des pages trop denses.
- Exporter les diagrammes PlantUML en SVG ou PNG haute r?solution.
- Nommer les figures avec une convention stable : `fig:global-usecase`, `fig:global-class`, `fig:sprint1-auth-sequence`.
- Garder les notes de limites dans une sous-section intitul?e ? Synth?se des fonctionnalit?s r?alis?es et limites ?.

## 9.6 Risques de r?daction

- Ne pas pr?senter le chatbot comme d?cideur m?tier : il pr?pare et explique, mais l'autorit? reste le backend.
- Ne pas d?crire comme termin?es les fonctionnalit?s marqu?es `En cours` ou `? compl?ter`.
- Ne pas confondre les entit?s `Notification` du service organisation/RH avec les ?v?nements de communication `CommNotificationEvent`.
- Ne pas confondre `Presence` historique et `AttendanceSession` session de pointage moderne.
- Ne pas pr?senter Redis comme source de v?rit? m?tier : il sert principalement ? l'infrastructure temps r?el/cache.

## 9.7 Conclusion des recommandations

Les ?l?ments g?n?r?s constituent une base robuste pour le chapitre 2 du rapport PFE. Pour la version finale, il est recommand? de relire les tableaux avec l'encadrant, d'ajuster les priorit?s selon les objectifs p?dagogiques du PFE, puis de compiler les diagrammes PlantUML afin de v?rifier leur rendu graphique avant int?gration LaTeX.
