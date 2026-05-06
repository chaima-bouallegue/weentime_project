-- Task 13 hardening for provisioning, unread, notifications, and durable dispatch.

create unique index if not exists uq_comm_channels_company_active
    on communication.comm_channels (entreprise_id, type)
    where type = 'COMPANY' and is_archived = false;

create unique index if not exists uq_comm_channels_smart_workflow_active
    on communication.comm_channels (entreprise_id, workflow_type, type)
    where type = 'SMART' and workflow_type is not null and is_archived = false;

alter table communication.comm_events_outbox
    add column if not exists idempotency_key varchar(180),
    add column if not exists max_attempts int not null default 5,
    add column if not exists updated_at timestamp not null default current_timestamp;

create unique index if not exists uq_comm_outbox_idempotency_key
    on communication.comm_events_outbox (idempotency_key)
    where idempotency_key is not null;

create index if not exists idx_comm_outbox_pending_attempt
    on communication.comm_events_outbox (status, next_attempt_at, created_at);

create table if not exists communication.comm_notification_events (
    id uuid primary key default gen_random_uuid(),
    notification_event_id varchar(180) not null,
    entreprise_id bigint not null,
    recipient_id bigint not null,
    event_type varchar(80) not null,
    group_key varchar(180),
    channel_id uuid,
    message_id uuid,
    payload jsonb not null default '{}'::jsonb,
    status varchar(30) not null default 'PENDING',
    attempt_count int not null default 0,
    last_error text,
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    sent_at timestamp,
    constraint uq_comm_notification_event_id unique (notification_event_id)
);

create index if not exists idx_comm_notification_group
    on communication.comm_notification_events (entreprise_id, recipient_id, group_key, created_at desc);

create index if not exists idx_comm_notification_status
    on communication.comm_notification_events (status, created_at);
