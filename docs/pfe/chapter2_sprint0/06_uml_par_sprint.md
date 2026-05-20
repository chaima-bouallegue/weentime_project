# 6. Diagrammes UML par sprint ? WEENTIME

## Sprint 0 ? Analyse et sp?cification

### Cas d'utilisation ? Sprint 0

```plantuml
@startuml sprint0_use_case
left to right direction
actor "Product Owner" as PO
actor "Scrum Master" as SM
actor "Scrum Team" as Team
rectangle "Sprint 0 - Cadrage WEENTIME" {
  usecase "Identifier acteurs" as UC1
  usecase "Sp?cifier besoins" as UC2
  usecase "Construire Product Backlog" as UC3
  usecase "Planifier sprints" as UC4
  usecase "Mod?liser UML" as UC5
}
PO --> UC1
PO --> UC2
PO --> UC3
SM --> UC4
Team --> UC2
Team --> UC5
@enduml
```

### Classes ? Sprint 0

```plantuml
@startuml sprint0_class
skinparam packageStyle rectangle
title Sprint 0 - Aucun mod?le persistant introduit
note "Le Sprint 0 correspond ? l'analyse, la sp?cification et la planification.
Il ne cr?e pas d'entit? applicative persistante dans le code WEENTIME.
Les classes m?tier r?elles apparaissent ? partir du Sprint 1." as Sprint0Note
@enduml
```

### S?quence ? Analyse du besoin

```plantuml
@startuml sprint0_seq_besoin
actor "Product Owner" as PO
participant "Scrum Master" as SM
participant "Scrum Team" as Team
participant "D?p?t WEENTIME" as Repo
PO -> SM : Pr?senter vision m?tier
SM -> Team : Organiser atelier d'analyse
Team -> Repo : Inspecter frontend/backend/AI
Repo --> Team : Modules, entit?s, routes, services
Team -> SM : Restituer p?rim?tre fonctionnel
SM -> PO : Valider besoins prioritaires
@enduml
```

### S?quence ? Construction du backlog

```plantuml
@startuml sprint0_seq_backlog
actor "Product Owner" as PO
participant "Scrum Team" as Team
participant "Product Backlog" as Backlog
Team -> Backlog : Cr?er user stories
Team -> Backlog : Affecter priorit? et complexit?
PO -> Backlog : V?rifier valeur m?tier
Backlog --> PO : Backlog prioris?
PO -> Team : Valider planification initiale
@enduml
```

### Activit? ? Sprint 0

```plantuml
@startuml sprint0_activity
start
:?tudier le contexte WEENTIME;
:Identifier acteurs et besoins;
:Analyser le d?p?t existant;
:Construire Product Backlog;
:Planifier les sprints;
:Produire diagrammes UML;
:Valider coh?rence avec le code r?el;
stop
@enduml
```

## Sprint 1 ? Authentification, r?les et organisation

### Cas d'utilisation ? Sprint 1

```plantuml
@startuml sprint1_use_case
left to right direction
actor "Administrateur" as Admin
actor "Responsable RH" as RH
actor "Employ?" as Employe
rectangle "WEENTIME - Sprint 1" {
  usecase "S'authentifier" as Auth
  usecase "V?rifier 2FA" as TwoFA
  usecase "G?rer entreprises" as Ent
  usecase "G?rer utilisateurs" as Users
  usecase "Attribuer r?les" as Roles
  usecase "Affecter RH ? entreprise" as RhOwner
  usecase "G?rer son profil" as Profile
}
Employe --> Auth
Employe --> Profile
Admin --> Ent
Admin --> Users
Admin --> Roles
Admin --> RhOwner
RH --> Profile
TwoFA ..> Auth : <<extend>>
Ent ..> Auth : <<include>>
Users ..> Auth : <<include>>
Roles ..> Auth : <<include>>
RhOwner ..> Auth : <<include>>
Profile ..> Auth : <<include>>
@enduml
```

### Classes ? Sprint 1

```plantuml
@startuml sprint1_class
class Utilisateur {
  +id : Long
  +nom : String
  +prenom : String
  +email : String
  +motDePasse : String
  +statut : StatutUtilisateurEnum
}
class Role {
  +id : Long
  +nom : RoleNom
  +description : String
}
class Entreprise {
  +id : Long
  +nom : String
  +email : String
  +telephone : String
  +codeInvitation : String
}
class Token {
  +id : Long
  +token : String
  +dateExpiration : LocalDateTime
  +dateValidation : LocalTime
}
class UserAuditLog {
  +id : Long
  +action : String
  +performedBy : String
  +targetUser : String
}
Entreprise "1" -- "0..*" Utilisateur
Utilisateur "*" -- "*" Role
Utilisateur "1" -- "0..*" Token
Utilisateur "1" -- "0..*" UserAuditLog
@enduml
```

### S?quence ? Authentification JWT

```plantuml
@startuml sprint1_seq_auth
actor "Utilisateur" as User
participant "Angular LoginComponent" as UI
participant "AuthService Angular" as AuthNg
participant "Gateway" as Gateway
participant "auth-service" as AuthSvc
participant "JWT Provider" as JWT
User -> UI : Saisir email/mot de passe
UI -> AuthNg : login(credentials)
AuthNg -> Gateway : POST /auth/login
Gateway -> AuthSvc : Router requ?te
AuthSvc -> JWT : G?n?rer token
JWT --> AuthSvc : JWT sign?
AuthSvc --> Gateway : JwtResponse
Gateway --> AuthNg : Token + profil
AuthNg --> UI : Stocker session
UI --> User : Redirection dashboard
@enduml
```

### S?quence ? Cr?ation utilisateur et r?le

```plantuml
@startuml sprint1_seq_user_role
actor "Administrateur" as Admin
participant "Admin Users Page" as UI
participant "OrganisationService Angular" as NgSvc
participant "Gateway" as Gateway
participant "organisation-service" as OrgSvc
participant "UtilisateurRepository" as Repo
Admin -> UI : Cr?er utilisateur
UI -> NgSvc : submit(UserManagementRequest)
NgSvc -> Gateway : POST /organisations/users
Gateway -> OrgSvc : Transmettre avec JWT
OrgSvc -> Repo : save(Utilisateur)
Repo --> OrgSvc : Utilisateur cr??
OrgSvc --> UI : UtilisateurResponse
UI --> Admin : Confirmation de cr?ation
@enduml
```

### Activit? ? Connexion s?curis?e

```plantuml
@startuml sprint1_activity_login
start
:Saisir identifiants;
:Envoyer requ?te de login;
if (Identifiants valides ?) then (oui)
  if (2FA activ?e ?) then (oui)
    :Saisir code 2FA;
    if (Code valide ?) then (oui)
      :Cr?er session JWT;
    else (non)
      :Afficher erreur 2FA;
      stop
    endif
  else (non)
    :Cr?er session JWT;
  endif
  :Rediriger selon r?le;
else (non)
  :Afficher erreur d'authentification;
endif
stop
@enduml
```

## Sprint 2 ? Structure RH, pointage et horaires

### Cas d'utilisation ? Sprint 2

```plantuml
@startuml sprint2_use_case
left to right direction
actor "Responsable RH" as RH
actor "Manager" as Manager
actor "Employ?" as Employe
rectangle "WEENTIME - Sprint 2" {
  usecase "G?rer d?partements" as Dept
  usecase "G?rer ?quipes" as Team
  usecase "G?rer employ?s" as Emp
  usecase "Affecter manager" as AssignM
  usecase "Pointer arriv?e/d?part" as Check
  usecase "Consulter historique" as Hist
  usecase "Consulter pr?sence ?quipe" as TeamPresence
  usecase "G?rer horaires" as Schedule
  usecase "S'authentifier" as Auth
}
RH --> Dept
RH --> Team
RH --> Emp
RH --> AssignM
RH --> Schedule
Employe --> Check
Employe --> Hist
Manager --> TeamPresence
Dept ..> Auth : <<include>>
Team ..> Auth : <<include>>
Emp ..> Auth : <<include>>
Check ..> Auth : <<include>>
Hist ..> Auth : <<include>>
Schedule ..> Auth : <<include>>
@enduml
```

### Classes ? Sprint 2

```plantuml
@startuml sprint2_class
class Departement { +id : Long; +nom : String; +codeInterne : String }
class Equipe { +id : Long; +nom : String; +effectifMaximum : Integer; +estActive : Boolean }
class Utilisateur { +id : Long; +nom : String; +prenom : String; +poste : String }
class AttendanceSession { +id : Long; +date : LocalDate; +checkInTime : LocalDateTime; +checkOutTime : LocalDateTime; +status : AttendanceSessionStatus }
class Presence { +id : Long; +date : LocalDate; +heureEntree : LocalDateTime; +heureSortie : LocalDateTime; +totalHeuresTravaillees : BigDecimal }
class HoraireModele { +id : Long; +nom : String; +type : TypeHoraireModele; +heuresHebdo : Double; +statut : StatutHoraireModele }
class AffectationHoraire { +id : Long; +cibleType : CibleType; +cibleId : Long; +dateDebut : LocalDate; +dateFin : LocalDate }
Departement "1" o-- "0..*" Equipe
Equipe "1" o-- "0..*" Utilisateur
Utilisateur "1" -- "0..*" AttendanceSession
Utilisateur "1" -- "0..*" Presence
HoraireModele "1" -- "0..*" AffectationHoraire
@enduml
```

### S?quence ? Pointage arriv?e/d?part

```plantuml
@startuml sprint2_seq_pointage
actor "Employ?" as Emp
participant "Angular Pointage" as UI
participant "Gateway" as Gateway
participant "presence-service" as PresenceSvc
participant "AttendanceSessionRepository" as Repo
Emp -> UI : Cliquer Pointer arriv?e
UI -> Gateway : POST /presence/check-in
Gateway -> PresenceSvc : Transmettre JWT
PresenceSvc -> Repo : Cr?er AttendanceSession
Repo --> PresenceSvc : Session active
PresenceSvc --> UI : Statut du jour
UI --> Emp : Afficher pointage enregistr?
@enduml
```

### S?quence ? Cr?ation d'horaire RH

```plantuml
@startuml sprint2_seq_horaire
actor "Responsable RH" as RH
participant "RH Horaires Page" as UI
participant "HoraireService Angular" as NgSvc
participant "Gateway" as Gateway
participant "presence-service" as PresenceSvc
participant "HoraireRepository" as Repo
RH -> UI : Saisir horaire
UI -> NgSvc : createHoraire(dto)
NgSvc -> Gateway : POST /horaires
Gateway -> PresenceSvc : Requ?te authentifi?e
PresenceSvc -> Repo : save(HoraireModele)
Repo --> PresenceSvc : Horaire cr??
PresenceSvc --> UI : R?ponse horaire
UI --> RH : Afficher succ?s
@enduml
```

### Activit? ? Gestion du pointage

```plantuml
@startuml sprint2_activity_pointage
start
:Utilisateur ouvre page pointage;
:Charger statut du jour;
if (Session active ?) then (oui)
  :Proposer pointage sortie;
else (non)
  :Proposer pointage entr?e;
endif
:Envoyer action au backend;
if (Backend accepte ?) then (oui)
  :Mettre ? jour statut affich?;
else (non)
  :Afficher message d'erreur m?tier;
endif
stop
@enduml
```

## Sprint 3 ? Demandes RH et validations

### Cas d'utilisation ? Sprint 3

```plantuml
@startuml sprint3_use_case
left to right direction
actor "Employ?" as Employe
actor "Manager" as Manager
actor "Responsable RH" as RH
rectangle "WEENTIME - Sprint 3" {
  usecase "Soumettre cong?" as Leave
  usecase "Consulter solde" as Balance
  usecase "D?clarer absence" as Abs
  usecase "Demander autorisation" as Authz
  usecase "Demander t?l?travail" as Tw
  usecase "Demander document RH" as DocReq
  usecase "Valider/refuser demande" as Validate
  usecase "Traiter document RH" as DocRh
  usecase "Consulter r?unions" as Meeting
  usecase "S'authentifier" as Auth
}
Employe --> Leave
Employe --> Balance
Employe --> Abs
Employe --> Authz
Employe --> Tw
Employe --> DocReq
Employe --> Meeting
Manager --> Validate
RH --> Validate
RH --> DocRh
Leave ..> Auth : <<include>>
Tw ..> Auth : <<include>>
DocReq ..> Auth : <<include>>
Validate ..> Auth : <<include>>
@enduml
```

### Classes ? Sprint 3

```plantuml
@startuml sprint3_class
abstract class Demande { +id : Long; +utilisateurId : Long; +managerId : Long; +entrepriseId : Long; +statut : StatutDemandeEnum; +dateCreation : LocalDateTime; +dateDecision : LocalDateTime }
class Conge { +dateDebut : LocalDate; +dateFin : LocalDate; +nombreJours : Integer; +typeCongeId : Long }
class Autorisation { +heureDebut : LocalTime; +heureFin : LocalTime; +duree : Integer }
class Teletravail { +dateDebut : LocalDate; +dateFin : LocalDate; +nombreJours : Double; +adresse : String }
class Document { +typeDocument : TypeDocument; +documentUrl : String; +generatedByAI : boolean }
class SoldeConge { +joursAcquis : Double; +joursUtilises : Double; +joursRestants : Double; +joursEnAttente : Double }
class TypeConge { +libelle : String; +nombreJoursMax : Integer; +requireJustificatif : Boolean }
class Reunion { +titre : String; +dateReunion : LocalDate; +heureDebut : LocalTime; +heureFin : LocalTime; +statut : ReunionStatut }
Demande <|-- Conge
Demande <|-- Autorisation
Demande <|-- Teletravail
Demande <|-- Document
TypeConge "1" -- "0..*" Conge
TypeConge "1" -- "0..*" SoldeConge
@enduml
```

### S?quence ? Soumission cong?

```plantuml
@startuml sprint3_seq_leave_submit
actor "Employ?" as Emp
participant "Angular Cong?s" as UI
participant "Gateway" as Gateway
participant "rh-service" as RhSvc
participant "CongeRepository" as Repo
Emp -> UI : Remplir demande cong?
UI -> Gateway : POST /rh/conges
Gateway -> RhSvc : Requ?te authentifi?e
RhSvc -> Repo : save(Conge)
Repo --> RhSvc : Demande cr??e
RhSvc --> UI : D?tail demande
UI --> Emp : Afficher statut en attente
@enduml
```

### S?quence ? Validation demande

```plantuml
@startuml sprint3_seq_validation
actor "Manager" as Manager
participant "Page Approbations" as UI
participant "Gateway" as Gateway
participant "rh-service" as RhSvc
participant "NotificationService" as Notif
Manager -> UI : Valider/refuser demande
UI -> Gateway : PATCH /rh/conges/{id}/valider
Gateway -> RhSvc : Transmettre d?cision
RhSvc -> RhSvc : V?rifier r?le et statut
RhSvc -> Notif : Notifier demandeur
RhSvc --> UI : Statut mis ? jour
UI --> Manager : Afficher confirmation
@enduml
```

### Activit? ? Traitement d'une demande RH

```plantuml
@startuml sprint3_activity_demande
start
:Employ? soumet une demande;
:Demande cr??e avec statut EN_ATTENTE;
if (Validation manager requise ?) then (oui)
  :Manager valide ou refuse;
  if (Refus manager ?) then (oui)
    :Notifier employ?;
    stop
  endif
endif
:RH examine la demande;
if (RH valide ?) then (oui)
  :Mettre statut VALIDEE;
else (non)
  :Mettre statut REFUSEE;
endif
:Notifier employ?;
stop
@enduml
```

## Sprint 4 ? Dashboards, notifications et communication

### Cas d'utilisation ? Sprint 4

```plantuml
@startuml sprint4_use_case
left to right direction
actor "Employ?" as Employe
actor "Manager" as Manager
actor "Responsable RH" as RH
actor "Administrateur" as Admin
rectangle "WEENTIME - Sprint 4" {
  usecase "Consulter dashboard" as Dash
  usecase "Recevoir notifications" as Notif
  usecase "Consulter messages" as MsgRead
  usecase "Envoyer message" as MsgSend
  usecase "G?rer channels" as Channel
  usecase "Consulter statistiques" as Stats
  usecase "Consulter audit" as Audit
  usecase "S'authentifier" as Auth
}
Employe --> Dash
Employe --> Notif
Employe --> MsgRead
Employe --> MsgSend
Manager --> Stats
RH --> Stats
Admin --> Stats
Admin --> Audit
RH --> Channel
Dash ..> Auth : <<include>>
MsgRead ..> Auth : <<include>>
MsgSend ..> Auth : <<include>>
Stats ..> Auth : <<include>>
@enduml
```

### Classes ? Sprint 4

```plantuml
@startuml sprint4_class
class CommChannel { +id : UUID; +entrepriseId : Long; +type : ChannelType; +name : String; +isPrivate : boolean; +isArchived : boolean }
class CommChannelMember { +role : ChannelMemberRole; +notificationLevel : String; +lastReadAt : Instant; +isMuted : boolean }
class CommMessage { +id : UUID; +senderId : Long; +body : String; +type : MessageType; +status : MessageStatus; +createdAt : Instant }
class CommReaction { +emoji : String; +createdAt : Instant }
class CommAttachment { +fileName : String; +contentType : String; +fileSize : Long; +storagePath : String }
class CommNotificationEvent { +eventType : String; +recipientId : Long; +status : NotificationEventStatus; +createdAt : Instant }
class CommAuditLog { +entityType : String; +action : String; +actorId : Long; +createdAt : Instant }
CommChannel "1" o-- "0..*" CommChannelMember
CommChannel "1" o-- "0..*" CommMessage
CommMessage "1" o-- "0..*" CommReaction
CommMessage "1" o-- "0..*" CommAttachment
CommMessage "1" -- "0..*" CommNotificationEvent
CommAuditLog ..> CommChannel
CommAuditLog ..> CommMessage
@enduml
```

### S?quence ? Notification temps r?el

```plantuml
@startuml sprint4_seq_notification
participant "rh-service" as RhSvc
participant "organisation-service" as OrgSvc
participant "communication-service" as CommSvc
participant "Redis / WebSocket" as Realtime
participant "Angular NotificationBell" as UI
RhSvc -> OrgSvc : D?clencher notification m?tier
OrgSvc -> CommSvc : Dispatcher ?v?nement notification
CommSvc -> Realtime : Publier ?v?nement temps r?el
Realtime -> UI : Push notification
UI -> UI : Mettre ? jour compteur
@enduml
```

### S?quence ? Envoi message

```plantuml
@startuml sprint4_seq_message
actor "Employ?" as Emp
participant "MessageComposer" as UI
participant "CommunicationApiService" as Api
participant "Gateway" as Gateway
participant "communication-service" as CommSvc
participant "CommMessageRepository" as Repo
Emp -> UI : Saisir message
UI -> Api : sendMessage(channelId, body)
Api -> Gateway : POST /communication/channels/{id}/messages
Gateway -> CommSvc : Requ?te authentifi?e
CommSvc -> Repo : save(CommMessage)
Repo --> CommSvc : Message cr??
CommSvc --> UI : MessageResponse
UI --> Emp : Afficher message envoy?
@enduml
```

### Activit? ? Consultation dashboard

```plantuml
@startuml sprint4_activity_dashboard
start
:Utilisateur ouvre dashboard;
:Identifier r?le courant;
if (Administrateur ?) then (oui)
  :Charger indicateurs plateforme;
elseif (RH ?) then (oui)
  :Charger backlog et stats RH;
elseif (Manager ?) then (oui)
  :Charger ?quipe et approbations;
else (Employ?)
  :Charger r?sum? personnel;
endif
:Afficher notifications et actions rapides;
stop
@enduml
```

## Sprint 5 ? Assistant IA, vocal et observabilit?

### Cas d'utilisation ? Sprint 5

```plantuml
@startuml sprint5_use_case
left to right direction
actor "Employ?" as Employe
actor "Manager" as Manager
actor "Responsable RH" as RH
actor "Administrateur" as Admin
rectangle "WEENTIME - Sprint 5" {
  usecase "Interagir avec assistant IA" as Chat
  usecase "Ex?cuter commande vocale" as Voice
  usecase "Demander r?sum? r?le" as Digest
  usecase "Poser question politique RH" as Rag
  usecase "Confirmer action sensible" as Confirm
  usecase "Consulter diagnostic IA" as Monitor
  usecase "S'authentifier" as Auth
}
Employe --> Chat
Employe --> Voice
Employe --> Digest
Employe --> Rag
Manager --> Chat
RH --> Chat
Admin --> Monitor
Chat ..> Auth : <<include>>
Voice ..> Auth : <<include>>
Confirm ..> Auth : <<include>>
Voice ..> Chat : <<include>>
Chat ..> Confirm : <<extend>>
Chat ..> Rag : <<extend>>
@enduml
```

### Classes ? Sprint 5

```plantuml
@startuml sprint5_class
class WorkflowOrchestrator { +process() }
class RouterAgent { +route() }
class ToolRegistry { +register(); +execute() }
class RegisteredTool { +name : str; +type : str; +allowed_roles : set }
class PolicyRetriever { +search() }
class PolicyCitation { +source_id : str; +title : str; +page : int }
class SpeechToTextService { +transcribe() }
class VoiceProcessingResult { +transcript : str; +language : str; +status : str }
class TextToSpeechService { +synthesize() }
class VoiceRoleRouter { +route_voice() }
class SessionState { +pendingIntent : str; +language : str; +role : str }
WorkflowOrchestrator --> RouterAgent
WorkflowOrchestrator --> ToolRegistry
WorkflowOrchestrator --> SessionState
RouterAgent --> RegisteredTool
ToolRegistry o-- RegisteredTool
WorkflowOrchestrator --> PolicyRetriever
PolicyRetriever --> PolicyCitation
SpeechToTextService --> VoiceProcessingResult
VoiceRoleRouter --> WorkflowOrchestrator
TextToSpeechService --> VoiceRoleRouter
@enduml
```

### S?quence ? Chatbot avec ToolRegistry

```plantuml
@startuml sprint5_seq_chat_tool
actor "Responsable RH" as RH
participant "Angular ChatWidget" as UI
participant "FastAPI /v2/chat" as ChatAPI
participant "WorkflowOrchestrator" as Orchestrator
participant "RouterAgent" as Router
participant "ToolRegistry" as Tools
participant "Backend Spring" as Backend
participant "ResponseGuard" as Guard
RH -> UI : Demander action RH
UI -> ChatAPI : POST /v2/chat + contexte page/r?le
ChatAPI -> Orchestrator : process(message, context)
Orchestrator -> Router : d?terminer intention
Router --> Orchestrator : intent + agent
Orchestrator -> Tools : pr?parer outil autoris?
Tools -> Backend : appel API m?tier si lecture ou ex?cution confirm?e
Backend --> Tools : r?sultat autoritaire
Tools --> Orchestrator : ToolResult
Orchestrator -> Guard : valider r?ponse
Guard --> ChatAPI : r?ponse s?re
ChatAPI --> UI : message / confirmation
@enduml
```

### S?quence ? Pipeline vocal STT/TTS

```plantuml
@startuml sprint5_seq_voice
actor "Employ?" as Emp
participant "Angular Voice UI" as UI
participant "FastAPI /v2/voice" as VoiceAPI
participant "SpeechToTextService" as STT
participant "WorkflowOrchestrator" as Orchestrator
participant "TextToSpeechService" as TTS
Emp -> UI : Enregistrer commande vocale
UI -> VoiceAPI : Envoyer audio finalis?
VoiceAPI -> STT : transcrire audio
STT --> VoiceAPI : transcript + langue
VoiceAPI -> Orchestrator : traiter transcript
Orchestrator --> VoiceAPI : r?ponse textuelle s?re
VoiceAPI -> TTS : synth?se si disponible
TTS --> VoiceAPI : audio ou indisponible
VoiceAPI --> UI : texte + m?tadonn?es audio
@enduml
```

### Activit? ? Traitement IA s?curis?

```plantuml
@startuml sprint5_activity_ai
start
:Recevoir message ou transcript vocal;
:Construire contexte v?rifi?;
:D?tecter langue et normaliser;
:Router intention selon r?le et page;
if (Question politique ?) then (oui)
  :Chercher sources RAG approuv?es;
  if (Citation disponible ?) then (oui)
    :Composer r?ponse cit?e;
  else (non)
    :Retourner indisponible;
  endif
else (non)
  :S?lectionner outil ToolRegistry;
  if (Action ?criture ?) then (oui)
    :Cr?er confirmation;
  else (lecture)
    :Appeler backend;
  endif
endif
:Option reformulation LLM non autoritaire;
:Valider avec ResponseGuard;
:Retourner r?ponse finale;
stop
@enduml
```
