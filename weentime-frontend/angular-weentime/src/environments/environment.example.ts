export const environment = {
  production: false,
  apiUrl: 'http://localhost:8322/api/v1',
  gatewayUrl: 'http://localhost:8322',
  // AI chat runs as its own FastAPI service. Do not store LLM/API provider keys in Angular.
  aiServiceUrl: 'http://127.0.0.1:8000',
  aiUrl: 'http://127.0.0.1:8000',
  // ML service (anomalies présence) — port 8001, distinct de ai-service.
  mlServiceUrl: 'http://localhost:8322',
  // Set to true when the AI service runs with CHATBOT_PUBLIC_MODE=true.
  chatbotPublicMode: false,
  smsOtpEnabled: false,
  wsUrl: 'http://localhost:8322',
  websocket: {
    notifications: 'http://localhost:8322/ws/notifications',
    rh: 'http://localhost:8322/ws-rh',
    presence: 'http://localhost:8322/ws-presence',
    organisation: 'http://localhost:8322/ws-org',
    communication: 'http://localhost:8322/ws-communication',
  },
};
