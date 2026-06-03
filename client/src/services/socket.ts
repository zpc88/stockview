import { io, Socket } from 'socket.io-client';
import { StockQuote } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: StockQuote[]) => void>> = new Map();

  connect() {
    if (this.socket?.connected) return;

    this.socket = io('http://localhost:3001', {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('quotes', (quotes: StockQuote[]) => {
      this.listeners.forEach((listeners) => {
        listeners.forEach((cb) => cb(quotes));
      });
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  subscribe(symbols: string[]) {
    this.socket?.emit('subscribe', { symbols });
  }

  unsubscribe() {
    this.socket?.emit('unsubscribe');
  }

  onQuotes(id: string, callback: (quotes: StockQuote[]) => void) {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }
    this.listeners.get(id)!.add(callback);
  }

  offQuotes(id: string) {
    this.listeners.delete(id);
  }
}

export const socketService = new SocketService();
