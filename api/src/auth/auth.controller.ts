import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CreateUserDto, LoginDto, RegisterDto, UpdateUserDto } from './dto.js';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register-admin')
  registerAdmin(@Body() dto: RegisterDto) {
    return this.auth.bootstrapAdmin(dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  createUser(@Body() dto: CreateUserDto) {
    return this.auth.createUser(dto.email, dto.password, dto.role);
  }

    @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listUsers() {
    return this.auth.listUsers();
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.auth.updateUser(id, dto);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  deleteUser(@Param('id') id: string, @Req() req: any) {
    return this.auth.deleteUser(req.user.id, id);
  }

  @Post('users/:id/impersonate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  impersonate(@Param('id') id: string, @Req() req: any) {
    return this.auth.impersonate(req.user.id, id);
  }

  @Post('return-to-admin')
  @UseGuards(JwtAuthGuard)
  returnToAdmin(@Req() req: any) {
    if (!req.user.actor) throw new ForbiddenException('You are not switched from an admin account');
    return this.auth.returnToAdmin(req.user.actor);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any) {
    return req.user;
  }
}