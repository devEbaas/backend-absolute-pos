import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@ApiTags('admin/businesses')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businesses.findOne(id);
  }
}
