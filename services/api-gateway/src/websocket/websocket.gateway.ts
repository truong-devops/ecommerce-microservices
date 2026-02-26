import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway
} from '@nestjs/websockets';

@WebSocketGateway({ cors: { origin: '*' } })
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  handleConnection(client: unknown): void {
    this.logger.log(`WebSocket client connected: ${String(client)}`);
  }

  handleDisconnect(client: unknown): void {
    this.logger.log(`WebSocket client disconnected: ${String(client)}`);
  }
}
