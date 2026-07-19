import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { BusinessesModule } from './businesses/businesses.module';
import { DevicesModule } from './devices/devices.module';
import { ProductsModule } from './products/products.module';
import { SyncModule } from './sync/sync.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InventoryModule } from './inventory/inventory.module';
import { CashModule } from './cash/cash.module';
import { SalesModule } from './sales/sales.module';
import { PlatformAdminsModule } from './platform-admins/platform-admins.module';
import { MetricsModule } from './metrics/metrics.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    PlatformAdminsModule,
    BusinessesModule,
    DevicesModule,
    ProductsModule,
    SyncModule,
    AuthModule,
    UsersModule,
    InventoryModule,
    CashModule,
    SalesModule,
    MetricsModule,
    ReportsModule,
  ],
})
export class AppModule {}
