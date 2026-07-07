export const environment = {
  production: true,
  apiUrl: 'http://localhost:8222/api/v1',
  gatewayUrl: 'http://localhost:8222',
  // AI chat runs as its own FastAPI service. Do not send /v2/chat through the
  // Spring gateway unless a dedicated gateway route is explicitly configured.
  aiServiceUrl: 'http://127.0.0.1:8000',
  aiUrl: 'http://127.0.0.1:8000',
  // ML service through the authenticated gateway.
  mlServiceUrl: 'http://localhost:8222',
  // Production keeps the chatbot fully authenticated. Demo/public mode must
  // remain disabled in production builds.
  chatbotPublicMode: false,
  smsOtpEnabled: false,

  // WebSocket base URL used when a specific channel URL is not provided.
  wsUrl: 'http://localhost:8222',
  websocket: {
    notifications: 'http://localhost:8222/ws/notifications',
    rh: 'http://localhost:8222/ws-rh',
    presence: 'http://localhost:8222/ws-presence',
    organisation: 'http://localhost:8222/ws-org',
    communication: 'http://localhost:8222/ws-communication',
  },
};
