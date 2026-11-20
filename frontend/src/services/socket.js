import { io } from 'socket.io-client';

let socketInstance = null;

export function getSocket() {
  const token = localStorage.getItem('bfa_auth_token');
  if (!token) {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    return null;
  }

  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  // Derive host from VITE_API_URL or current location
  const rawApiUrl = import.meta.env.VITE_API_URL || '';
  let socketUrl = window.location.origin;

  if (rawApiUrl && rawApiUrl.startsWith('http')) {
    try {
      const parsed = new URL(rawApiUrl);
      socketUrl = parsed.origin;
    } catch {
      socketUrl = window.location.origin;
    }
  }

  socketInstance = io(socketUrl, {
    path: '/api/v1/socket.io',
    transports: ['websocket', 'polling'],
    auth: {
      token: `Bearer ${token}`,
    },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    autoConnect: true,
  });

  socketInstance.on('connect_error', (err) => {
    console.warn('[SOCKET] Connection warning:', err.message);
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
