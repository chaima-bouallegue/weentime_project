# WeenTime — Contexte Projet pour AI

## Architecture Globale
Plateforme HR SaaS multi-tenant (Spring Boot + Angular + Python FastAPI)

## Services Backend (Java Spring Boot)
- config-server     → port 8988
- discovery-service → port 8761
- auth-service      → port 8181
- organisation-service → port 8190
- rh-service        → port 8192 (principal)
- presence-service  → port 8193
- communication-service → port 8194
- gateway           → port 8222 (point d'entrée unique)

## AI Service (Python FastAPI)
- ai-service → port 8000
- Gemini Flash API intégrée
- Endpoints : /recruitment/evaluate-cv, /v1/documents/rh/generate-ai

## Frontend (Angular 17+)
- Port : 4200
- Signals + Standalone Components
- Lucide Angular pour les icônes
- WebSocket STOMP sur ws-rh

## Base de données
- PostgreSQL
- Multi-tenant via entreprise_id sur toutes les tables

## Communication inter-services
- Java → Python : HTTP REST via AiService.java (RestTemplate)
- Python → Java : HTTP callback + header X-Internal-Secret
- Temps réel : WebSocket STOMP (/topic/role/rh)

## Modules implémentés
1. Congés — gestion demandes + workflow manager/RH
2. Télétravail — idem
3. Documents RH — workflow 5 étapes avec IA Gemini
   Statuts : DEMANDE_RECUE → EN_REVISION → VALIDE → SIGNE → ENVOYE
4. Recrutement IA — candidatures + scoring Gemini
   Statuts : RECEIVED → AI_ANALYZING → AI_ANALYZED → SHORTLISTED → REJECTED/HIRED
5. Réunions, Structure, Employés, Horaires

## Fichiers clés à connaître
### Java (rh-service)
- DocumentController.java → /api/v1/documents/**
- DocumentServiceImpl.java → logique métier documents
- RecruitmentServiceImpl.java → logique recrutement
- AiService.java → appels vers ai-service Python
- InternalRecruitmentController.java → callback IA sécurisé
- SecurityConfig.java → Spring Security + JWT

### Python (ai-service)
- main.py → routing FastAPI
- recruitment_ia.py → analyse CV Gemini
- app/api/ → tous les endpoints IA

### Angular
- features/rh/documents/ → module documents RH
- features/rh/documents/components/rh-document-editor/ → éditeur full-screen
- features/recrutement/ → dashboard recruteur
- features/recrutement-public/ → page carrières publique
- shared/components/navbar/ → navbar globale

## Variables d'environnement importantes
- GEMINI_API_KEY → clé API Google Gemini
- JAVA_RH_SERVICE_URL → http://localhost:8192 (local)
- INTERNAL_SECRET → secret partagé Java/Python
- spring.mail.host=maildev, port=1025 (dev)

## Conventions de code
- Toutes les requêtes DB filtrent par entreprise_id
- UUIDs pour les IDs exposés publiquement
- Pas de logique métier dans les controllers Java
- Angular : Signals pour le state, pas de NgRx
- Pas de nouvelles dépendances sans validation

## Ce qui est en cours (V2 Documents RH)
1. ~~Fix email après "Envoyer au collaborateur"~~ ✅
2. ~~Audit trail avec timeline visuelle~~ ✅
3. ~~Notifications WebSocket sur changements de statut~~ ✅
4. ~~Drag & Drop Kanban natif HTML5~~ ✅
5. ~~Actions IA contextuelles (Formaliser, Corriger)~~ ✅ (document entier)
6. ~~Preview PDF split-view~~ ✅
7. Signature hybride PNG/canvas — à faire
8. Optimistic UI Kanban — à faire
9. IA sur sélection de texte — à faire
10. Template marque blanche PDF — à faire