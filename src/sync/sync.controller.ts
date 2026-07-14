import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { SyncPushDto } from './dto/sync-push.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth('bearer')
@UseGuards(DeviceAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  push(@Req() req: Request, @Body() body: SyncPushDto) {
    return this.sync.push(req.device!.businessId, req.device!.id, body);
  }

  @Get('pull')
  pull(
    @Req() req: Request,
    @Query('since') since?: string,
    @Query('tables') tables?: string,
    @Query('limit') limit?: string,
  ) {
    const sinceNum = since ? parseInt(since, 10) : 0;
    const tableList = tables ? tables.split(',') : ['products'];
    const limitNum = limit ? Math.min(parseInt(limit, 10), 500) : 200;
    return this.sync.pull(
      req.device!.businessId,
      sinceNum,
      tableList,
      limitNum,
    );
  }
}
