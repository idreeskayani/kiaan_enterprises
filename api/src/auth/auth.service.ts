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
  async deleteUser(adminId: string, id: string) {
    if (id === adminId) throw new ForbiddenException('You cannot delete your own account');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === Role.ADMIN) throw new ForbiddenException('Admin accounts cannot be deleted');
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (e: any) {
      // P2003 = the user is referenced by shipment / clearance history
      if (e?.code === 'P2003') {
        throw new ConflictException('This user has recorded activity (status history), so it cannot be deleted.');
      }
      throw e;
    }
    return { deleted: true };
  }

  // Admin switches into another account. The token remembers the admin (act) so they can return.
  async impersonate(adminId: string, targetId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === Role.ADMIN) throw new ForbiddenException('You cannot switch into an admin account');
    return this.issue(target, adminId);
  }

  async returnToAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== Role.ADMIN) throw new ForbiddenException('Admin account not found');
    return this.issue(admin);
  }

  private async issue(user: { id: string; email: string; role: Role }, actor?: string) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(actor ? { act: actor } : {}),
    });
    return { accessToken, user: { id: user.id, email: user.email, role: user.role } };
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