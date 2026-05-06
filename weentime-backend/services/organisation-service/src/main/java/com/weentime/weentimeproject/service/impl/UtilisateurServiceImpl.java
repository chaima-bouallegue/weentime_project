package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.ChangePasswordRequest;
import com.weentime.weentimeproject.dto.request.CreateRhRequest;
import com.weentime.weentimeproject.dto.request.RhOwnerCreateRequest;
import com.weentime.weentimeproject.dto.request.RhOwnerUpdateRequest;
import com.weentime.weentimeproject.dto.request.RegisterRequest;
import com.weentime.weentimeproject.dto.request.UserProfileUpdateRequest;
import com.weentime.weentimeproject.dto.request.UtilisateurRequest;
import com.weentime.weentimeproject.dto.response.ActivityItemResponse;
import com.weentime.weentimeproject.dto.response.CreateRhResponse;
import com.weentime.weentimeproject.dto.response.RhOwnerResponse;
import com.weentime.weentimeproject.dto.response.UserProfileResponse;
import com.weentime.weentimeproject.dto.response.UserSummaryResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurAuthResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurResponse;
import com.weentime.weentimeproject.dto.request.NotificationDispatchRequest;
import com.weentime.weentimeproject.entity.Departement;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.entity.Equipe;
import com.weentime.weentimeproject.entity.Role;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.NotificationType;
import com.weentime.weentimeproject.enums.RoleNom;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.enums.TwoFactorTypeEnum;
import com.weentime.weentimeproject.mapper.UtilisateurMapper;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.repository.RoleRepository;
import com.weentime.weentimeproject.repository.UserAuditLogRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.AvatarStorageService;
import com.weentime.weentimeproject.service.NotificationService;
import com.weentime.weentimeproject.service.UtilisateurService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service("utilisateurService")
@RequiredArgsConstructor
@Transactional
public class UtilisateurServiceImpl implements UtilisateurService {

    private static final String USER_NOT_FOUND_ID = "Utilisateur non trouve avec l'id : ";
    private static final String USER_NOT_FOUND_EMAIL = "Utilisateur non trouve avec l'email : ";
    private static final Pattern IPV4_PATTERN = Pattern.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b");

    private final UtilisateurRepository utilisateurRepository;
    private final DepartementRepository departementRepository;
    private final EquipeRepository equipeRepository;
    private final RoleRepository roleRepository;
    private final EntrepriseRepository entrepriseRepository;
    private final UserAuditLogRepository auditLogRepository;
    private final UtilisateurMapper utilisateurMapper;
    private final PasswordEncoder passwordEncoder;
    private final NotificationService notificationService;
    private final AvatarStorageService avatarStorageService;

    private String getCurrentUser() {
        org.springframework.security.core.Authentication authentication =
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        return authentication != null ? authentication.getName() : "SYSTEM";
    }

    private void logAudit(String action, String targetUser, String details) {
        auditLogRepository.save(com.weentime.weentimeproject.entity.UserAuditLog.builder()
                .action(action)
                .performedBy(getCurrentUser())
                .targetUser(targetUser)
                .details(details)
                .build());
    }

    @Override
    public UtilisateurResponse createUtilisateur(UtilisateurRequest request) {
        if (utilisateurRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email deja utilise : " + request.getEmail());
        }
        if (request.getMotDePasse() == null || request.getMotDePasse().isBlank()) {
            throw new IllegalArgumentException("Le mot de passe est obligatoire.");
        }

        Entreprise entreprise = resolveEntrepriseForWrite(request.getEntrepriseId());
        assertEntrepriseCapacity(entreprise);

        Utilisateur utilisateur = utilisateurMapper.toEntity(request);
        utilisateur.setMotDePasse(passwordEncoder.encode(request.getMotDePasse()));
        utilisateur.setEntrepriseId(entreprise.getId());
        utilisateur.setEntreprise(entreprise);

        mapRelationships(request, utilisateur);

        Utilisateur saved = utilisateurRepository.save(utilisateur);
        incrementEntrepriseUsers(entreprise);
        logAudit("CREATE_USER", saved.getEmail(), "Utilisateur cree avec succes.");
        notifyUser(saved.getId(), "Compte cree", "Votre compte WeenTime a ete cree avec succes.", "/app/" + resolveAppScope(saved) + "/profil");
        return utilisateurMapper.toResponse(saved);
    }

    @Override
    public CreateRhResponse createRhUser(CreateRhRequest request) {
        if (utilisateurRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email deja utilise : " + request.getEmail());
        }

        Entreprise entreprise = findEntrepriseById(request.getEntrepriseId());
        assertEntrepriseCapacity(entreprise);

        Role roleRh = roleRepository.findByNom(RoleNom.ROLE_RH)
                .orElseThrow(() -> new EntityNotFoundException("Role non trouve : ROLE_RH"));

        Utilisateur utilisateur = Utilisateur.builder()
                .nom(request.getNom())
                .prenom(request.getPrenom())
                .email(request.getEmail())
                .motDePasse(passwordEncoder.encode(request.getMotDePasse()))
                .telephone(request.getTelephone())
                .statut(StatutUtilisateurEnum.ACTIF)
                .roles(new HashSet<>(Set.of(roleRh)))
                .entrepriseId(entreprise.getId())
                .entreprise(entreprise)
                .build();

        Utilisateur saved = utilisateurRepository.save(utilisateur);
        incrementEntrepriseUsers(entreprise);
        logAudit("CREATE_RH", saved.getEmail(), "Compte RH cree pour l'entreprise : " + entreprise.getNom());
        notifyUser(saved.getId(), "Compte RH cree", "Votre espace RH est pret a etre utilise.", "/app/rh/dashboard");
        return utilisateurMapper.toCreateRhResponse(saved);
    }

    @Override
    public RhOwnerResponse createRhOwner(RhOwnerCreateRequest request) {
        if (utilisateurRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email deja utilise : " + request.getEmail());
        }

        Entreprise entreprise = findEntrepriseById(request.getEntrepriseId());
        assertEntrepriseCapacity(entreprise);

        Role roleRh = roleRepository.findByNom(RoleNom.ROLE_RH)
                .orElseThrow(() -> new EntityNotFoundException("Role non trouve : ROLE_RH"));

        String[] names = splitDisplayName(request.getName());
        Utilisateur utilisateur = Utilisateur.builder()
                .nom(names[1])
                .prenom(names[0])
                .email(request.getEmail().trim())
                .motDePasse(passwordEncoder.encode(request.getPassword()))
                .statut(StatutUtilisateurEnum.ACTIF)
                .roles(new HashSet<>(Set.of(roleRh)))
                .entrepriseId(entreprise.getId())
                .entreprise(entreprise)
                .build();

        Utilisateur saved = utilisateurRepository.save(utilisateur);
        incrementEntrepriseUsers(entreprise);
        logAudit("CREATE_RH", saved.getEmail(), "Compte RH cree pour l'entreprise : " + entreprise.getNom());
        notifyUser(saved.getId(), "Compte RH cree", "Votre espace RH est pret a etre utilise.", "/app/rh/dashboard");
        return utilisateurMapper.toRhOwnerResponse(saved);
    }

    @Override
    public List<RhOwnerResponse> getAllRh() {
        return utilisateurRepository.findByRoles_NomOrderByDateCreationDesc(RoleNom.ROLE_RH)
                .stream()
                .map(this::enforceSingleBusinessRole)
                .filter(this::hasCanonicalRhRole)
                .map(utilisateurMapper::toRhOwnerResponse)
                .collect(Collectors.toList());
    }

    @Override
    public List<RhOwnerResponse> getRhByEntreprise(Long entrepriseId) {
        return utilisateurRepository.findByEntreprise_IdAndRoles_NomOrderByDateCreationDesc(entrepriseId, RoleNom.ROLE_RH)
                .stream()
                .map(this::enforceSingleBusinessRole)
                .filter(this::hasCanonicalRhRole)
                .map(utilisateurMapper::toRhOwnerResponse)
                .collect(Collectors.toList());
    }

    @Override
    public RhOwnerResponse updateRhOwner(Long id, RhOwnerUpdateRequest request) {
        Utilisateur utilisateur = resolveRhUser(id);
        String normalizedEmail = request.getEmail().trim();

        if (!utilisateur.getEmail().equalsIgnoreCase(normalizedEmail)
                && utilisateurRepository.existsByEmail(normalizedEmail)) {
            throw new IllegalArgumentException("Email deja utilise : " + normalizedEmail);
        }

        Entreprise entreprise = findEntrepriseById(request.getEntrepriseId());
        Long previousEntrepriseId = utilisateur.getEntrepriseId();
        if (!Objects.equals(previousEntrepriseId, entreprise.getId())) {
            assertEntrepriseCapacity(entreprise);
        }

        String[] names = splitDisplayName(request.getName());
        utilisateur.setPrenom(names[0]);
        utilisateur.setNom(names[1]);
        utilisateur.setEmail(normalizedEmail);
        utilisateur.setEntrepriseId(entreprise.getId());
        utilisateur.setEntreprise(entreprise);

        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            utilisateur.setMotDePasse(passwordEncoder.encode(request.getPassword()));
        }

        Utilisateur saved = utilisateurRepository.save(utilisateur);
        syncEntrepriseUserCounters(previousEntrepriseId, saved.getEntrepriseId());
        logAudit("UPDATE_RH", saved.getEmail(), "Compte RH mis a jour.");
        return utilisateurMapper.toRhOwnerResponse(saved);
    }

    @Override
    public void deleteRhOwner(Long id) {
        Utilisateur utilisateur = resolveRhUser(id);
        if (utilisateur.getStatut() != StatutUtilisateurEnum.INACTIF) {
            utilisateur.setStatut(StatutUtilisateurEnum.INACTIF);
            utilisateurRepository.save(utilisateur);
            decrementEntrepriseUsers(utilisateur.getEntrepriseId());
        }

        logAudit("DELETE_RH", utilisateur.getEmail(), "Compte RH desactive.");
    }

    @Override
    public RhOwnerResponse assignRhOwnerEntreprise(Long id, Long entrepriseId) {
        Utilisateur utilisateur = resolveRhUser(id);
        Entreprise entreprise = findEntrepriseById(entrepriseId);
        Long previousEntrepriseId = utilisateur.getEntrepriseId();

        if (!Objects.equals(previousEntrepriseId, entrepriseId)) {
            assertEntrepriseCapacity(entreprise);
        }

        utilisateur.setEntrepriseId(entreprise.getId());
        utilisateur.setEntreprise(entreprise);
        Utilisateur saved = utilisateurRepository.save(utilisateur);
        syncEntrepriseUserCounters(previousEntrepriseId, saved.getEntrepriseId());
        logAudit("ASSIGN_RH_ENTREPRISE", saved.getEmail(), "RH assigne a l'entreprise : " + entreprise.getNom());
        return utilisateurMapper.toRhOwnerResponse(saved);
    }

    @Override
    public RhOwnerResponse toggleRhStatut(Long id) {
        Utilisateur utilisateur = resolveRhUser(id);

        StatutUtilisateurEnum nouveauStatut = utilisateur.getStatut() == StatutUtilisateurEnum.ACTIF
                ? StatutUtilisateurEnum.INACTIF
                : StatutUtilisateurEnum.ACTIF;

        utilisateur.setStatut(nouveauStatut);
        Utilisateur saved = utilisateurRepository.save(utilisateur);

        logAudit("TOGGLE_RH_STATUS", saved.getEmail(), "Statut RH modifie vers : " + nouveauStatut);
        return utilisateurMapper.toRhOwnerResponse(saved);
    }

    @Override
    public UtilisateurResponse registerUtilisateur(RegisterRequest request) {
        if (utilisateurRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email deja utilise : " + request.getEmail());
        }

        Utilisateur utilisateur = Utilisateur.builder()
                .nom(request.getNom())
                .prenom(request.getPrenom())
                .email(request.getEmail())
                .motDePasse(passwordEncoder.encode(request.getMotDePasse()))
                .statut(StatutUtilisateurEnum.ACTIF)
                .build();
        utilisateur.setRoles(resolveRoles(null, null));

        String domain = request.getEmail().substring(request.getEmail().indexOf("@") + 1);
        String namePart = domain.contains(".") ? domain.substring(0, domain.indexOf(".")) : domain;
        String entrepriseName = namePart.substring(0, 1).toUpperCase() + namePart.substring(1).toLowerCase();

        Entreprise entreprise = entrepriseRepository.findByNomIgnoreCase(entrepriseName)
                .orElseGet(() -> entrepriseRepository.save(Entreprise.builder()
                        .nom(entrepriseName)
                        .siret(java.util.UUID.randomUUID().toString().substring(0, 14))
                        .estActive(Boolean.TRUE)
                        .build()));
        assertEntrepriseCapacity(entreprise);

        utilisateur.setEntrepriseId(entreprise.getId());
        utilisateur.setEntreprise(entreprise);

        Utilisateur saved = utilisateurRepository.save(utilisateur);
        incrementEntrepriseUsers(entreprise);
        logAudit("REGISTER_USER", saved.getEmail(), "Utilisateur auto-inscrit avec succes.");
        notifyUser(saved.getId(), "Bienvenue sur WeenTime", "Votre compte a bien ete initialise.", "/app/" + resolveAppScope(saved) + "/profil");
        return utilisateurMapper.toResponse(saved);
    }

    @Override
    public UtilisateurResponse getUtilisateurById(Long id) {
        return utilisateurRepository.findById(id)
                .map(this::enforceSingleBusinessRole)
                .map(utilisateurMapper::toResponse)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + id));
    }

    @Override
    public List<UtilisateurResponse> getUtilisateursByEntreprise(Long entrepriseId) {
        return utilisateurRepository.findByEntrepriseIdOrderByPrenomAscNomAsc(entrepriseId).stream()
                .map(this::enforceSingleBusinessRole)
                .map(utilisateurMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<Long> getUtilisateurIdsByEntreprise(Long entrepriseId) {
        return utilisateurRepository.findByEntrepriseIdOrderByPrenomAscNomAsc(entrepriseId).stream()
                .map(Utilisateur::getId)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<Long> getUtilisateurIdsByEntrepriseAndRole(Long entrepriseId, String role) {
        RoleNom roleNom = normalizeRole(role);
        return utilisateurRepository.findByEntrepriseIdAndRolesNomOrderByPrenomAscNomAsc(entrepriseId, roleNom).stream()
                .map(Utilisateur::getId)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public UserSummaryResponse getUserSummaryById(Long id) {
        Utilisateur utilisateur = utilisateurRepository.findWithDetailsById(id)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + id));
        return toUserSummary(utilisateur);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserSummaryResponse> getUserSummaries(java.util.Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }

        return utilisateurRepository.findByIdIn(ids).stream()
                .map(this::toUserSummary)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public UserSummaryResponse getManagerSummary(Long userId) {
        Utilisateur utilisateur = utilisateurRepository.findWithDetailsById(userId)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + userId));

        if (utilisateur.getManager() == null) {
            return null;
        }

        Utilisateur manager = utilisateurRepository.findWithDetailsById(utilisateur.getManager().getId())
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + utilisateur.getManager().getId()));
        return toUserSummary(manager);
    }

    @Override
    public List<String> getRolesByUserId(Long userId) {
        Utilisateur utilisateur = utilisateurRepository.findWithDetailsById(userId)
                .map(this::enforceSingleBusinessRole)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + userId));

        if (utilisateur.getRoles() == null) {
            return List.of();
        }

        return utilisateur.getRoles().stream()
                .map(role -> role.getNom().name())
                .sorted()
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserSummaryResponse> getTeamMembers(Long managerId) {
        return utilisateurRepository.findByManagerId(managerId).stream()
                .map(this::toUserSummary)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserSummaryResponse> getActiveUsers() {
        return utilisateurRepository.findByStatut(StatutUtilisateurEnum.ACTIF).stream()
                .map(this::toUserSummary)
                .toList();
    }

    @Override
    public UtilisateurResponse getUtilisateurByEmail(String email) {
        return utilisateurRepository.findByEmail(email)
                .map(this::enforceSingleBusinessRole)
                .map(utilisateurMapper::toResponse)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));
    }

    @Override
    @Transactional(readOnly = true)
    public String getEmailById(Long id) {
        return utilisateurRepository.findById(id)
                .map(Utilisateur::getEmail)
                .orElse(null);
    }

    @Override
    public UtilisateurAuthResponse getUtilisateurForAuth(String email) {
        return utilisateurRepository.findByEmail(email)
                .map(this::enforceSingleBusinessRole)
                .map(utilisateurMapper::toAuthResponse)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));
    }

    @Override
    public UserProfileResponse getCurrentUserProfile() {
        String email = getCurrentUser();
        if ("SYSTEM".equals(email)) {
            return defaultProfile(null);
        }

        return utilisateurRepository.findByEmail(email)
                .map(this::enforceSingleBusinessRole)
                .map(utilisateurMapper::toProfileResponse)
                .map(this::ensureProfileContextDefaults)
                .orElseGet(() -> defaultProfile(email));
    }

    @Override
    @Transactional
    public UserProfileResponse updateCurrentUserProfile(UserProfileUpdateRequest request) {
        String email = getCurrentUser();
        if ("SYSTEM".equals(email)) {
            throw new IllegalStateException("Aucun utilisateur authentifie trouve.");
        }

        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        utilisateurMapper.updateEntityFromProfileRequest(request, utilisateur);
        Utilisateur updated = utilisateurRepository.save(utilisateur);

        logAudit("PROFILE_UPDATE", email, "Profil mis a jour par l'utilisateur.");

        return utilisateurMapper.toProfileResponse(updated);
    }

    @Override
    @Transactional
    public String updateCurrentUserAvatar(MultipartFile file) {
        String email = getCurrentUser();
        if ("SYSTEM".equals(email)) {
            throw new IllegalStateException("Aucun utilisateur authentifie trouve.");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Le fichier avatar est obligatoire.");
        }

        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        String previousAvatarUrl = utilisateur.getAvatarUrl();
        String avatarPath = avatarStorageService.storeAvatar(utilisateur.getId(), file);
        utilisateur.setAvatarUrl(avatarPath);
        utilisateurRepository.save(utilisateur);
        avatarStorageService.deleteAvatar(previousAvatarUrl);

        logAudit("PROFILE_AVATAR_UPDATE", email, "Avatar mis a jour par l'utilisateur.");
        return avatarPath;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ActivityItemResponse> getActivityHistory() {
        String email = getCurrentUser();
        if ("SYSTEM".equals(email)) {
            return List.of();
        }

        return auditLogRepository.findByIdentityOrderByCreatedAtDesc(email)
                .stream()
                .map(log -> ActivityItemResponse.builder()
                        .id(log.getId())
                        .action(log.getAction())
                        .type(log.getAction())
                        .description(log.getDetails())
                        .timestamp(log.getCreatedAt())
                        .date(log.getCreatedAt())
                        .ipAddress(extractIpAddress(log.getDetails()))
                        .icon(mapActionToIcon(log.getAction()))
                        .build())
                .collect(Collectors.toList());
    }

    private String extractIpAddress(String details) {
        if (details == null || details.isBlank()) {
            return null;
        }

        Matcher matcher = IPV4_PATTERN.matcher(details);
        if (matcher.find()) {
            return matcher.group();
        }

        return null;
    }

    private String mapActionToIcon(String action) {
        if (action == null) {
            return "activity";
        }
        return switch (action) {
            case "LOGIN" -> "log-in";
            case "LOGOUT" -> "log-out";
            case "PROFILE_UPDATE" -> "user";
            case "CHANGE_PASSWORD" -> "lock";
            case "CREATE_USER" -> "user-plus";
            case "DELETE_USER" -> "user-minus";
            default -> "activity";
        };
    }

    @Override
    public Page<UtilisateurResponse> getAllUtilisateurs(Pageable pageable) {
        return getAllUtilisateurs(pageable, null);
    }

    @Override
    public Page<UtilisateurResponse> getAllUtilisateurs(Pageable pageable, Long entrepriseId) {
        Long entrepriseScope = resolveScopedEntrepriseId();
        Long effectiveEntrepriseId = entrepriseId != null ? entrepriseId : entrepriseScope;
        Page<Utilisateur> page = effectiveEntrepriseId == null
                ? utilisateurRepository.findAll(pageable)
                : utilisateurRepository.findByEntrepriseId(effectiveEntrepriseId, pageable);
        return page
                .map(this::enforceSingleBusinessRole)
                .map(utilisateurMapper::toResponse);
    }

    @Override
    public UtilisateurResponse updateUtilisateur(Long id, UtilisateurRequest request) {
        Utilisateur utilisateur = utilisateurRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + id));
        Long previousEntrepriseId = utilisateur.getEntrepriseId();
        java.util.Set<String> previousRoles = utilisateur.getRoles() == null
                ? java.util.Set.of()
                : utilisateur.getRoles().stream().map(role -> role.getNom().name()).collect(Collectors.toSet());

        utilisateurMapper.updateEntityFromRequest(request, utilisateur);

        if (request.getMotDePasse() != null && !request.getMotDePasse().isBlank()) {
            utilisateur.setMotDePasse(passwordEncoder.encode(request.getMotDePasse()));
        }

        Entreprise entreprise = resolveEntrepriseForWrite(request.getEntrepriseId());
        if (!Objects.equals(previousEntrepriseId, entreprise.getId())) {
            assertEntrepriseCapacity(entreprise);
        }
        utilisateur.setEntrepriseId(entreprise.getId());
        utilisateur.setEntreprise(entreprise);

        mapRelationships(request, utilisateur);

        Utilisateur saved = utilisateurRepository.save(utilisateur);
        syncEntrepriseUserCounters(previousEntrepriseId, saved.getEntrepriseId());
        logAudit("UPDATE_USER", saved.getEmail(), "Utilisateur mis a jour.");
        java.util.Set<String> updatedRoles = saved.getRoles() == null
                ? java.util.Set.of()
                : saved.getRoles().stream().map(role -> role.getNom().name()).collect(Collectors.toSet());
        if (!previousRoles.equals(updatedRoles)) {
            notifyUser(saved.getId(), "Roles mis a jour", "Vos roles WeenTime ont ete modifies : " + String.join(", ", updatedRoles), "/app/" + resolveAppScope(saved) + "/profil");
        }
        return utilisateurMapper.toResponse(saved);
    }

    @Override
    public void deleteUtilisateur(Long id) {
        Utilisateur utilisateur = utilisateurRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + id));

        if (utilisateur.getStatut() != StatutUtilisateurEnum.INACTIF) {
            utilisateur.setStatut(StatutUtilisateurEnum.INACTIF);
            utilisateurRepository.save(utilisateur);
            decrementEntrepriseUsers(utilisateur.getEntrepriseId());
        }

        logAudit("DELETE_USER", utilisateur.getEmail(), "Utilisateur marque comme INACTIF.");
    }

    @Override
    public UtilisateurResponse toggleUtilisateurStatut(Long id) {
        Utilisateur utilisateur = utilisateurRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + id));

        StatutUtilisateurEnum nouveauStatut = utilisateur.getStatut() == StatutUtilisateurEnum.ACTIF
                ? StatutUtilisateurEnum.INACTIF
                : StatutUtilisateurEnum.ACTIF;

        utilisateur.setStatut(nouveauStatut);
        Utilisateur saved = utilisateurRepository.save(utilisateur);
        logAudit("TOGGLE_USER_STATUS", saved.getEmail(), "Statut utilisateur modifie vers : " + nouveauStatut);
        return utilisateurMapper.toResponse(saved);
    }

    private void mapRelationships(UtilisateurRequest request, Utilisateur utilisateur) {
        if (request.getDepartementId() != null) {
            Departement departement = departementRepository.findById(request.getDepartementId())
                    .orElseThrow(() -> new EntityNotFoundException("Departement non trouve avec l'id : " + request.getDepartementId()));
            utilisateur.setDepartement(departement);
        } else {
            utilisateur.setDepartement(null);
        }

        if (request.getEquipeId() != null) {
            Equipe equipe = equipeRepository.findById(request.getEquipeId())
                    .orElseThrow(() -> new EntityNotFoundException("Equipe non trouvee avec l'id : " + request.getEquipeId()));
            utilisateur.setEquipe(equipe);
        } else {
            utilisateur.setEquipe(null);
        }

        utilisateur.setRoles(resolveRoles(request.getRole(), request.getRoleIds()));
    }

    private Entreprise resolveEntrepriseForWrite(Long requestedEntrepriseId) {
        String currentEmail = getCurrentUser();
        if ("SYSTEM".equals(currentEmail)) {
            if (requestedEntrepriseId == null) {
                throw new IllegalArgumentException("L'entreprise est obligatoire.");
            }
            return findEntrepriseById(requestedEntrepriseId);
        }

        Utilisateur currentUser = utilisateurRepository.findByEmail(currentEmail)
                .orElseThrow(() -> new IllegalStateException("Utilisateur authentifie non trouve."));
        boolean isAdmin = currentUser.getRoles() != null
                && currentUser.getRoles().stream().anyMatch(role -> role.getNom() == RoleNom.ROLE_ADMIN);

        if (requestedEntrepriseId != null) {
            if (!isAdmin && !requestedEntrepriseId.equals(currentUser.getEntrepriseId())) {
                throw new IllegalStateException("Vous ne pouvez gerer que les utilisateurs de votre entreprise.");
            }
            return findEntrepriseById(requestedEntrepriseId);
        }

        if (currentUser.getEntrepriseId() == null) {
            throw new IllegalArgumentException("L'entreprise est obligatoire.");
        }

        return findEntrepriseById(currentUser.getEntrepriseId());
    }

    private Long resolveScopedEntrepriseId() {
        String currentEmail = getCurrentUser();
        if ("SYSTEM".equals(currentEmail)) {
            return null;
        }

        Utilisateur currentUser = utilisateurRepository.findByEmail(currentEmail)
                .orElseThrow(() -> new IllegalStateException("Utilisateur authentifie non trouve."));
        boolean isAdmin = currentUser.getRoles() != null
                && currentUser.getRoles().stream().anyMatch(role -> role.getNom() == RoleNom.ROLE_ADMIN);

        return isAdmin ? null : currentUser.getEntrepriseId();
    }

    private Entreprise findEntrepriseById(Long entrepriseId) {
        return entrepriseRepository.findById(entrepriseId)
                .orElseThrow(() -> new EntityNotFoundException("Entreprise non trouvee avec l'id : " + entrepriseId));
    }

    private void assertEntrepriseCapacity(Entreprise entreprise) {
        if (entreprise.getMaxUsers() != null
                && entreprise.getCurrentUsers() != null
                && entreprise.getCurrentUsers() >= entreprise.getMaxUsers()) {
            throw new IllegalStateException("Limite d'utilisateurs atteinte pour cette entreprise.");
        }
    }

    private void incrementEntrepriseUsers(Entreprise entreprise) {
        if (entreprise == null) {
            return;
        }
        int currentUsers = entreprise.getCurrentUsers() == null ? 0 : entreprise.getCurrentUsers();
        entreprise.setCurrentUsers(currentUsers + 1);
        entrepriseRepository.save(entreprise);
    }

    private void decrementEntrepriseUsers(Long entrepriseId) {
        if (entrepriseId == null) {
            return;
        }
        entrepriseRepository.findById(entrepriseId).ifPresent(entreprise -> {
            int currentUsers = entreprise.getCurrentUsers() == null ? 0 : entreprise.getCurrentUsers();
            entreprise.setCurrentUsers(Math.max(currentUsers - 1, 0));
            entrepriseRepository.save(entreprise);
        });
    }

    private void syncEntrepriseUserCounters(Long previousEntrepriseId, Long newEntrepriseId) {
        if (Objects.equals(previousEntrepriseId, newEntrepriseId)) {
            return;
        }

        decrementEntrepriseUsers(previousEntrepriseId);
        if (newEntrepriseId != null) {
            incrementEntrepriseUsers(findEntrepriseById(newEntrepriseId));
        }
    }

    private Set<Role> resolveRoles(String role, Set<Long> roleIds) {
        RoleNom canonicalRole = null;
        if (role != null && !role.isBlank()) {
            canonicalRole = normalizeRole(role);
        } else if (roleIds != null && !roleIds.isEmpty()) {
            Set<RoleNom> requestedRoles = roleIds.stream()
                    .filter(Objects::nonNull)
                    .distinct()
                    .map(id -> roleRepository.findById(id)
                            .orElseThrow(() -> new EntityNotFoundException("Role non trouve avec l'id : " + id)))
                    .map(Role::getNom)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            canonicalRole = resolveCanonicalRole(requestedRoles);
        }

        RoleNom resolvedRole = canonicalRole == null ? RoleNom.ROLE_EMPLOYEE : canonicalRole;
        Role businessRole = roleRepository.findByNom(resolvedRole)
                .orElseThrow(() -> new EntityNotFoundException("Role non trouve : " + resolvedRole));
        return new HashSet<>(Set.of(businessRole));
    }

    private Utilisateur enforceSingleBusinessRole(Utilisateur utilisateur) {
        if (utilisateur == null) {
            return null;
        }

        Set<Role> currentRoles = utilisateur.getRoles();
        Set<RoleNom> roleNames = currentRoles == null
                ? Set.of()
                : currentRoles.stream()
                .map(Role::getNom)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        RoleNom canonicalRole = resolveCanonicalRole(roleNames);

        boolean alreadyCanonical = currentRoles != null
                && currentRoles.size() == 1
                && currentRoles.stream().allMatch(role -> role != null && role.getNom() == canonicalRole);
        if (alreadyCanonical) {
            return utilisateur;
        }

        Role businessRole = roleRepository.findByNom(canonicalRole)
                .orElseThrow(() -> new EntityNotFoundException("Role non trouve : " + canonicalRole));
        utilisateur.setRoles(new HashSet<>(Set.of(businessRole)));
        return utilisateurRepository.save(utilisateur);
    }

    private RoleNom resolveCanonicalRole(Set<RoleNom> roles) {
        if (roles == null || roles.isEmpty()) {
            return RoleNom.ROLE_EMPLOYEE;
        }
        if (roles.contains(RoleNom.ROLE_ADMIN)) {
            return RoleNom.ROLE_ADMIN;
        }
        if (roles.contains(RoleNom.ROLE_RH)) {
            return RoleNom.ROLE_RH;
        }
        if (roles.contains(RoleNom.ROLE_MANAGER)) {
            return RoleNom.ROLE_MANAGER;
        }
        return RoleNom.ROLE_EMPLOYEE;
    }

    @Override
    public void update2faSettings(String email, boolean enabled, String type, String secret) {
        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        utilisateur.setTwoFactorEnabled(enabled);
        utilisateur.setTwoFactorType(type != null ? TwoFactorTypeEnum.valueOf(type) : TwoFactorTypeEnum.NONE);
        utilisateur.setTwoFactorSecret(secret);

        utilisateurRepository.save(utilisateur);
        logAudit("UPDATE_2FA", email, "Parametres 2FA mis a jour : enabled=" + enabled);
    }

    @Override
    public void updateBackupCodes(String email, List<String> codes) {
        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        utilisateur.setBackupCodes(new HashSet<>(codes));
        utilisateurRepository.save(utilisateur);
        logAudit("UPDATE_BACKUP_CODES", email, "Codes de secours mis a jour.");
    }

    @Override
    public Map<String, Object> register2faFailure(String email) {
        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        int attempts = utilisateur.getFailed2faAttempts() + 1;
        utilisateur.setFailed2faAttempts(attempts);

        Map<String, Object> result = new HashMap<>();
        result.put("attempts", attempts);

        if (attempts >= 3) {
            utilisateur.setLockoutEnd(LocalDateTime.now().plusMinutes(10));
            result.put("locked", true);
            result.put("lockoutEnd", utilisateur.getLockoutEnd());
        } else {
            result.put("locked", false);
        }

        utilisateurRepository.save(utilisateur);
        return result;
    }

    @Override
    public void reset2faAttempts(String email) {
        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        utilisateur.setFailed2faAttempts(0);
        utilisateur.setLockoutEnd(null);
        utilisateurRepository.save(utilisateur);
    }

    @Override
    public void consumeBackupCode(String email, String code) {
        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        if (utilisateur.getBackupCodes() != null) {
            utilisateur.getBackupCodes().remove(code);
            utilisateurRepository.save(utilisateur);
        }
    }

    @Override
    public UtilisateurResponse assignManager(Long id, Long managerId) {
        Utilisateur utilisateur = utilisateurRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + id));

        Utilisateur manager = null;
        if (managerId != null) {
            manager = utilisateurRepository.findById(managerId)
                    .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + managerId));

            boolean managerEligible = manager.getRoles() != null && manager.getRoles().stream()
                    .map(Role::getNom)
                    .anyMatch(role -> role == RoleNom.ROLE_MANAGER || role == RoleNom.ROLE_RH);
            if (!managerEligible) {
                throw new IllegalArgumentException("Le manager doit avoir le role MANAGER ou RH.");
            }

            if (utilisateur.getEntrepriseId() != null && manager.getEntrepriseId() != null
                    && !utilisateur.getEntrepriseId().equals(manager.getEntrepriseId())) {
                throw new IllegalArgumentException("Le manager doit appartenir a la meme entreprise.");
            }
        }

        utilisateur.setManager(manager);
        utilisateurRepository.save(utilisateur);
        return utilisateurMapper.toResponse(utilisateur);
    }

    @Override
    public void changePassword(ChangePasswordRequest request) {
        String email = getCurrentUser();
        if ("SYSTEM".equals(email)) {
            throw new IllegalStateException("Aucun utilisateur authentifie trouve.");
        }

        Utilisateur utilisateur = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_EMAIL + email));

        if (!passwordEncoder.matches(request.getCurrentPassword(), utilisateur.getMotDePasse())) {
            throw new IllegalArgumentException("Le mot de passe actuel est incorrect.");
        }

        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new IllegalArgumentException("Les nouveaux mots de passe ne correspondent pas.");
        }

        utilisateur.setMotDePasse(passwordEncoder.encode(request.getNewPassword()));
        utilisateurRepository.save(utilisateur);

        logAudit("CHANGE_PASSWORD", email, "Mot de passe modifie par l'utilisateur.");
        notifyUser(utilisateur.getId(), "Mot de passe modifie", "Le mot de passe de votre compte a ete mis a jour.", "/app/" + resolveAppScope(utilisateur) + "/profil");
    }

    private UserSummaryResponse toUserSummary(Utilisateur utilisateur) {
        String prenom = utilisateur.getPrenom() != null ? utilisateur.getPrenom().trim() : "";
        String nom = utilisateur.getNom() != null ? utilisateur.getNom().trim() : "";
        String fullName = (prenom + " " + nom).trim();

        return UserSummaryResponse.builder()
                .id(utilisateur.getId())
                .nom(utilisateur.getNom())
                .prenom(utilisateur.getPrenom())
                .fullName(fullName.isBlank() ? utilisateur.getEmail() : fullName)
               .email(utilisateur.getEmail())
               .poste(utilisateur.getPoste())
               .avatarUrl(utilisateur.getAvatarUrl())
               .photo(utilisateur.getPhoto())
               .managerId(utilisateur.getManager() != null ? utilisateur.getManager().getId() : null)
                .departementId(utilisateur.getDepartement() != null ? utilisateur.getDepartement().getId() : null)
                .departement(utilisateur.getDepartement() != null ? utilisateur.getDepartement().getNom() : null)
                .equipeId(utilisateur.getEquipe() != null ? utilisateur.getEquipe().getId() : null)
                .equipe(utilisateur.getEquipe() != null ? utilisateur.getEquipe().getNom() : null)
                .entrepriseId(utilisateur.getEntreprise() != null ? utilisateur.getEntreprise().getId() : null)
                .entreprise(utilisateur.getEntreprise() != null ? utilisateur.getEntreprise().getNom() : null)
                .roles(utilisateur.getRoles() == null ? List.of() : List.of(resolveCanonicalRole(
                        utilisateur.getRoles().stream()
                                .map(Role::getNom)
                                .filter(Objects::nonNull)
                                .collect(Collectors.toSet())
                ).name()))
                .active(utilisateur.getStatut() == StatutUtilisateurEnum.ACTIF)
                .build();
    }

    private void notifyUser(Long userId, String title, String message, String actionUrl) {
        try {
            notificationService.sendToUser(userId, NotificationDispatchRequest.builder()
                    .title(title)
                    .message(message)
                    .type(NotificationType.SYSTEM)
                    .actionUrl(actionUrl)
                    .build());
        } catch (Exception exception) {
            logAudit("NOTIFICATION_FAILURE", String.valueOf(userId), "Echec de notification systeme: " + exception.getMessage());
        }
    }

    private Utilisateur resolveRhUser(Long id) {
        Utilisateur utilisateur = utilisateurRepository.findById(id)
                .map(this::enforceSingleBusinessRole)
                .orElseThrow(() -> new EntityNotFoundException(USER_NOT_FOUND_ID + id));

        if (!hasCanonicalRhRole(utilisateur)) {
            throw new IllegalStateException("Cet utilisateur n'a pas le role RH.");
        }

        return utilisateur;
    }

    private boolean hasCanonicalRhRole(Utilisateur utilisateur) {
        return utilisateur.getRoles() != null
                && utilisateur.getRoles().stream().anyMatch(role -> role.getNom() == RoleNom.ROLE_RH);
    }

    private String[] splitDisplayName(String fullName) {
        String normalized = fullName == null ? "" : fullName.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("Le nom est obligatoire.");
        }

        String[] parts = normalized.split("\\s+");
        if (parts.length == 1) {
            return new String[]{parts[0], parts[0]};
        }

        String prenom = parts[0];
        String nom = String.join(" ", java.util.Arrays.copyOfRange(parts, 1, parts.length));
        return new String[]{prenom, nom};
    }

    private RoleNom normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            throw new IllegalArgumentException("Le role est obligatoire.");
        }

        String normalized = role.trim().toUpperCase();
        if (!normalized.startsWith("ROLE_")) {
            normalized = "ROLE_" + normalized;
        }

        return RoleNom.valueOf(normalized);
    }

    private String resolveAppScope(Utilisateur utilisateur) {
        if (utilisateur.getRoles() == null) {
            return "employee";
        }
        if (utilisateur.getRoles().stream().anyMatch(role -> role.getNom() == RoleNom.ROLE_ADMIN)) {
            return "admin";
        }
        if (utilisateur.getRoles().stream().anyMatch(role -> role.getNom() == RoleNom.ROLE_RH)) {
            return "rh";
        }
        if (utilisateur.getRoles().stream().anyMatch(role -> role.getNom() == RoleNom.ROLE_MANAGER)) {
            return "manager";
        }
        return "employee";
    }

    private UserProfileResponse ensureProfileContextDefaults(UserProfileResponse profile) {
        if (profile == null) {
            return defaultProfile(null);
        }

        if (profile.getRoles() == null) {
            profile.setRoles(Set.of());
        }
        if (profile.getDepartement() == null) {
            profile.setDepartement(UserProfileResponse.DepartementDto.builder().build());
        }
        if (profile.getEquipe() == null) {
            profile.setEquipe(UserProfileResponse.EquipeDto.builder().build());
        }
        if (profile.getEntreprise() == null) {
            profile.setEntreprise(UserProfileResponse.EntrepriseDto.builder().build());
        }
        return profile;
    }

    private UserProfileResponse defaultProfile(String email) {
        return UserProfileResponse.builder()
                .email(email)
                .statut(StatutUtilisateurEnum.INACTIF.name())
                .twoFactorEnabled(false)
                .twoFactorType(TwoFactorTypeEnum.NONE.name())
                .roles(Set.of())
                .departement(UserProfileResponse.DepartementDto.builder().build())
                .equipe(UserProfileResponse.EquipeDto.builder().build())
                .entreprise(UserProfileResponse.EntrepriseDto.builder().build())
                .build();
    }
}
