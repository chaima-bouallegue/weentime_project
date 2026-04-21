package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.UserServiceClient;
import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.dto.UserSummaryDTO;
import com.weentime.weentimeapp.dto.horaire.AffectationHoraireDto;
import com.weentime.weentimeapp.dto.horaire.AssignHoraireBatchRequestDto;
import com.weentime.weentimeapp.dto.horaire.AssignHoraireRequestDto;
import com.weentime.weentimeapp.dto.horaire.CheckChevauchementResponseDto;
import com.weentime.weentimeapp.dto.horaire.EmployeeScheduleDto;
import com.weentime.weentimeapp.dto.horaire.HoraireDto;
import com.weentime.weentimeapp.dto.horaire.HoraireJourDto;
import com.weentime.weentimeapp.dto.horaire.HorairePlageDto;
import com.weentime.weentimeapp.entity.AffectationHoraire;
import com.weentime.weentimeapp.entity.HoraireJour;
import com.weentime.weentimeapp.entity.HoraireModele;
import com.weentime.weentimeapp.entity.HorairePlage;
import com.weentime.weentimeapp.entity.WorkSchedule;
import com.weentime.weentimeapp.enums.CibleType;
import com.weentime.weentimeapp.enums.StatutHoraireModele;
import com.weentime.weentimeapp.enums.TypeHoraireModele;
import com.weentime.weentimeapp.enums.TypePlageHoraire;
import com.weentime.weentimeapp.repository.AffectationHoraireRepository;
import com.weentime.weentimeapp.repository.HoraireModeleRepository;
import com.weentime.weentimeapp.repository.WorkScheduleRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class HoraireManagementService {

    private final HoraireModeleRepository horaireModeleRepository;
    private final AffectationHoraireRepository affectationHoraireRepository;
    private final WorkScheduleRepository workScheduleRepository;
    private final UserServiceClient userServiceClient;
    private final PresenceProperties presenceProperties;

    public Page<HoraireDto> getHoraires(Long currentUserId, Pageable pageable) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        Pageable safePageable = pageable == null ? Pageable.unpaged() : pageable;
        return horaireModeleRepository.findByEntrepriseIdOrderByUpdatedAtDesc(entrepriseId, safePageable)
                .map(this::toHoraireDto);
    }

    public HoraireDto getHoraireById(Long currentUserId, Long id) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        return toHoraireDto(requireHoraire(id, entrepriseId));
    }

    public HoraireDto createHoraire(Long currentUserId, HoraireDto request) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        HoraireModele entity = new HoraireModele();
        applyHorairePayload(entity, request, entrepriseId);
        entity.setId(null);
        return toHoraireDto(horaireModeleRepository.save(entity));
    }

    public HoraireDto updateHoraire(Long currentUserId, Long id, HoraireDto request) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        HoraireModele entity = requireHoraire(id, entrepriseId);
        applyHorairePayload(entity, request, entrepriseId);
        return toHoraireDto(horaireModeleRepository.save(entity));
    }

    public void deleteHoraire(Long currentUserId, Long id) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        horaireModeleRepository.delete(requireHoraire(id, entrepriseId));
    }

    public AffectationHoraireDto assignHoraire(Long currentUserId, AssignHoraireRequestDto request) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        HoraireModele horaire = requireHoraire(request.getHoraireId(), entrepriseId);
        Long cibleId = resolveScopedTargetId(currentUserId, request.getCibleType(), request.getCibleId());

        AffectationHoraire saved = affectationHoraireRepository.save(AffectationHoraire.builder()
                .horaire(horaire)
                .cibleType(request.getCibleType())
                .cibleId(cibleId)
                .dateDebut(request.getDateDebut())
                .dateFin(request.getDateFin())
                .motif(request.getMotif())
                .priorite(priorityFor(request.getCibleType()))
                .entrepriseId(entrepriseId)
                .build());

        return toAffectationDto(saved);
    }

    public List<AffectationHoraireDto> assignHoraireBatch(Long currentUserId, AssignHoraireBatchRequestDto request) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        HoraireModele horaire = requireHoraire(request.getHoraireId(), entrepriseId);
        List<AffectationHoraireDto> result = new ArrayList<>();

        for (Long cibleId : request.getCibleIds()) {
            AffectationHoraire saved = affectationHoraireRepository.save(AffectationHoraire.builder()
                    .horaire(horaire)
                    .cibleType(request.getCibleType())
                    .cibleId(cibleId)
                    .dateDebut(request.getDateDebut())
                    .dateFin(request.getDateFin())
                    .motif(request.getMotif())
                    .priorite(priorityFor(request.getCibleType()))
                    .entrepriseId(entrepriseId)
                    .build());
            result.add(toAffectationDto(saved));
        }

        return result;
    }

    public Page<AffectationHoraireDto> getAffectations(Long currentUserId, Pageable pageable) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        Pageable safePageable = pageable == null ? Pageable.unpaged() : pageable;
        return affectationHoraireRepository.findByEntrepriseIdOrderByCreatedAtDesc(entrepriseId, safePageable)
                .map(this::toAffectationDto);
    }

    public void deleteAffectation(Long currentUserId, Long id) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        AffectationHoraire affectation = affectationHoraireRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Affectation horaire non trouvee : " + id));
        if (!Objects.equals(affectation.getEntrepriseId(), entrepriseId)) {
            throw new IllegalStateException("Cette affectation n'appartient pas a votre entreprise.");
        }
        affectationHoraireRepository.delete(affectation);
    }

    public CheckChevauchementResponseDto checkChevauchement(
            Long currentUserId,
            CibleType cibleType,
            Long cibleId,
            Integer priorite,
            LocalDate dateDebut,
            LocalDate dateFin
    ) {
        Long entrepriseId = requireEntrepriseId(currentUserId);
        Long scopedTargetId = resolveScopedTargetId(currentUserId, cibleType, cibleId);

        boolean overlap = affectationHoraireRepository.findByEntrepriseIdAndCibleTypeAndCibleId(entrepriseId, cibleType, scopedTargetId)
                .stream()
                .anyMatch(existing -> overlaps(existing.getDateDebut(), existing.getDateFin(), dateDebut, dateFin));

        return CheckChevauchementResponseDto.builder()
                .chevauchementDetecte(overlap)
                .build();
    }

    @Transactional(readOnly = true)
    public HoraireDto resolveHoraire(Long currentUserId, String email) {
        UserSummaryDTO targetUser = resolveTargetUser(currentUserId, email);
        return resolveEffectiveHoraire(targetUser, LocalDate.now());
    }

    @Transactional(readOnly = true)
    public List<EmployeeScheduleDto> getTeamSchedules(Long managerId) {
        return safeTeamMembers(managerId).stream()
                .map(member -> EmployeeScheduleDto.builder()
                        .userId(member.getId())
                        .firstName(member.getPrenom())
                        .lastName(member.getNom())
                        .initials(initialsFor(member))
                        .color(colorFor(member.getEmail()))
                        .email(member.getEmail())
                        .horaire(resolveEffectiveHoraire(member, LocalDate.now()))
                        .build())
                .toList();
    }

    @Transactional(readOnly = true)
    public WorkSchedule resolveEffectiveWorkSchedule(Long utilisateurId, LocalDate date) {
        LocalDate effectiveDate = date == null ? LocalDate.now() : date;
        UserSummaryDTO user = safeUser(utilisateurId);
        if (user == null) {
            return workScheduleRepository.findByUtilisateurId(utilisateurId)
                    .orElseGet(() -> defaultWorkSchedule(utilisateurId));
        }

        HoraireDto horaire = resolveEffectiveHoraire(user, effectiveDate);
        Set<DayOfWeek> workingDays = horaire.getJours() == null
                ? Set.copyOf(presenceProperties.getDefaults().getWorkingDays())
                : horaire.getJours().stream()
                .filter(jour -> Boolean.TRUE.equals(jour.getEstTravaille()))
                .map(jour -> parseJour(jour.getJourSemaine()))
                .collect(Collectors.toSet());

        HoraireJourDto currentDay = horaire.getJours() == null
                ? null
                : horaire.getJours().stream()
                .filter(jour -> parseJour(jour.getJourSemaine()) == effectiveDate.getDayOfWeek())
                .findFirst()
                .orElse(null);

        return WorkSchedule.builder()
                .utilisateurId(utilisateurId)
                .heureDebut(firstTravelStart(currentDay).orElse(presenceProperties.getDefaults().getStartTime()))
                .heureFin(lastTravelEnd(currentDay).orElse(presenceProperties.getDefaults().getEndTime()))
                .joursTravail(workingDays.isEmpty() ? Set.copyOf(presenceProperties.getDefaults().getWorkingDays()) : workingDays)
                .toleranceRetardMinutes(presenceProperties.getDefaults().getToleranceMinutes())
                .build();
    }

    private void applyHorairePayload(HoraireModele entity, HoraireDto request, Long entrepriseId) {
        if (request == null) {
            throw new IllegalArgumentException("Le payload horaire est obligatoire.");
        }

        entity.setNom(blankToDefault(request.getNom(), "Horaire WeenTime"));
        entity.setType(parseTypeHoraire(request.getType()));
        entity.setHeuresHebdo(request.getHeuresHebdo() == null ? 35.0 : request.getHeuresHebdo());
        entity.setIsDefaut(Boolean.TRUE.equals(request.getIsDefaut()));
        entity.setStatut(parseStatutHoraire(request.getStatut()));
        entity.setEntrepriseId(entrepriseId);

        if (Boolean.TRUE.equals(entity.getIsDefaut())) {
            clearDefaultFlag(entrepriseId, entity.getId());
        }

        entity.getJours().clear();
        for (HoraireJourDto jourDto : safeList(request.getJours())) {
            HoraireJour jour = HoraireJour.builder()
                    .horaire(entity)
                    .jourSemaine(parseJour(jourDto.getJourSemaine()))
                    .estTravaille(Boolean.TRUE.equals(jourDto.getEstTravaille()))
                    .build();

            List<HorairePlage> plages = safeList(jourDto.getPlages()).stream()
                    .map(plageDto -> HorairePlage.builder()
                            .jour(jour)
                            .type(parseTypePlage(plageDto.getType()))
                            .heureDebut(parseTime(plageDto.getHeureDebut()))
                            .heureFin(parseTime(plageDto.getHeureFin()))
                            .ordre(plageDto.getOrdre() == null ? 0 : plageDto.getOrdre())
                            .build())
                    .sorted(Comparator.comparing(HorairePlage::getOrdre))
                    .toList();

            jour.setPlages(new ArrayList<>(plages));
            entity.getJours().add(jour);
        }
    }

    private HoraireModele requireHoraire(Long id, Long entrepriseId) {
        HoraireModele horaire = horaireModeleRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Horaire non trouve : " + id));
        if (!Objects.equals(horaire.getEntrepriseId(), entrepriseId)) {
            throw new IllegalStateException("Cet horaire n'appartient pas a votre entreprise.");
        }
        return horaire;
    }

    private Long requireEntrepriseId(Long currentUserId) {
        UserSummaryDTO user = safeUser(currentUserId);
        if (user == null || user.getEntrepriseId() == null) {
            throw new IllegalStateException("Impossible de determiner l'entreprise courante.");
        }
        return user.getEntrepriseId();
    }

    private UserSummaryDTO resolveTargetUser(Long currentUserId, String email) {
        UserSummaryDTO current = safeUser(currentUserId);
        if (email == null || email.isBlank()) {
            if (current == null) {
                throw new EntityNotFoundException("Utilisateur courant introuvable.");
            }
            return current;
        }

        return userServiceClient.getActiveUsers().stream()
                .filter(Objects::nonNull)
                .filter(user -> email.equalsIgnoreCase(user.getEmail()))
                .filter(user -> current == null || Objects.equals(user.getEntrepriseId(), current.getEntrepriseId()))
                .findFirst()
                .orElseThrow(() -> new EntityNotFoundException("Utilisateur introuvable pour l'email : " + email));
    }

    private HoraireDto resolveEffectiveHoraire(UserSummaryDTO user, LocalDate date) {
        AffectationHoraire affectation = resolveAffectation(user, date).orElse(null);
        if (affectation != null) {
            return toHoraireDto(affectation.getHoraire());
        }

        if (user.getEntrepriseId() != null) {
            Optional<HoraireModele> defaultModel = horaireModeleRepository
                    .findFirstByEntrepriseIdAndIsDefautTrueAndStatutOrderByUpdatedAtDesc(user.getEntrepriseId(), StatutHoraireModele.ACTIF);
            if (defaultModel.isPresent()) {
                return toHoraireDto(defaultModel.get());
            }
        }

        return workScheduleRepository.findByUtilisateurId(user.getId())
                .map(this::toHoraireDto)
                .orElseGet(() -> toHoraireDto(defaultWorkSchedule(user.getId())));
    }

    private Optional<AffectationHoraire> resolveAffectation(UserSummaryDTO user, LocalDate date) {
        if (user == null || user.getEntrepriseId() == null) {
            return Optional.empty();
        }

        return affectationHoraireRepository.findByEntrepriseId(user.getEntrepriseId()).stream()
                .filter(item -> matchesUser(item, user))
                .filter(item -> {
                    if (item.getDateDebut() != null && date != null && date.isBefore(item.getDateDebut())) {
                        return false;
                    }
                    return item.getDateFin() == null || date == null || !date.isAfter(item.getDateFin());
                })
                .sorted(Comparator.comparing(AffectationHoraire::getPriorite).reversed()
                        .thenComparing(AffectationHoraire::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .findFirst();
    }

    private boolean matchesUser(AffectationHoraire affectation, UserSummaryDTO user) {
        return switch (affectation.getCibleType()) {
            case UTILISATEUR -> Objects.equals(affectation.getCibleId(), user.getId());
            case EQUIPE -> Objects.equals(affectation.getCibleId(), user.getEquipeId());
            case ENTREPRISE -> Objects.equals(affectation.getCibleId(), user.getEntrepriseId()) || Objects.equals(affectation.getCibleId(), 0L);
        };
    }

    private boolean overlaps(LocalDate leftStart, LocalDate leftEnd, LocalDate rightStart, LocalDate rightEnd) {
        LocalDate effectiveLeftStart = leftStart == null ? LocalDate.MIN : leftStart;
        LocalDate effectiveLeftEnd = leftEnd == null ? LocalDate.MAX : leftEnd;
        LocalDate effectiveRightStart = rightStart == null ? LocalDate.MIN : rightStart;
        LocalDate effectiveRightEnd = rightEnd == null ? LocalDate.MAX : rightEnd;
        return !effectiveLeftEnd.isBefore(effectiveRightStart) && !effectiveRightEnd.isBefore(effectiveLeftStart);
    }

    private Long resolveScopedTargetId(Long currentUserId, CibleType cibleType, Long cibleId) {
        if (cibleType == CibleType.ENTREPRISE) {
            return requireEntrepriseId(currentUserId);
        }
        if (cibleId == null) {
            throw new IllegalArgumentException("La cible est obligatoire.");
        }
        return cibleId;
    }

    private int priorityFor(CibleType cibleType) {
        return switch (cibleType) {
            case UTILISATEUR -> 3;
            case EQUIPE -> 2;
            case ENTREPRISE -> 1;
        };
    }

    private void clearDefaultFlag(Long entrepriseId, Long currentId) {
        Page<HoraireModele> page = horaireModeleRepository.findByEntrepriseIdOrderByUpdatedAtDesc(entrepriseId, Pageable.unpaged());
        for (HoraireModele item : page.getContent()) {
            if (!Objects.equals(item.getId(), currentId) && Boolean.TRUE.equals(item.getIsDefaut())) {
                item.setIsDefaut(Boolean.FALSE);
            }
        }
    }

    private HoraireDto toHoraireDto(HoraireModele entity) {
        return HoraireDto.builder()
                .id(entity.getId())
                .nom(entity.getNom())
                .type(entity.getType().name())
                .heuresHebdo(entity.getHeuresHebdo())
                .jours(entity.getJours().stream().map(this::toHoraireJourDto).toList())
                .isDefaut(entity.getIsDefaut())
                .statut(entity.getStatut().name())
                .entrepriseId(entity.getEntrepriseId())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }

    private HoraireJourDto toHoraireJourDto(HoraireJour entity) {
        return HoraireJourDto.builder()
                .id(entity.getId())
                .jourSemaine(toJourLabel(entity.getJourSemaine()))
                .estTravaille(entity.getEstTravaille())
                .plages(entity.getPlages().stream().map(this::toHorairePlageDto).toList())
                .build();
    }

    private HorairePlageDto toHorairePlageDto(HorairePlage entity) {
        return HorairePlageDto.builder()
                .id(entity.getId())
                .type(entity.getType().name())
                .heureDebut(entity.getHeureDebut().toString())
                .heureFin(entity.getHeureFin().toString())
                .ordre(entity.getOrdre())
                .build();
    }

    private HoraireDto toHoraireDto(WorkSchedule entity) {
        List<HoraireJourDto> jours = java.util.Arrays.stream(DayOfWeek.values())
                .map(day -> HoraireJourDto.builder()
                        .jourSemaine(toJourLabel(day))
                        .estTravaille(entity.getJoursTravail() != null && entity.getJoursTravail().contains(day))
                        .plages(entity.getJoursTravail() != null && entity.getJoursTravail().contains(day)
                                ? List.of(HorairePlageDto.builder()
                                .type(TypePlageHoraire.TRAVAIL.name())
                                .heureDebut(entity.getHeureDebut().toString())
                                .heureFin(entity.getHeureFin().toString())
                                .ordre(1)
                                .build())
                                : List.of())
                        .build())
                .toList();

        return HoraireDto.builder()
                .id(entity.getId())
                .nom("Horaire par defaut")
                .type(TypeHoraireModele.FIXE.name())
                .heuresHebdo(35.0)
                .jours(jours)
                .isDefaut(Boolean.TRUE)
                .statut(StatutHoraireModele.ACTIF.name())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }

    private AffectationHoraireDto toAffectationDto(AffectationHoraire entity) {
        return AffectationHoraireDto.builder()
                .id(entity.getId())
                .horaireId(entity.getHoraire().getId())
                .horaireNom(entity.getHoraire().getNom())
                .cibleType(entity.getCibleType().name())
                .cibleId(entity.getCibleId())
                .cibleLabel(null)
                .dateDebut(entity.getDateDebut())
                .dateFin(entity.getDateFin())
                .motif(entity.getMotif())
                .priorite(entity.getPriorite())
                .entrepriseId(entity.getEntrepriseId())
                .createdAt(entity.getCreatedAt())
                .build();
    }

    private UserSummaryDTO safeUser(Long userId) {
        try {
            return userServiceClient.getUserById(userId);
        } catch (Exception exception) {
            return null;
        }
    }

    private List<UserSummaryDTO> safeTeamMembers(Long managerId) {
        try {
            List<UserSummaryDTO> members = userServiceClient.getTeamMembers(managerId);
            return members == null ? List.of() : members.stream().filter(Objects::nonNull).toList();
        } catch (Exception exception) {
            return List.of();
        }
    }

    private TypeHoraireModele parseTypeHoraire(String value) {
        return value == null ? TypeHoraireModele.FIXE : TypeHoraireModele.valueOf(value.toUpperCase(Locale.ROOT));
    }

    private StatutHoraireModele parseStatutHoraire(String value) {
        return value == null ? StatutHoraireModele.ACTIF : StatutHoraireModele.valueOf(value.toUpperCase(Locale.ROOT));
    }

    private TypePlageHoraire parseTypePlage(String value) {
        return value == null ? TypePlageHoraire.TRAVAIL : TypePlageHoraire.valueOf(value.toUpperCase(Locale.ROOT));
    }

    private DayOfWeek parseJour(String value) {
        if (value == null) {
            return DayOfWeek.MONDAY;
        }

        return switch (value.toUpperCase(Locale.ROOT)) {
            case "LUNDI", "MONDAY" -> DayOfWeek.MONDAY;
            case "MARDI", "TUESDAY" -> DayOfWeek.TUESDAY;
            case "MERCREDI", "WEDNESDAY" -> DayOfWeek.WEDNESDAY;
            case "JEUDI", "THURSDAY" -> DayOfWeek.THURSDAY;
            case "VENDREDI", "FRIDAY" -> DayOfWeek.FRIDAY;
            case "SAMEDI", "SATURDAY" -> DayOfWeek.SATURDAY;
            case "DIMANCHE", "SUNDAY" -> DayOfWeek.SUNDAY;
            default -> DayOfWeek.valueOf(value.toUpperCase(Locale.ROOT));
        };
    }

    private String toJourLabel(DayOfWeek dayOfWeek) {
        return switch (dayOfWeek) {
            case MONDAY -> "LUNDI";
            case TUESDAY -> "MARDI";
            case WEDNESDAY -> "MERCREDI";
            case THURSDAY -> "JEUDI";
            case FRIDAY -> "VENDREDI";
            case SATURDAY -> "SAMEDI";
            case SUNDAY -> "DIMANCHE";
        };
    }

    private LocalTime parseTime(String value) {
        if (value == null || value.isBlank()) {
            return LocalTime.of(9, 0);
        }
        return LocalTime.parse(value);
    }

    private Optional<LocalTime> firstTravelStart(HoraireJourDto jour) {
        if (jour == null || jour.getPlages() == null) {
            return Optional.empty();
        }

        return jour.getPlages().stream()
                .filter(plage -> TypePlageHoraire.TRAVAIL.name().equalsIgnoreCase(plage.getType()))
                .map(plage -> parseTime(plage.getHeureDebut()))
                .min(LocalTime::compareTo);
    }

    private Optional<LocalTime> lastTravelEnd(HoraireJourDto jour) {
        if (jour == null || jour.getPlages() == null) {
            return Optional.empty();
        }

        return jour.getPlages().stream()
                .filter(plage -> TypePlageHoraire.TRAVAIL.name().equalsIgnoreCase(plage.getType()))
                .map(plage -> parseTime(plage.getHeureFin()))
                .max(LocalTime::compareTo);
    }

    private String initialsFor(UserSummaryDTO user) {
        String seed = blankToDefault(user.getFullName(), blankToDefault(user.getEmail(), "WT"));
        return java.util.Arrays.stream(seed.split("\\s+"))
                .filter(part -> !part.isBlank())
                .limit(2)
                .map(part -> part.substring(0, 1).toUpperCase(Locale.ROOT))
                .collect(Collectors.joining());
    }

    private String colorFor(String seed) {
        String effectiveSeed = blankToDefault(seed, "weentime");
        int hash = 0;
        for (char character : effectiveSeed.toCharArray()) {
            hash = character + ((hash << 5) - hash);
        }
        String color = Integer.toHexString(hash & 0x00FFFFFF).toUpperCase(Locale.ROOT);
        String suffix = color.length() > 6 ? color.substring(color.length() - 6) : color;
        return "#" + "000000".substring(Math.min(suffix.length(), 6)) + suffix;
    }

    private WorkSchedule defaultWorkSchedule(Long utilisateurId) {
        return WorkSchedule.builder()
                .utilisateurId(utilisateurId)
                .heureDebut(presenceProperties.getDefaults().getStartTime())
                .heureFin(presenceProperties.getDefaults().getEndTime())
                .joursTravail(Set.copyOf(presenceProperties.getDefaults().getWorkingDays()))
                .toleranceRetardMinutes(presenceProperties.getDefaults().getToleranceMinutes())
                .build();
    }

    private <T> List<T> safeList(List<T> items) {
        return items == null ? List.of() : items;
    }

    private String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
