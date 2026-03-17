import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { InventoryService } from './inventory.service';

@Injectable()
export class ReservationExpirerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly intervalMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly inventoryService: InventoryService,
    private readonly logger: AppLogger
  ) {
    this.intervalMs = this.configService.get<number>('reservation.expireCheckIntervalMs', 15000);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.expireReservations();
    }, this.intervalMs);

    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async expireReservations(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.inventoryService.expireActiveReservationsBatch();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'Reservation expirer failed',
          error: (error as Error).message
        }),
        undefined,
        'reservation-expirer'
      );
    } finally {
      this.isRunning = false;
    }
  }
}
