import { Module } from '@nestjs/common';
import {
  WebQuoteRequestsAdminController,
  WebQuoteRequestsPublicController,
} from './web-quote-requests.controller';
import { WebQuoteRequestsService } from './web-quote-requests.service';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';

@Module({
  imports: [PlatformAdminsModule],
  controllers: [
    WebQuoteRequestsPublicController,
    WebQuoteRequestsAdminController,
  ],
  providers: [WebQuoteRequestsService],
})
export class WebQuoteRequestsModule {}
