import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ProductsService } from '../products/products.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SYNC_RESOURCES } from './sync-resource.interface';
import { UsersResource } from './resources/users.resource';
import { CashSessionsResource } from './resources/cash-sessions.resource';
import { PromotionsResource } from './resources/promotions.resource';
import { PromotionProductsResource } from './resources/promotion-products.resource';
import { SalesResource } from './resources/sales.resource';
import { SaleItemsResource } from './resources/sale-items.resource';
import { SaleCancellationsResource } from './resources/sale-cancellations.resource';
import { InventoryMovementsResource } from './resources/inventory-movements.resource';
import { CashCutsResource } from './resources/cash-cuts.resource';
import { CashOutflowsResource } from './resources/cash-outflows.resource';

@Module({
  imports: [ProductsModule, RealtimeModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    UsersResource,
    CashSessionsResource,
    PromotionsResource,
    PromotionProductsResource,
    SalesResource,
    SaleItemsResource,
    SaleCancellationsResource,
    InventoryMovementsResource,
    CashCutsResource,
    CashOutflowsResource,
    {
      provide: SYNC_RESOURCES,
      useFactory: (
        products: ProductsService,
        users: UsersResource,
        cashSessions: CashSessionsResource,
        promotions: PromotionsResource,
        promotionProducts: PromotionProductsResource,
        sales: SalesResource,
        saleItems: SaleItemsResource,
        saleCancellations: SaleCancellationsResource,
        inventoryMovements: InventoryMovementsResource,
        cashCuts: CashCutsResource,
        cashOutflows: CashOutflowsResource,
      ) => [
        products,
        users,
        cashSessions,
        promotions,
        promotionProducts,
        sales,
        saleItems,
        saleCancellations,
        inventoryMovements,
        cashCuts,
        cashOutflows,
      ],
      inject: [
        ProductsService,
        UsersResource,
        CashSessionsResource,
        PromotionsResource,
        PromotionProductsResource,
        SalesResource,
        SaleItemsResource,
        SaleCancellationsResource,
        InventoryMovementsResource,
        CashCutsResource,
        CashOutflowsResource,
      ],
    },
  ],
  // Mobile-facing modules (sales, inventory, cash) reuse these directly so
  // there's exactly one write path per table — see SyncService's own
  // "single write path per resource" comment.
  exports: [
    SalesResource,
    SaleItemsResource,
    InventoryMovementsResource,
    CashSessionsResource,
    CashCutsResource,
    CashOutflowsResource,
  ],
})
export class SyncModule {}
