# Chapitre 2 / Sprint 0 ? WEENTIME

## Objectif du dossier

Ce dossier contient les ?l?ments r?dig?s pour le chapitre 2 du rapport PFE WEENTIME, centr? sur le Sprint 0 : analyse, sp?cification des besoins, pilotage Scrum, backlog, planification et mod?lisation UML globale et par sprint.

Les contenus sont r?dig?s en fran?ais acad?mique et structur?s pour ?tre repris ensuite dans LaTeX. Les diagrammes sont fournis sous forme de blocs PlantUML compilables.

## Ordre d'int?gration recommand?

1. `01_analyse_synthetique_projet.md`
2. `02_product_backlog_weentime.md`
3. `03_planification_sprints.md`
4. `04_sprint_backlogs.md`
5. `05_uml_global.md`
6. `06_uml_par_sprint.md`
7. `07_texte_academique_chapitre2.md`
8. `08_environnement_developpement.md`
9. `09_notes_limites_recommandations.md`

## Sources d'analyse utilis?es

- D?p?t local : `C:\Users\DELL\Documents\GitHub\weentime_project`
- Cartographie backend existante : `BACKEND_AI_MAP.md`
- Cartographie frontend existante : `FRONTEND_CONTEXT_MAP.md`
- Audit AI/service : `CLEANUP_REPORT.md`, `AI_SERVICE_IMPLEMENTATION_PLAN.md`
- R?f?rence de planification : `C:\Users\DELL\Downloads\Planification.pdf`
- R?f?rence de style LaTeX : `C:\Users\DELL\Downloads\pfe_2024_raja.zip`, notamment `chap2.tex`

## Convention de statut

- `R?alis?` : fonctionnalit? pr?sente dans le code applicatif, les routes, les services, les entit?s, les composants frontend ou les outils AI.
- `En cours` : fonctionnalit? pr?sente partiellement, ou pr?sente c?t? backend mais non compl?tement c?bl?e c?t? frontend/AI.
- `? compl?ter` : fonctionnalit? attendue mais absente, exp?rimentale, non connect?e ou non v?rifi?e.

## R?gles UML appliqu?es

- Les acteurs sont uniquement des utilisateurs externes : Administrateur, Responsable RH, Manager, Employ?.
- L'Assistant IA, le module vocal, FastAPI, Whisper, Ollama, Redis et les microservices sont mod?lis?s comme composants internes, jamais comme acteurs.
- Les classes du diagramme global reprennent les noms des entit?s et composants r?els observ?s dans le d?p?t.

## Remarques d'int?gration LaTeX

- Les tableaux Markdown peuvent ?tre convertis en `tabularx` ou `longtable`.
- Les blocs PlantUML peuvent ?tre export?s en PNG/SVG puis inclus avec `\includegraphics`.
- Pour les grands tableaux de backlog, `longtable` est recommand?.
- Pour conserver le style PFE, placer les diagrammes apr?s l'explication textuelle de chaque section.
