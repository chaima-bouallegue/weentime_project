export const environment = {
  production: false,
  apiUrl: 'http://localhost:8322/api/v1',
  gatewayUrl: 'http://localhost:8322',
  aiServiceUrl: 'http://localhost:8322/api/v1/ai',
  // Direct AI URL is for local debugging only. Do not store LLM/API provider keys in Angular.
  aiUrl: 'http://localhost:8000',
  // Set to true when the AI service runs with CHATBOT_PUBLIC_MODE=true.
  chatbotPublicMode: false,
  wsUrl: 'http://localhost:8322',
  websocket: {
    notifications: 'http://localhost:8322/ws/notifications',
    rh: 'http://localhost:8322/ws-rh',
    presence: 'http://localhost:8322/ws-presence',
    organisation: 'http://localhost:8322/ws-org',
    communication: 'http://localhost:8322/ws-communication',
  },
};
