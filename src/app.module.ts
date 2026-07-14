import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { BusinessesModule } from './businesses/businesses.module';
import { DevicesModule } from './devices/devices.module';
import { ProductsModule } from './products/products.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    BusinessesModule,
    DevicesModule,
    ProductsModule,
    SyncModule,
  ],
})
export class AppModule {}
