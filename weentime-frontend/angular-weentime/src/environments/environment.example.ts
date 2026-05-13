export const environment = {
  production: false,
  apiUrl: 'http://localhost:8322/api/v1',
  gatewayUrl: 'http://localhost:8322',
  aiServiceUrl: 'http://localhost:8322/api/v1/ai',
  // Direct AI URL is for local debugging only. Do not store LLM/API provider keys in Angular.
  aiUrl: 'http://localhost:8000',
  wsUrl: 'http://localhost:8322',
  websocket: {
    notifications: 'http://localhost:8322/ws/notifications',
    rh: 'http://localhost:8322/ws-rh',
    presence: 'http://localhost:8322/ws-presence',
    organisation: 'http://localhost:8322/ws-org',
    communication: 'http://localhost:8322/ws-communication',
  },
};
