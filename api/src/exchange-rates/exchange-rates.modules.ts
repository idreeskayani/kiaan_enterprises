import { Module } from '@nestjs/common';
import { ExchangeRatesController } from './exchange-rates.controller.js';

@Module({ controllers: [ExchangeRatesController] })
export class ExchangeRatesModule {}