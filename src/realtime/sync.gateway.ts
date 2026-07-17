import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { hashApiKey } from '../common/crypto.util';

interface RegisteredSocket extends WebSocket {
  businessId?: string;
  deviceId?: string;
}

// Notifica a las demás cajas del mismo negocio en cuanto una de ellas sube
// cambios, para que hagan un pull inmediato en vez de esperar su próximo
// ciclo de polling (hasta 5 min de backoff — ver worker.js del lado
// desktop). Puramente aditivo: si un dispositivo nunca se conecta aquí, el
// polling normal de /sync/pull sigue funcionando exactamente igual.
@WebSocketGateway({ path: '/ws' })
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SyncGateway.name);
  private readonly clientsByBusiness = new Map<string, Set<RegisteredSocket>>();

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: RegisteredSocket, request: IncomingMessage) {
    const token = this.extractToken(request.url);
    const device = token
      ? await this.prisma.device.findUnique({
          where: { apiKeyHash: hashApiKey(token) },
        })
      : null;

    if (!device || device.revokedAt) {
      client.close(4001, 'Token de dispositivo inválido');
      return;
    }

    client.businessId = device.businessId;
    client.deviceId = device.id;

    if (!this.clientsByBusiness.has(device.businessId)) {
      this.clientsByBusiness.set(device.businessId, new Set());
    }
    this.clientsByBusiness.get(device.businessId)!.add(client);
  }

  handleDisconnect(client: RegisteredSocket) {
    if (!client.businessId) return;
    this.clientsByBusiness.get(client.businessId)?.delete(client);
  }

  // Llamado desde SyncService.push() tras aplicar cambios aceptados de una
  // tabla — excluye al dispositivo que originó el push, solo sus hermanos
  // necesitan enterarse.
  notifyBusiness(businessId: string, excludeDeviceId: string, table: string) {
    const sockets = this.clientsByBusiness.get(businessId);
    if (!sockets?.size) return;

    const payload = JSON.stringify({ type: 'sync-changed', table });
    for (const socket of sockets) {
      if (socket.deviceId === excludeDeviceId) continue;
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(payload);
        } catch (err) {
          this.logger.warn(`Error enviando notificación de sync: ${err}`);
        }
      }
    }
  }

  private extractToken(url?: string): string | null {
    if (!url) return null;
    const query = url.split('?')[1];
    if (!query) return null;
    return new URLSearchParams(query).get('token');
  }
}
