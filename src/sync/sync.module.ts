import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ProductsService } from '../products/products.service';
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
  imports: [ProductsModule],
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
})
export class SyncModule {}
