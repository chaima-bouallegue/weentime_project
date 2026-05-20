# 7. Texte acad?mique ? Chapitre 2 : Sprint 0, analyse et sp?cification des besoins

## Introduction du chapitre

Ce chapitre pr?sente le Sprint 0 du projet WEENTIME. Cette phase constitue une ?tape d?terminante dans le cycle de d?veloppement, car elle permet de transformer une id?e g?n?rale en un ensemble coh?rent de besoins, de contraintes, de choix techniques et de livrables planifi?s. Elle vise ? clarifier le p?rim?tre fonctionnel de la plateforme, ? identifier les acteurs qui interagissent avec le syst?me, ? formaliser le Product Backlog et ? pr?parer une planification Scrum adapt?e ? la complexit? r?elle du projet.

Dans le cadre de WEENTIME, l'analyse ne se limite pas ? une description th?orique des fonctionnalit?s attendues. Elle s'appuie ?galement sur l'inspection de l'architecture logicielle existante : une application frontend Angular, plusieurs microservices Spring Boot, un service d'intelligence artificielle bas? sur FastAPI, ainsi qu'une infrastructure compos?e notamment de PostgreSQL, Redis, Spring Cloud Gateway et Eureka. Cette d?marche permet de produire une sp?cification fid?le au syst?me r?alis?, tout en distinguant les fonctionnalit?s finalis?es, les fonctionnalit?s partiellement impl?ment?es et celles qui restent ? compl?ter.

## Sp?cification des besoins

La sp?cification des besoins consiste ? identifier les services attendus par les utilisateurs et les contraintes auxquelles la plateforme doit r?pondre. WEENTIME se positionne comme une solution de gestion RH et de suivi du temps orient?e entreprise. Elle couvre les besoins d'administration, de structuration organisationnelle, de gestion des collaborateurs, de pointage, de demandes RH, de validations hi?rarchiques, de communication interne et d'assistance intelligente.

Les besoins ont ?t? regroup?s en deux cat?gories : les besoins fonctionnels, qui d?crivent les actions offertes aux utilisateurs, et les besoins non fonctionnels, qui d?crivent les qualit?s attendues du syst?me telles que la s?curit?, la disponibilit?, la maintenabilit? et la tra?abilit?.

## Identification des acteurs

Les acteurs de WEENTIME correspondent aux profils utilisateurs r?els amen?s ? interagir avec la plateforme. Les composants techniques internes, tels que le module IA ou le module vocal, ne sont pas consid?r?s comme des acteurs UML, car ils n'initient pas de besoin m?tier de mani?re autonome.

| Acteur | Description |
|---|---|
| Administrateur | Il administre la plateforme, les entreprises, les utilisateurs, les r?les, les affectations RH et les diagnostics syst?me. |
| Responsable RH | Il pilote les processus RH : employ?s, d?partements, ?quipes, cong?s, t?l?travail, autorisations, documents, horaires et pr?sence globale. |
| Manager | Il supervise son ?quipe, consulte la pr?sence, traite les demandes qui lui sont assign?es et suit les indicateurs op?rationnels. |
| Employ? | Il utilise son espace personnel pour pointer, demander un cong?, consulter ses soldes, demander un document, communiquer et interagir avec l'assistant. |

## Besoins fonctionnels

Les besoins fonctionnels principaux de WEENTIME sont les suivants :

- Authentifier les utilisateurs et s?curiser les acc?s par JWT.
- G?rer les r?les et les autorisations selon le profil utilisateur.
- Administrer les entreprises, les utilisateurs, les responsables RH et les affectations.
- Structurer l'organisation en d?partements et ?quipes.
- G?rer les employ?s, managers et rattachements organisationnels.
- Enregistrer et consulter le pointage d'arriv?e et de d?part.
- Configurer les horaires de travail et leurs affectations.
- Soumettre, suivre, valider ou refuser des demandes de cong?.
- Consulter et administrer les soldes de cong?s.
- G?rer les absences, autorisations et demandes de t?l?travail.
- Demander, g?n?rer, t?l?charger et traiter les documents RH.
- Consulter les tableaux de bord propres ? chaque r?le.
- Recevoir des notifications et communiquer via la messagerie interne.
- Interagir avec un assistant IA textuel et vocal, sans lui donner d'autorit? m?tier directe.
- Poser des questions sur les politiques RH ? travers un module RAG avec citations.

## Besoins non fonctionnels

WEENTIME doit respecter plusieurs exigences non fonctionnelles essentielles :

- S?curit? : authentification JWT, contr?le d'acc?s par r?le, non-exposition des secrets, validation des actions sensibles.
- Tra?abilit? : audit des actions importantes, journaux applicatifs et observabilit? AI.
- Maintenabilit? : s?paration claire entre frontend, microservices m?tier et service AI.
- Disponibilit? : architecture distribu?e avec gateway et d?couverte de services.
- Scalabilit? : d?coupage par microservices et usage de Redis pour le temps r?el.
- Fiabilit? m?tier : aucune action critique ne doit ?tre ex?cut?e par l'IA sans confirmation et validation backend.
- Multilinguisme : prise en charge des ?changes en fran?ais, anglais, arabe et tunisien/franco-arabe pour le chatbot et la voix.
- Qualit? des r?ponses IA : les r?ponses doivent ?tre s?res, cit?es lorsqu'elles proviennent de la base documentaire, et filtr?es par ResponseGuard.

## Pilotage du projet avec SCRUM

Le projet est pilot? selon la m?thodologie Scrum. Ce choix se justifie par la diversit? des modules ? d?velopper, l'?volution progressive des besoins et la n?cessit? de livrer des incr?ments fonctionnels coh?rents. Chaque sprint regroupe un ensemble de user stories li?es par une valeur m?tier commune.

Le Sprint 0 est consacr? ? l'analyse et ? la planification. Il permet d'?tablir le Product Backlog, de d?finir les priorit?s, d'estimer les complexit?s et de pr?parer les diagrammes UML. Les sprints suivants visent successivement la s?curit?, l'organisation, les processus RH, la communication, puis l'assistance intelligente.

## ?quipe Scrum

| R?le Scrum | Membre |
|---|---|
| Product Owner | Mme Imen Chikha |
| Scrum Master | Mme Ferihane Kboubi |
| Scrum Team | Essia Sannen |

## Product Backlog

Le Product Backlog de WEENTIME regroupe les fonctionnalit?s attendues de la plateforme. Les user stories sont class?es selon leur priorit? et leur complexit?. Leur statut est ?valu? ? partir de l'analyse du d?p?t : une fonctionnalit? est marqu?e `R?alis?` lorsqu'elle est pr?sente dans le code, `En cours` lorsqu'elle est partiellement impl?ment?e, et `? compl?ter` lorsqu'elle n'est pas encore disponible ou non v?rifi?e.

## Planification des sprints

La planification propos?e d?coupe le projet en six sprints. Le Sprint 0 couvre l'analyse. Le Sprint 1 ?tablit les fondations de s?curit? et d'organisation. Le Sprint 2 traite la structure RH, le pointage et les horaires. Le Sprint 3 se concentre sur les demandes RH et les validations. Le Sprint 4 apporte les dashboards, notifications et communications. Enfin, le Sprint 5 introduit l'assistant IA textuel et vocal, le multilinguisme et l'observabilit?.

## Environnement de d?veloppement

L'environnement de d?veloppement combine des outils adapt?s au d?veloppement web, aux microservices et ? l'intelligence artificielle. Le frontend repose sur Angular et Node.js. Le backend utilise Java 17, Spring Boot, Spring Cloud, PostgreSQL et Redis. Le service AI s'appuie sur Python, FastAPI, faster-whisper, ChromaDB et Ollama. Les outils Git, GitHub, Docker, Postman, PlantUML et LaTeX accompagnent le cycle de d?veloppement et de documentation.

## Architecture logicielle du projet

WEENTIME adopte une architecture multi-couches distribu?e. L'utilisateur interagit avec une interface Angular. Les requ?tes transitent par Spring Cloud Gateway, qui route vers les microservices sp?cialis?s. Les donn?es m?tier sont persist?es dans PostgreSQL. Redis intervient pour certains m?canismes temps r?el, de cache ou d'?v?nements. Le service AI FastAPI communique avec le backend via des outils contr?l?s et ne modifie pas directement la base de donn?es.

Cette architecture favorise la s?paration des responsabilit?s. Les microservices Spring Boot conservent l'autorit? m?tier, tandis que le service AI agit comme une couche d'assistance, de routage conversationnel et de reformulation. Les actions sensibles, notamment les validations, cr?ations et modifications, passent par un m?canisme de confirmation avant ex?cution.

## Conclusion du chapitre

Ce chapitre a permis de pr?senter les fondations analytiques du projet WEENTIME. L'?tude du d?p?t et des modules existants a mis en ?vidence une plateforme riche, couvrant l'administration, la gestion RH, le pointage, les demandes, les validations, la communication et l'assistance intelligente. La planification Scrum propos?e structure ces fonctionnalit?s en incr?ments coh?rents et exploitables. Les diagrammes UML globaux et par sprint fournissent une vision claire du syst?me et serviront de base aux chapitres de conception et de r?alisation.
