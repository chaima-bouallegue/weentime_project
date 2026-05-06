-- Task 14 reliability, workflow privacy, replay, and notification ownership.

create table if not exists communication.comm_events_stream (
    event_id uuid primary key,
    stream_order bigint generated always as identity,
    entreprise_id bigint not null,
    scope varchar(20) not null,
    recipient_user_id bigint,
    channel_id uuid,
    actor_id bigint,
    type varchar(80) not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamp not null default current_timestamp,
    replay_available_until timestamp not null default (current_timestamp + interval '7 days'),
    constraint chk_comm_events_stream_scope check (scope in ('CHANNEL', 'USER'))
);

create unique index if not exists uq_comm_events_stream_order
    on communication.comm_events_stream (stream_order);

create index if not exists idx_comm_events_stream_channel
    on communication.comm_events_stream (entreprise_id, channel_id, stream_order);

create index if not exists idx_comm_events_stream_user
    on communication.comm_events_stream (entreprise_id, recipient_user_id, stream_order);

create index if not exists idx_comm_events_stream_replay_retention
    on communication.comm_events_stream (replay_available_until);

create table if not exists communication.comm_message_history (
    id uuid primary key default gen_random_uuid(),
    message_id uuid not null,
    entreprise_id bigint not null,
    edited_by bigint not null,
    previous_body text,
    previous_rich_body jsonb,
    edited_at timestamp not null default current_timestamp,
    reason text,
    constraint fk_comm_message_history_message foreign key (message_id) references communication.comm_messages (id)
);

create index if not exists idx_comm_message_history_message_time
    on communication.comm_message_history (message_id, edited_at desc);

create index if not exists idx_comm_message_history_tenant_time
    on communication.comm_message_history (entreprise_id, edited_at desc);

create table if not exists communication.comm_user_notification_preferences (
    id uuid primary key default gen_random_uuid(),
    entreprise_id bigint not null,
    user_id bigint not null,
    direct_message_enabled boolean not null default true,
    mention_enabled boolean not null default true,
    reaction_enabled boolean not null default false,
    channel_notification_mode varchar(30) not null default 'ALL',
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    constraint uq_comm_user_notification_preferences unique (entreprise_id, user_id)
);

create index if not exists idx_comm_user_notification_preferences_tenant_user
    on communication.comm_user_notification_preferences (entreprise_id, user_id);

create unique index if not exists uq_comm_channels_workflow_demande_active
    on communication.comm_channels (entreprise_id, workflow_entity_id)
    where type = 'PRIVATE_WORKFLOW'
      and workflow_entity_type = 'DEMANDE'
      and is_archived = false;
