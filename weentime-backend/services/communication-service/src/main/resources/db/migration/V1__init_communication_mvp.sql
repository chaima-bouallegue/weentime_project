-- WeenTime Communication MVP foundation.
-- TODO before production scale: partition communication.comm_messages monthly by created_at.

create schema if not exists communication;
create extension if not exists pgcrypto;

create table if not exists communication.comm_channels (
    id uuid primary key default gen_random_uuid(),
    entreprise_id bigint not null,
    type varchar(40) not null,
    visibility varchar(40) not null,
    slug varchar(120),
    name varchar(180) not null,
    description text,
    equipe_id bigint,
    workflow_type varchar(60),
    workflow_entity_type varchar(60),
    workflow_entity_id varchar(80),
    is_private boolean not null default true,
    is_archived boolean not null default false,
    created_by bigint not null,
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    archived_at timestamp
);

create unique index if not exists uq_comm_channels_slug_active
    on communication.comm_channels (entreprise_id, lower(slug))
    where slug is not null and is_archived = false;

create unique index if not exists uq_comm_channels_team_type
    on communication.comm_channels (entreprise_id, equipe_id, type)
    where type = 'TEAM' and equipe_id is not null;

create index if not exists idx_comm_channels_tenant_type
    on communication.comm_channels (entreprise_id, type);

create index if not exists idx_comm_channels_team
    on communication.comm_channels (entreprise_id, equipe_id);

create index if not exists idx_comm_channels_workflow
    on communication.comm_channels (entreprise_id, workflow_entity_type, workflow_entity_id);

create table if not exists communication.comm_channel_members (
    channel_id uuid not null,
    user_id bigint not null,
    entreprise_id bigint not null,
    role varchar(30) not null,
    notification_level varchar(30) default 'ALL',
    last_read_message_id uuid,
    last_read_at timestamp,
    joined_at timestamp not null default current_timestamp,
    left_at timestamp,
    is_muted boolean not null default false,
    is_pinned boolean not null default false,
    primary key (channel_id, user_id),
    constraint fk_comm_members_channel foreign key (channel_id) references communication.comm_channels (id)
);

create index if not exists idx_comm_members_user
    on communication.comm_channel_members (entreprise_id, user_id, left_at);

create index if not exists idx_comm_members_channel_active
    on communication.comm_channel_members (channel_id, left_at);

create table if not exists communication.comm_direct_channel_participants (
    channel_id uuid primary key,
    entreprise_id bigint not null,
    participant_hash varchar(128) not null,
    participant_count int not null,
    constraint fk_comm_direct_channel foreign key (channel_id) references communication.comm_channels (id)
);

create unique index if not exists uq_comm_direct_participant_hash
    on communication.comm_direct_channel_participants (entreprise_id, participant_hash);

create table if not exists communication.comm_messages (
    id uuid primary key default gen_random_uuid(),
    entreprise_id bigint not null,
    channel_id uuid not null,
    sender_id bigint,
    parent_message_id uuid,
    type varchar(40) not null,
    body text,
    rich_body jsonb,
    status varchar(40) not null default 'ACTIVE',
    client_message_id varchar(120),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    edited_at timestamp,
    deleted_at timestamp,
    deleted_by bigint,
    constraint fk_comm_messages_channel foreign key (channel_id) references communication.comm_channels (id),
    constraint fk_comm_messages_parent foreign key (parent_message_id) references communication.comm_messages (id)
);

create index if not exists idx_comm_messages_channel_cursor
    on communication.comm_messages (entreprise_id, channel_id, created_at desc, id desc);

create index if not exists idx_comm_messages_thread_cursor
    on communication.comm_messages (entreprise_id, parent_message_id, created_at asc, id asc);

create index if not exists idx_comm_messages_tenant_sender
    on communication.comm_messages (entreprise_id, sender_id, created_at desc);

create unique index if not exists uq_comm_messages_client_id
    on communication.comm_messages (entreprise_id, sender_id, client_message_id)
    where client_message_id is not null;

create table if not exists communication.comm_reactions (
    message_id uuid not null,
    entreprise_id bigint not null,
    user_id bigint not null,
    emoji varchar(64) not null,
    created_at timestamp not null default current_timestamp,
    primary key (message_id, user_id, emoji),
    constraint fk_comm_reactions_message foreign key (message_id) references communication.comm_messages (id)
);

create table if not exists communication.comm_threads (
    root_message_id uuid primary key,
    entreprise_id bigint not null,
    channel_id uuid not null,
    reply_count int not null default 0,
    last_reply_id uuid,
    last_reply_at timestamp,
    participant_count int not null default 0,
    updated_at timestamp not null default current_timestamp,
    constraint fk_comm_threads_root foreign key (root_message_id) references communication.comm_messages (id),
    constraint fk_comm_threads_channel foreign key (channel_id) references communication.comm_channels (id)
);

create index if not exists idx_comm_threads_channel_updated
    on communication.comm_threads (channel_id, updated_at desc);

create table if not exists communication.comm_audit_log (
    id uuid primary key default gen_random_uuid(),
    entreprise_id bigint not null,
    entity_type varchar(60) not null,
    entity_id varchar(120) not null,
    action varchar(80) not null,
    actor_id bigint not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamp not null default current_timestamp
);

create index if not exists idx_comm_audit_log_tenant_entity
    on communication.comm_audit_log (entreprise_id, entity_type, entity_id, created_at desc);

create table if not exists communication.comm_events_outbox (
    id uuid primary key default gen_random_uuid(),
    entreprise_id bigint not null,
    aggregate_type varchar(60) not null,
    aggregate_id varchar(120) not null,
    event_type varchar(80) not null,
    payload jsonb not null default '{}'::jsonb,
    status varchar(30) not null default 'PENDING',
    retry_count int not null default 0,
    next_attempt_at timestamp,
    sent_at timestamp,
    failure_reason text,
    created_at timestamp not null default current_timestamp
);

create index if not exists idx_comm_outbox_status_time
    on communication.comm_events_outbox (status, created_at);
