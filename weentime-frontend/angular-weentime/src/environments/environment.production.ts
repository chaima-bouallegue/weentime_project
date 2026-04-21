export const environment = {
  production: true,
  apiUrl: 'http://localhost:8222',
  aiServiceUrl: 'http://localhost:8000',
  wsUrl: 'http://localhost:8222',
  anthropicApiKey: 'YOUR_ANTHROPIC_API_KEY_HERE',
  websocket: {
    notifications: 'http://localhost:8222/ws/notifications',
    rh: 'http://localhost:8222/ws-rh',
    presence: 'http://localhost:8222/ws-presence',
    organisation: 'http://localhost:8222/ws-org'
  }
};
