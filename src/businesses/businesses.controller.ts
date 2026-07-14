import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MasterKeyGuard } from '../common/guards/master-key.guard';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@ApiTags('admin/businesses')
@ApiBearerAuth('bearer')
@UseGuards(MasterKeyGuard)
@Controller('admin/businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Post()
  create(@Body() dto: CreateBusinessDto) {
    return this.businesses.create(dto);
  }

  @Get()
  findAll() {
    return this.businesses.findAll();
  }
}
