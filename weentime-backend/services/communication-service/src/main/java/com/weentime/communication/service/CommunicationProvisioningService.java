package com.weentime.communication.service;

import com.weentime.communication.dto.CommunicationBootstrapResponse;
import com.weentime.communication.dto.OrganisationEnterpriseSyncSnapshot;
import com.weentime.communication.dto.OrganisationTeamSyncSnapshot;
import com.weentime.communication.dto.OrganisationUserSummary;
import com.weentime.communication.dto.ProvisioningSyncResponse;
import com.weentime.communication.entity.ChannelMemberRole;
import com.weentime.communication.entity.ChannelType;
import com.weentime.communication.entity.ChannelVisibility;
import com.weentime.communication.entity.CommChannel;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommChannelMemberId;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.repository.CommChannelRepository;
import com.weentime.communication.security.CommunicationUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CommunicationProvisioningService {

    private static final String DEFAULT_GENERAL_SLUG = "general";
    private static final String DEFAULT_ANNOUNCEMENTS_SLUG = "annonces";
    private static final String DEFAULT_RH_SLUG = "rh";
    private static final String DEFAULT_SUPPORT_SLUG = "support";
    private static final String DEFAULT_MANAGERS_SLUG = "managers";

    private static final String WORKFLOW_CONGES = "CONGES";
    private static final String WORKFLOW_TELETRAVAIL = "TELETRAVAIL";
    private static final String WORKFLOW_DOCUMENTS = "DOCUMENTS";
    private static final String WORKFLOW_SUPPORT_RH = "SUPPORT_RH";

    private final CommChannelRepository channelRepository;
    private final CommChannelMemberRepository channelMemberRepository;
    private final OrganisationInternalService organisationInternalService;
    private final AuditService auditService;

    @Transactional
    public ProvisioningSyncResponse syncCurrentEnterprise(CommunicationUserPrincipal currentUser) {
        assertAdmin(currentUser);
        return syncEnterprise(currentUser.entrepriseId(), currentUser);
    }

    @Transactional
    public ProvisioningSyncResponse syncEnterprise(Long entrepriseId, CommunicationUserPrincipal currentUser) {
        assertAdmin(currentUser);
        if (!Objects.equals(currentUser.entrepriseId(), entrepriseId)) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_SYNC_TENANT_FORBIDDEN",
                    "Cross-tenant communication sync is not allowed.", Map.of("entrepriseId", entrepriseId));
        }
        EnterpriseContext context = loadContext(entrepriseId);
        SyncAccumulator accumulator = new SyncAccumulator(entrepriseId);
        repairMembershipTenantMismatches(entrepriseId);
        provisionChannelsAndMemberships(context, currentUser, accumulator);

        auditService.record(entrepriseId, currentUser.userId(), "ENTERPRISE", String.valueOf(entrepriseId),
                "communication.sync", Map.of(
                        "channelsCreated", accumulator.channelsCreated,
                        "channelsUpdated", accumulator.channelsUpdated,
                        "membersAdded", accumulator.membersAdded,
                        "warnings", accumulator.warnings
                ));

        return ProvisioningSyncResponse.builder()
                .entrepriseId(entrepriseId)
                .channelsCreated(accumulator.channelsCreated)
                .channelsUpdated(accumulator.channelsUpdated)
                .channelsArchived(accumulator.channelsArchived)
                .membersAdded(accumulator.membersAdded)
                .membersRemoved(accumulator.membersRemoved)
                .warnings(List.copyOf(accumulator.warnings))
                .build();
    }

    @Transactional
    public CommunicationBootstrapResponse bootstrapCurrentEnterprise(CommunicationUserPrincipal currentUser) {
        assertAdmin(currentUser);
        EnterpriseContext context = loadContext(currentUser.entrepriseId());
        SyncAccumulator accumulator = new SyncAccumulator(context.entrepriseId());
        Set<Long> repairedUsers = bootstrapEnterprise(context, currentUser, accumulator);

        auditService.record(context.entrepriseId(), currentUser.userId(), "ENTERPRISE", String.valueOf(context.entrepriseId()),
                "communication.bootstrap", Map.of(
                        "createdChannels", accumulator.channelsCreated,
                        "membershipsCreated", accumulator.membersAdded,
                        "repairedUsers", repairedUsers.size(),
                        "warnings", accumulator.warnings
                ));

        return CommunicationBootstrapResponse.builder()
                .entrepriseId(context.entrepriseId())
                .createdChannels(accumulator.channelsCreated)
                .membershipsCreated(accumulator.membersAdded)
                .repairedUsers(repairedUsers.size())
                .warnings(List.copyOf(accumulator.warnings))
                .build();
    }

    @Transactional
    public void ensureEnterpriseBootstrapForUser(CommunicationUserPrincipal currentUser) {
        EnterpriseContext context = loadContext(currentUser.entrepriseId());
        SyncAccumulator accumulator = new SyncAccumulator(context.entrepriseId());
        bootstrapEnterprise(context, currentUser, accumulator);
    }

    private Set<Long> bootstrapEnterprise(
            EnterpriseContext context,
            CommunicationUserPrincipal currentUser,
            SyncAccumulator accumulator
    ) {
        Set<Long> repairedUsers = repairMembershipTenantMismatches(context.entrepriseId());
        Set<Long> activeMembersBefore = findActiveMemberUserIds(context.entrepriseId());
        Set<Long> orphanUsers = context.activeUsers().keySet().stream()
                .filter(userId -> !activeMembersBefore.contains(userId))
                .collect(Collectors.toCollection(LinkedHashSet::new));

        provisionChannelsAndMemberships(context, currentUser, accumulator);

        Set<Long> activeMembersAfter = findActiveMemberUserIds(context.entrepriseId());
        orphanUsers.stream()
                .filter(activeMembersAfter::contains)
                .forEach(repairedUsers::add);
        if (context.activeUsers().isEmpty()) {
            accumulator.warnings.add("Aucun utilisateur actif n'a ete retourne par l'organisation pour cette entreprise.");
        }
        return repairedUsers;
    }

    private EnterpriseContext loadContext(Long entrepriseId) {
        OrganisationEnterpriseSyncSnapshot snapshot = organisationInternalService.getEnterpriseSyncSnapshot(entrepriseId);
        Map<Long, OrganisationUserSummary> activeUsers = snapshot.activeUsers() == null
                ? Map.of()
                : snapshot.activeUsers().stream()
                .filter(Objects::nonNull)
                .filter(OrganisationUserSummary::active)
                .filter(user -> user.id() != null)
                .filter(user -> Objects.equals(user.entrepriseId(), entrepriseId))
                .collect(Collectors.toMap(OrganisationUserSummary::id, Function.identity(), (left, right) -> left, LinkedHashMap::new));

        List<OrganisationTeamSyncSnapshot> activeTeams = snapshot.teams() == null
                ? List.of()
                : snapshot.teams().stream()
                .filter(Objects::nonNull)
                .filter(team -> Boolean.TRUE.equals(team.active()))
                .filter(team -> team.id() != null)
                .filter(team -> Objects.equals(team.entrepriseId(), entrepriseId))
                .toList();

        return new EnterpriseContext(entrepriseId, snapshot, activeUsers, activeTeams);
    }

    private void provisionChannelsAndMemberships(
            EnterpriseContext context,
            CommunicationUserPrincipal currentUser,
            SyncAccumulator accumulator
    ) {
        syncDefaultChannels(context, currentUser, accumulator);
        syncCompanyAndSmartChannels(context, currentUser, accumulator);
        syncTeamChannels(context, currentUser, accumulator);
    }

    private void syncDefaultChannels(
            EnterpriseContext context,
            CommunicationUserPrincipal currentUser,
            SyncAccumulator accumulator
    ) {
        CommChannel generalChannel = upsertDefaultChannel(
                context.entrepriseId(),
                currentUser.userId(),
                DEFAULT_GENERAL_SLUG,
                "general",
                "Canal principal de l'entreprise",
                accumulator
        );
        syncMemberships(generalChannel, context.activeUsers().values(), user -> ChannelMemberRole.MEMBER, accumulator);

        CommChannel announcementsChannel = upsertDefaultChannel(
                context.entrepriseId(),
                currentUser.userId(),
                DEFAULT_ANNOUNCEMENTS_SLUG,
                "annonces",
                "Annonces et informations officielles",
                accumulator
        );
        syncMemberships(announcementsChannel, context.activeUsers().values(), this::resolveAnnouncementsRole, accumulator);

        CommChannel supportChannel = upsertDefaultChannel(
                context.entrepriseId(),
                currentUser.userId(),
                DEFAULT_SUPPORT_SLUG,
                "support",
                "Support interne et entraide quotidienne",
                accumulator
        );
        syncMemberships(supportChannel, context.activeUsers().values(), user -> ChannelMemberRole.MEMBER, accumulator);

        CommChannel rhChannel = upsertDefaultChannel(
                context.entrepriseId(),
                currentUser.userId(),
                DEFAULT_RH_SLUG,
                "rh",
                "Echanges reserves aux RH et administrateurs",
                accumulator
        );
        syncMemberships(rhChannel, selectUsersByRoles(context.activeUsers().values(), Set.of("RH", "ADMIN")), this::resolveAdministrativeRole, accumulator);

        CommChannel managersChannel = upsertDefaultChannel(
                context.entrepriseId(),
                currentUser.userId(),
                DEFAULT_MANAGERS_SLUG,
                "managers",
                "Coordination management et relais d'equipe",
                accumulator
        );
        syncMemberships(managersChannel, selectUsersByRoles(context.activeUsers().values(), Set.of("MANAGER", "ADMIN")), this::resolveAdministrativeRole, accumulator);

    }

    private void syncCompanyAndSmartChannels(
            EnterpriseContext context,
            CommunicationUserPrincipal currentUser,
            SyncAccumulator accumulator
    ) {
        CommChannel companyChannel = upsertCompanyChannel(context.snapshot(), currentUser, accumulator);
        syncMemberships(companyChannel, context.activeUsers().values(), this::resolveCompanyRole, accumulator);

        CommChannel congesChannel = upsertSmartChannel(context.snapshot(), currentUser, WORKFLOW_CONGES, "conges", "Canal RH pour les conges", accumulator);
        syncMemberships(congesChannel, selectRhAndManagers(context.activeUsers().values()), this::resolveSmartRole, accumulator);

        CommChannel teletravailChannel = upsertSmartChannel(context.snapshot(), currentUser, WORKFLOW_TELETRAVAIL, "teletravail", "Canal RH pour le teletravail", accumulator);
        syncMemberships(teletravailChannel, selectRhAndManagers(context.activeUsers().values()), this::resolveSmartRole, accumulator);

        CommChannel documentsChannel = upsertSmartChannel(context.snapshot(), currentUser, WORKFLOW_DOCUMENTS, "documents", "Canal RH pour les documents", accumulator);
        syncMemberships(documentsChannel, selectRhAndManagers(context.activeUsers().values()), this::resolveSmartRole, accumulator);

        CommChannel supportRhChannel = upsertSmartChannel(context.snapshot(), currentUser, WORKFLOW_SUPPORT_RH, "support-rh", "Support RH et suivi des demandes", accumulator);
        syncSupportRhMemberships(supportRhChannel, context.activeUsers().values(), accumulator);
        accumulator.warnings.add("Le canal #support-rh synchronise uniquement les RH et conserve les participants existants; l'ajout automatique des employes se fera lors du flux support dedie.");
    }

    private void syncTeamChannels(
            EnterpriseContext context,
            CommunicationUserPrincipal currentUser,
            SyncAccumulator accumulator
    ) {
        Set<Long> activeTeamIds = new LinkedHashSet<>();
        for (OrganisationTeamSyncSnapshot team : context.teams()) {
            activeTeamIds.add(team.id());
            CommChannel teamChannel = upsertTeamChannel(team, currentUser, accumulator);

            LinkedHashSet<OrganisationUserSummary> teamMembers = new LinkedHashSet<>();
            if (team.members() != null) {
                team.members().stream()
                        .filter(Objects::nonNull)
                        .filter(OrganisationUserSummary::active)
                        .forEach(teamMembers::add);
            }
            if (team.managerId() != null && context.activeUsers().containsKey(team.managerId())) {
                teamMembers.add(context.activeUsers().get(team.managerId()));
            }

            syncMemberships(
                    teamChannel,
                    teamMembers,
                    user -> Objects.equals(user.id(), team.managerId()) ? ChannelMemberRole.ADMIN : ChannelMemberRole.MEMBER,
                    accumulator
            );
        }

        archiveStaleTeamChannels(context.entrepriseId(), activeTeamIds, accumulator);
    }

    private void archiveStaleTeamChannels(Long entrepriseId, Set<Long> activeTeamIds, SyncAccumulator accumulator) {
        Instant now = Instant.now();
        channelRepository.findByEntrepriseIdAndTypeAndIsArchivedFalse(entrepriseId, ChannelType.TEAM).stream()
                .filter(channel -> channel.getEquipeId() != null)
                .filter(channel -> !activeTeamIds.contains(channel.getEquipeId()))
                .forEach(channel -> {
                    channel.setArchived(true);
                    channel.setArchivedAt(now);
                    channel.setUpdatedAt(now);
                    channelRepository.save(channel);
                    accumulator.channelsArchived++;
                });
    }

    private CommChannel upsertCompanyChannel(OrganisationEnterpriseSyncSnapshot snapshot, CommunicationUserPrincipal currentUser, SyncAccumulator accumulator) {
        return upsertChannel(
                channelRepository.findFirstByEntrepriseIdAndType(snapshot.entrepriseId(), ChannelType.COMPANY).orElse(null),
                snapshot.entrepriseId(),
                ChannelType.COMPANY,
                ChannelVisibility.PUBLIC,
                "company",
                snapshot.entrepriseNom() == null || snapshot.entrepriseNom().isBlank() ? "entreprise" : snapshot.entrepriseNom().trim(),
                "Canal entreprise " + (snapshot.entrepriseNom() == null ? "" : snapshot.entrepriseNom()),
                null,
                null,
                currentUser.userId(),
                accumulator
        );
    }

    private CommChannel upsertTeamChannel(OrganisationTeamSyncSnapshot team, CommunicationUserPrincipal currentUser, SyncAccumulator accumulator) {
        return upsertChannel(
                channelRepository.findFirstByEntrepriseIdAndTypeAndEquipeId(team.entrepriseId(), ChannelType.TEAM, team.id()).orElse(null),
                team.entrepriseId(),
                ChannelType.TEAM,
                ChannelVisibility.PUBLIC,
                slugify(team.nom()),
                team.nom(),
                team.description(),
                team.id(),
                null,
                currentUser.userId(),
                accumulator
        );
    }

    private CommChannel upsertSmartChannel(
            OrganisationEnterpriseSyncSnapshot snapshot,
            CommunicationUserPrincipal currentUser,
            String workflowType,
            String name,
            String description,
            SyncAccumulator accumulator
    ) {
        return upsertChannel(
                channelRepository.findFirstByEntrepriseIdAndTypeAndWorkflowType(
                        snapshot.entrepriseId(),
                        ChannelType.SMART,
                        workflowType
                ).orElse(null),
                snapshot.entrepriseId(),
                ChannelType.SMART,
                ChannelVisibility.PUBLIC,
                workflowType.toLowerCase().replace('_', '-'),
                name,
                description,
                null,
                workflowType,
                currentUser.userId(),
                accumulator
        );
    }

    private CommChannel upsertDefaultChannel(
            Long entrepriseId,
            Long actorId,
            String slug,
            String name,
            String description,
            SyncAccumulator accumulator
    ) {
        return upsertChannel(
                channelRepository.findFirstByEntrepriseIdAndTypeAndSlugIgnoreCase(entrepriseId, ChannelType.STANDARD, slug).orElse(null),
                entrepriseId,
                ChannelType.STANDARD,
                ChannelVisibility.PUBLIC,
                slug,
                name,
                description,
                null,
                null,
                actorId,
                accumulator
        );
    }

    private CommChannel upsertChannel(
            CommChannel channel,
            Long entrepriseId,
            ChannelType type,
            ChannelVisibility visibility,
            String slug,
            String name,
            String description,
            Long equipeId,
            String workflowType,
            Long actorId,
            SyncAccumulator accumulator
    ) {
        Instant now = Instant.now();
        boolean created = channel == null;
        if (created) {
            channel = new CommChannel();
            channel.setEntrepriseId(entrepriseId);
            channel.setCreatedBy(actorId);
            channel.setCreatedAt(now);
            accumulator.channelsCreated++;
        } else {
            accumulator.channelsUpdated++;
        }

        channel.setType(type);
        channel.setVisibility(visibility);
        channel.setSlug(slug);
        channel.setName(name);
        channel.setDescription(description);
        channel.setEquipeId(equipeId);
        channel.setWorkflowType(workflowType);
        channel.setPrivate(false);
        channel.setArchived(false);
        channel.setArchivedAt(null);
        channel.setUpdatedAt(now);
        return channelRepository.save(channel);
    }

    private void syncSupportRhMemberships(
            CommChannel channel,
            Collection<OrganisationUserSummary> activeUsers,
            SyncAccumulator accumulator
    ) {
        List<CommChannelMember> existingMembers = channelMemberRepository.findByChannel_IdAndEntrepriseId(channel.getId(), channel.getEntrepriseId());
        Set<Long> existingNonRhParticipants = existingMembers.stream()
                .map(member -> member.getId().getUserId())
                .filter(Objects::nonNull)
                .filter(userId -> existingMembers.stream()
                        .filter(member -> Objects.equals(member.getId().getUserId(), userId))
                        .map(member -> member.getRole() == ChannelMemberRole.ADMIN)
                        .findFirst()
                        .orElse(false) == false)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        LinkedHashMap<Long, OrganisationUserSummary> targetUsers = new LinkedHashMap<>();
        for (OrganisationUserSummary user : activeUsers) {
            if (hasRole(user, "RH")) {
                targetUsers.put(user.id(), user);
            }
        }
        for (OrganisationUserSummary user : activeUsers) {
            if (existingNonRhParticipants.contains(user.id())) {
                targetUsers.put(user.id(), user);
            }
        }

        syncMemberships(channel, targetUsers.values(), user -> hasRole(user, "RH") ? ChannelMemberRole.ADMIN : ChannelMemberRole.MEMBER, accumulator);
    }

    private void syncMemberships(
            CommChannel channel,
            Collection<OrganisationUserSummary> targetUsers,
            Function<OrganisationUserSummary, ChannelMemberRole> roleResolver,
            SyncAccumulator accumulator
    ) {
        Map<Long, OrganisationUserSummary> targets = targetUsers.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(OrganisationUserSummary::id, Function.identity(), (left, right) -> left, LinkedHashMap::new));

        Map<Long, CommChannelMember> existing = channelMemberRepository.findByChannel_IdAndEntrepriseId(channel.getId(), channel.getEntrepriseId()).stream()
                .collect(Collectors.toMap(member -> member.getId().getUserId(), Function.identity(), (left, right) -> left, LinkedHashMap::new));

        Instant now = Instant.now();
        for (OrganisationUserSummary user : targets.values()) {
            CommChannelMember member = existing.get(user.id());
            ChannelMemberRole desiredRole = roleResolver.apply(user);
            if (member == null) {
                member = new CommChannelMember();
                member.setId(new CommChannelMemberId(channel.getId(), user.id()));
                member.setChannel(channel);
                member.setEntrepriseId(channel.getEntrepriseId());
                member.setRole(desiredRole);
                member.setJoinedAt(now);
                member.setLeftAt(null);
                channelMemberRepository.save(member);
                accumulator.membersAdded++;
                continue;
            }

            boolean changed = false;
            if (member.getLeftAt() != null) {
                member.setLeftAt(null);
                changed = true;
                accumulator.membersAdded++;
            }
            if (member.getRole() != desiredRole) {
                member.setRole(desiredRole);
                changed = true;
            }
            if (changed) {
                channelMemberRepository.save(member);
            }
        }

        for (CommChannelMember member : existing.values()) {
            if (!targets.containsKey(member.getId().getUserId()) && member.getLeftAt() == null) {
                member.setLeftAt(now);
                channelMemberRepository.save(member);
                accumulator.membersRemoved++;
            }
        }
    }

    private Collection<OrganisationUserSummary> selectRhAndManagers(Collection<OrganisationUserSummary> activeUsers) {
        return activeUsers.stream()
                .filter(user -> hasRole(user, "RH") || hasRole(user, "MANAGER") || hasRole(user, "ADMIN"))
                .toList();
    }

    private Collection<OrganisationUserSummary> selectUsersByRoles(Collection<OrganisationUserSummary> activeUsers, Set<String> roles) {
        return activeUsers.stream()
                .filter(user -> roles.stream().anyMatch(role -> hasRole(user, role)))
                .toList();
    }

    private ChannelMemberRole resolveCompanyRole(OrganisationUserSummary user) {
        return hasRole(user, "ADMIN") || hasRole(user, "RH") ? ChannelMemberRole.MEMBER : ChannelMemberRole.READONLY;
    }

    private ChannelMemberRole resolveAnnouncementsRole(OrganisationUserSummary user) {
        return hasRole(user, "ADMIN") || hasRole(user, "RH") || hasRole(user, "MANAGER")
                ? ChannelMemberRole.ADMIN
                : ChannelMemberRole.READONLY;
    }

    private ChannelMemberRole resolveAdministrativeRole(OrganisationUserSummary user) {
        return hasRole(user, "ADMIN") ? ChannelMemberRole.OWNER : ChannelMemberRole.ADMIN;
    }

    private ChannelMemberRole resolveSmartRole(OrganisationUserSummary user) {
        return hasRole(user, "RH") || hasRole(user, "ADMIN") ? ChannelMemberRole.ADMIN : ChannelMemberRole.MEMBER;
    }

    private Set<Long> repairMembershipTenantMismatches(Long entrepriseId) {
        Set<Long> repairedUsers = new LinkedHashSet<>();
        for (CommChannelMember member : channelMemberRepository.findByChannelEntrepriseId(entrepriseId)) {
            Long expectedEntrepriseId = member.getChannel() == null ? null : member.getChannel().getEntrepriseId();
            if (!Objects.equals(member.getEntrepriseId(), expectedEntrepriseId) && expectedEntrepriseId != null) {
                member.setEntrepriseId(expectedEntrepriseId);
                channelMemberRepository.save(member);
                repairedUsers.add(member.getId().getUserId());
            }
        }
        return repairedUsers;
    }

    private Set<Long> findActiveMemberUserIds(Long entrepriseId) {
        return channelMemberRepository.findByChannelEntrepriseId(entrepriseId).stream()
                .filter(member -> member.getLeftAt() == null)
                .map(member -> member.getId().getUserId())
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private boolean hasRole(OrganisationUserSummary user, String role) {
        String normalizedRole = role == null ? "" : role.trim().toUpperCase();
        return user.roles() != null && user.roles().stream()
                .filter(Objects::nonNull)
                .map(value -> value.trim().toUpperCase())
                .map(value -> value.startsWith("ROLE_") ? value.substring("ROLE_".length()) : value)
                .anyMatch(normalizedRole::equals);
    }

    private void assertAdmin(CommunicationUserPrincipal currentUser) {
        boolean admin = currentUser.roles() != null && currentUser.roles().stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .map(String::toUpperCase)
                .map(value -> value.startsWith("ROLE_") ? value.substring("ROLE_".length()) : value)
                .anyMatch("ADMIN"::equals);
        if (!admin) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_ADMIN_REQUIRED",
                    "Administrator access is required for communication sync.", Map.of());
        }
    }

    private String slugify(String value) {
        if (value == null || value.isBlank()) {
            return UUID.randomUUID().toString();
        }
        return value.trim().toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
    }

    private record EnterpriseContext(
            Long entrepriseId,
            OrganisationEnterpriseSyncSnapshot snapshot,
            Map<Long, OrganisationUserSummary> activeUsers,
            List<OrganisationTeamSyncSnapshot> teams
    ) {
    }

    private static final class SyncAccumulator {
        private final Long entrepriseId;
        private int channelsCreated;
        private int channelsUpdated;
        private int channelsArchived;
        private int membersAdded;
        private int membersRemoved;
        private final List<String> warnings = new ArrayList<>();

        private SyncAccumulator(Long entrepriseId) {
            this.entrepriseId = entrepriseId;
        }
    }
}
