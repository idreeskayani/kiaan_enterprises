import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ExchangeRatesModule} from './exchange-rates/exchange-rates.modules.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ShipmentsModule } from './shipments/shipments.module.js';
import { ClearanceModule } from './clearance/clearance.module.js';
import { QuotationsModule } from './quotations/quotations.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    ExchangeRatesModule,
    ShipmentsModule,
    InvoicesModule,
    ClearanceModule,
    QuotationsModule,
  ],
})
export class AppModule {}