import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

// Gated by DeviceAuthGuard: the mobile install authenticates itself first
// (device api key, provisioned the same way as an Electron install — see
// DEPLOY.md), which resolves *which business* the username/password pair
// is checked against. Success returns a JWT for every other mobile-facing
// endpoint, so the device key itself only ever needs to be sent here.
@ApiTags('auth')
@ApiBearerAuth('bearer')
@UseGuards(DeviceAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Req() req: Request, @Body() dto: LoginDto) {
    return this.auth.login(
      req.device!.businessId,
      req.device!.id,
      dto.username,
      dto.password,
    );
  }
}
