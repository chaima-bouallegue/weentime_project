export const environment = {
  production: true,
  apiUrl: 'http://localhost:8322/api/v1',
  gatewayUrl: 'http://localhost:8322',
  // Direct AI URL is a dev-only fallback; runtime calls use aiServiceUrl through the gateway.
  aiUrl: 'http://localhost:8000',
  aiServiceUrl: 'http://localhost:8322/api/v1/ai',
  // ML service (attendance anomaly detection).
  mlServiceUrl: 'http://127.0.0.1:8001',
  // Production keeps the chatbot fully authenticated. Demo/public mode must
  // remain disabled in production builds.
  chatbotPublicMode: false,
  smsOtpEnabled: false,

  // WebSocket base URL used when a specific channel URL is not provided.
  wsUrl: 'http://localhost:8322',
  websocket: {
    notifications: 'http://localhost:8322/ws/notifications',
    rh: 'http://localhost:8322/ws-rh',
    presence: 'http://localhost:8322/ws-presence',
    organisation: 'http://localhost:8322/ws-org',
    communication: 'http://localhost:8322/ws-communication',
  },
};
