import { Global, Module } from "@nestjs/common"
import { JwtVerifierService } from "./jwt-verifier.service"
import { AuthGuard } from "./auth.guard"
import { RolesGuard } from "./roles.guard"
import { UserDirectoryService } from "./user-directory.service"
import { UserDirectoryRepository } from "./user-directory.repository"

@Global()
@Module({
  providers: [
    JwtVerifierService,
    AuthGuard,
    RolesGuard,
    UserDirectoryService,
    UserDirectoryRepository,
  ],
  exports: [JwtVerifierService, UserDirectoryService],
})
export class AuthModule {}
