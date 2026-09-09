import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { UniformExceptionFilter } from './http-safety/filters/uniform-exception.filter';
import { json, NextFunction, Request, Response, urlencoded } from 'express';
import { ConfigService } from '@nestjs/config';
import { API_GLOBAL_PREFIX } from './app.constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  app.use(json({ limit: '1mb', strict: true }));
  app.use(urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 }));
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.useGlobalFilters(app.get(UniformExceptionFilter));
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Facturify API')
    .setDescription('API multiempresa para integraciones de facturación electrónica.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', false);
  if (swaggerEnabled) SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(configService.get<number>('PORT', 3000));
}

void bootstrap();
