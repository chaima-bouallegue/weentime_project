export type AssistantRole = 'user' | 'assistant' | 'system' | 'tool' | string;

export type AssistantIntent =
  | 'CREATE_LEAVE'
  | 'GET_LEAVE_BALANCE'
  | 'GET_MY_REQUESTS'
  | 'CREATE_AUTORISATION'
  | 'CREATE_TELEWORK'
  | 'REQUEST_DOCUMENT'
  | 'OPEN_DOCUMENT'
  | 'GET_NOTIFICATIONS'
  | 'GET_TEAM_REQUESTS'
  | 'GET_PENDING_VALIDATIONS'
  | 'APPROVE_REQUEST'
  | 'REJECT_REQUEST'
  | 'GET_RH_STATS'
  | 'GET_ALL_REQUESTS'
  | 'PROCESS_REQUEST'
  | string;

export interface AssistantMessage {
  id?: string;
  role: AssistantRole;
  content: string;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AssistantToolCall {
  name?: string;
  tool?: string;
  args?: Record<string, unknown> | null;
  arguments?: Record<string, unknown> | string | null;
  [key: string]: unknown;
}

export interface AssistantAction {
  type?: string;
  name?: string;
  label?: string;
  route?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AssistantActionResult {
  executed?: boolean;
  tool?: string;
  action?: string;
  status?: 'success' | 'failed' | 'pending' | string;
  message?: string;
  details?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface AssistantFormFill {
  mode?: 'create' | 'edit' | 'confirm' | string;
  auto_open?: boolean;
  route?: string;
  fields: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AssistantWorkflowStep {
  key: string;
  label?: string;
  text?: string;
  status?: 'success' | 'warning' | 'failed' | 'running' | string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface AssistantWorkflowState {
  workflow_id?: string | number | null;
  name?: string | null;
  status?: 'success' | 'failed' | 'running' | 'pending' | string | null;
  pending_step?: string | null;
  completed_steps?: string[];
  can_retry?: boolean;
  steps?: AssistantWorkflowStep[];
  [key: string]: unknown;
}

export interface AssistantResponseMeta {
  intent?: AssistantIntent | string;
  entities?: Record<string, unknown>;
  missing_fields?: string[];
  tool_call?: AssistantToolCall | null;
  action_result?: AssistantActionResult | null;
  form_fill?: AssistantFormFill | null;
  workflow?: AssistantWorkflowState | null;
  steps?: AssistantWorkflowStep[];
  [key: string]: unknown;
}

export interface AssistantResponse extends AssistantResponseMeta {
  success?: boolean;
  status?: string;
  type?: string;
  text?: string;
  message?: string;
  response?: string;
  error?: string;
  audio_url?: string | null;
}

interface AssistantDraftBase {
  id: string;
  mode?: string;
  autoOpen?: boolean;
  route?: string;
  actionResult?: AssistantActionResult | null;
}

export interface AssistantLeaveDraft extends AssistantDraftBase {
  dateDebut?: string;
  dateFin?: string;
  typeLabel?: string;
  typeCongeId?: number;
  motif?: string;
}

export interface AssistantAuthorizationDraft extends AssistantDraftBase {
  date?: string;
  heureDebut?: string;
  heureFin?: string;
  type?: string;
  motif?: string;
}

export interface AssistantTeleworkDraft extends AssistantDraftBase {
  dateDebut?: string;
  dateFin?: string;
  type?: string;
  motif?: string;
}

export interface AssistantDocumentDraft extends AssistantDraftBase {
  type?: string;
  motif?: string;
  moisConcerne?: string;
}
