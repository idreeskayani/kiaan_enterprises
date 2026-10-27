import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNumber, IsPositive } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

class SetRateDto {
  @IsNumber() @IsPositive() rate: number;
}

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OPERATOR, Role.ACCOUNTANT)
export class ExchangeRatesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.exchangeRate.findMany({ orderBy: { currency: 'asc' } });
  }

  // PKR per 1 unit of the currency, e.g. PUT /exchange-rates/GBP { "rate": 376 }
  @Put(':currency')
  @Roles(Role.ACCOUNTANT)
  set(@Param('currency') currency: string, @Body() dto: SetRateDto) {
    const code = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || code === 'PKR') {
      throw new BadRequestException('Use a 3-letter currency code other than PKR');
    }
    return this.prisma.exchangeRate.upsert({
      where: { currency: code },
      update: { rate: dto.rate },
      create: { currency: code, rate: dto.rate },
    });
  }

  @Delete(':currency')
  @Roles(Role.ACCOUNTANT)
  async remove(@Param('currency') currency: string) {
    await this.prisma.exchangeRate.deleteMany({ where: { currency: currency.trim().toUpperCase() } });
    return { deleted: true };
  }
}