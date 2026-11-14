import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller";
import { DatabaseService } from "./database/database.service";
import { SeedService } from "./database/seed.service";
import { AuthService } from "./auth/auth.service";
import { AuthGuard } from "./auth/auth.guard";
import { AuthChallengeService } from "./auth/auth-challenge.service";
import { MonitoringController } from "./monitoring/monitoring.controller";
import { MonitoringService } from "./monitoring/monitoring.service";
import { CommandReceiptService } from "./common/command-receipt.service";
import { PublisherProfileController } from "./publisher/publisher-profile.controller";
import { PublisherProfileService } from "./publisher/publisher-profile.service";
import { PaginationService } from "./common/pagination.service";
import { OutputQueryController } from "./outputs/output-query.controller";
import { OutputQueryService } from "./outputs/output-query.service";
import { AccountController } from "./account/account.controller";
import { AccountService } from "./account/account.service";
import { AdminMetadataController } from "./admin/admin-metadata.controller";
import { AdminMetadataService } from "./admin/admin-metadata.service";
import { PublicTravelService } from "./public-travel.service";

@Module({
  controllers: [
    AppController,
    MonitoringController,
    PublisherProfileController,
    OutputQueryController,
    AccountController,
    AdminMetadataController,
  ],
  providers: [
    DatabaseService,
    SeedService,
    AuthService,
    AuthChallengeService,
    MonitoringService,
    CommandReceiptService,
    PublisherProfileService,
    PaginationService,
    OutputQueryService,
    AccountService,
    AdminMetadataService,
    PublicTravelService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
