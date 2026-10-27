import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // Only works while there are zero users: creates the first ADMIN.
  async bootstrapAdmin(email: string, password: string) {
    if ((await this.prisma.user.count()) > 0) {
      throw new ForbiddenException('Admin already exists. Log in instead.');
    }
    return this.createUser(email, password, Role.ADMIN);
  }

  async createUser(email: string, password: string, role: Role) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Email already registered');
    return this.prisma.user.create({
      data: { email, password: await bcrypt.hash(password, 10), role },
      select: { id: true, email: true, role: true },
    });
  }
listUsers() {
  return this.prisma.user.findMany({
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

async updateUser(id: string, dto: { email?: string; password?: string }) {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundException('User not found');
  if (dto.email && dto.email !== user.email) {
    const taken = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (taken) throw new ConflictException('Email already registered');
  }
  return this.prisma.user.update({
    where: { id },
    data: {
      ...(dto.email ? { email: dto.email } : {}),
      ...(dto.password ? { password: await bcrypt.hash(dto.password, 10) } : {}),
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });
}
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, user: { id: user.id, email: user.email, role: user.role } };
  }
}
