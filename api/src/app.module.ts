import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ShipmentsModule } from './shipments/shipments.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    ShipmentsModule,
    InvoicesModule,
  ],
})
export class AppModule {}
