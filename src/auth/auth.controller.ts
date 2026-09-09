import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import {
  AdminRole,
  BootstrapAdminDto,
  CreateAdminDto,
} from './dto/register-admin.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RequestId } from '../http-safety/decorators/request-id.decorator';

@ApiTags('Auth (Facturify Admins)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap')
  @ApiOperation({
    summary: 'Bootstrap initial Facturify SuperAdmin',
    description: 'Can only be executed once when zero administrators exist. Requires secret BOOTSTRAP_ADMIN_TOKEN.',
  })
  @ApiCreatedResponse({ description: 'Initial SuperAdmin created successfully.' })
  async bootstrap(@Body() dto: BootstrapAdminDto, @RequestId() requestId?: string) {
    return this.authService.bootstrapInitialAdmin(dto, requestId);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPERADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new administrator (Requires SUPERADMIN JWT)',
    description: 'Only authenticated SUPERADMIN users can create new admin accounts.',
  })
  @ApiCreatedResponse({ description: 'Admin registered successfully.' })
  async register(
    @CurrentUser() creator: JwtPayload,
    @Body() dto: CreateAdminDto,
    @RequestId() requestId?: string,
  ) {
    return this.authService.createAdmin(creator, dto, requestId);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in as a Facturify admin to obtain a JWT' })
  @ApiOkResponse({ description: 'Admin authenticated, returns JWT token.' })
  async login(@Body() dto: LoginDto, @RequestId() requestId?: string) {
    return this.authService.login(dto, requestId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current admin profile (Requires Admin JWT)' })
  @ApiOkResponse({ description: 'Current authenticated admin profile.' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
